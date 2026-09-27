import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { logosDir } from '../config/rutas.js';
import type { FotografoFila } from '../db/catalogo.repository.js';

// Los logos nunca los aporta el usuario: los genera la aplicación la primera vez que se
// piden y quedan guardados en datos/logos (no se anotan en la base de datos).
//
// Genera el logo "tipo firma" de un fotógrafo: su nombreInformal en letra manuscrita
// con un subrayado de trazo de plumilla. El texto se convierte a
// trazos vectoriales para que el SVG no dependa de fuentes externas (un <img> no puede
// cargarlas). Las fuentes viven en backend/assets/fonts y se incluyen en la imagen Docker.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.resolve(__dirname, '../../assets/fonts');

const script = opentype.loadSync(path.join(fontsDir, 'MrsSaintDelafield-Regular.ttf'));

// Color de tinta pensado para el fondo oscuro del frontend (--color-text).
const TINTA = '#f2f1ed';

const NOMBRE_SIZE = 150;
const NOMBRE_BASELINE = 150;
// Cuánto se adelgaza cada borde de las letras para que el trazo sea más fino que el de la
// fuente. Se hace con un filtro de erosión sobre el texto ya unido (los glifos manuscritos se
// solapan, así que recortar el contorno de cada uno dejaría marcas en las uniones).
const EROSION_TRAZO = 1;

// Subrayado como trazo de plumilla: línea central cúbica y grosor variable que entra
// rápido, se ensancha y se afina hasta un hilo al final.
function subrayado(x0: number, x1: number, yIzq: number, yDer: number): string {
  const p = [
    [x0, yIzq],
    [x0 + (x1 - x0) * 0.3, yIzq - 6],
    [x0 + (x1 - x0) * 0.7, yDer + 14],
    [x1, yDer],
  ];
  const bez = (t: number, i: number) =>
    (1 - t) ** 3 * p[0][i] + 3 * (1 - t) ** 2 * t * p[1][i] + 3 * (1 - t) * t ** 2 * p[2][i] + t ** 3 * p[3][i];

  const pasos = 120;
  const arriba: string[] = [];
  const abajo: string[] = [];
  for (let k = 0; k <= pasos; k++) {
    const t = k / pasos;
    const dx = bez(Math.min(t + 1e-3, 1), 0) - bez(Math.max(t - 1e-3, 0), 0);
    const dy = bez(Math.min(t + 1e-3, 1), 1) - bez(Math.max(t - 1e-3, 0), 1);
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    const mitad = 0.25 + 2.4 * Math.sin((Math.PI * Math.min(t / 0.25, 1)) / 2) * (1 - t) ** 1.3;
    const x = bez(t, 0);
    const y = bez(t, 1);
    arriba.push(`${(x + nx * mitad).toFixed(2)},${(y + ny * mitad).toFixed(2)}`);
    abajo.push(`${(x - nx * mitad).toFixed(2)},${(y - ny * mitad).toFixed(2)}`);
  }
  return `M${arriba.join('L')}L${abajo.reverse().join('L')}Z`;
}

function escaparXml(texto: string): string {
  return texto.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
}

export function generarLogo(firma: string): string {
  const nombrePath = script.getPath(firma, 20, NOMBRE_BASELINE, NOMBRE_SIZE);
  const bb = nombrePath.getBoundingBox();

  const x0 = bb.x1 + 20;
  const x1 = bb.x2 + 30;
  const minX = Math.floor(Math.min(bb.x1, x0)) - 6;
  const minY = Math.floor(bb.y1) - 6;
  const ancho = Math.ceil(Math.max(bb.x2, x1) + 6 - minX);
  // El subrayado llega hasta y≈197; los rasgos descendentes pueden bajar más.
  const alto = Math.max(200, Math.ceil(bb.y2) + 6) - minY;
  const titulo = escaparXml(firma);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${ancho} ${alto}" role="img" aria-label="${titulo}">
  <title>${titulo}</title>
  <filter id="afinar" filterUnits="userSpaceOnUse" x="${minX}" y="${minY}" width="${ancho}" height="${alto}">
    <feMorphology operator="erode" radius="${EROSION_TRAZO}"/>
  </filter>
  <g fill="${TINTA}">
    <path d="${nombrePath.toPathData(2)}" filter="url(#afinar)"/>
    <path d="${subrayado(x0, x1, 192, 156)}"/>
  </g>
</svg>
`;
}

export function rutaLogo(nombreInformalNormalizado: string): string {
  return path.join(logosDir, `${nombreInformalNormalizado}.svg`);
}

// Devuelve la ruta en disco del logo del fotógrafo: datos/logos/<nombreInformalNormalizado>.svg
// ("Santi Estévez" -> santi-estevez.svg). Si no existe, se genera con el nombreInformal como
// firma. Al cambiar el nombreInformal, cambiarNombreInformal() borra el logo anterior.
export function asegurarLogo(fotografo: Pick<FotografoFila, 'nombreInformal' | 'nombreInformalNormalizado'>): string {
  const ruta = rutaLogo(fotografo.nombreInformalNormalizado);
  if (!existsSync(ruta)) {
    mkdirSync(logosDir, { recursive: true });
    writeFileSync(ruta, generarLogo(fotografo.nombreInformal), 'utf-8');
  }
  return ruta;
}

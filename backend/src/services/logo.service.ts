import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import type { Fotografo } from '../types/album.js';
import { datosDir, guardarOrganizacion } from './organizacion.service.js';

// Los logos nunca los aporta el usuario: los genera la aplicación la primera vez que se
// piden y quedan guardados en datos/logos, referenciados desde organizacionFotos.json.
//
// Genera el logo "tipo firma" de un fotógrafo: nombre en letra manuscrita, subrayado con
// trazo de plumilla y subtítulo opcional en versalitas espaciadas. El texto se convierte a
// trazos vectoriales para que el SVG no dependa de fuentes externas (un <img> no puede
// cargarlas). Las fuentes viven en backend/assets/fonts y se incluyen en la imagen Docker.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.resolve(__dirname, '../../assets/fonts');

const script = opentype.loadSync(path.join(fontsDir, 'MrsSaintDelafield-Regular.ttf'));
const sans = opentype.loadSync(path.join(fontsDir, 'Inter-Variable.ttf'));

// Color de tinta pensado para el fondo oscuro del frontend (--color-text).
const TINTA = '#f2f1ed';

const NOMBRE_SIZE = 150;
const NOMBRE_BASELINE = 150;
const SUBTITULO_SIZE = 17;
const SUBTITULO_TRACKING = 4.5;

// Texto con espaciado entre letras (opentype.js no admite letter-spacing).
function textoEspaciado(font: opentype.Font, texto: string, x: number, y: number) {
  let d = '';
  let cx = x;
  for (const ch of texto) {
    const glyph = font.charToGlyph(ch);
    d += glyph.getPath(cx, y, SUBTITULO_SIZE).toPathData(2);
    cx += ((glyph.advanceWidth ?? 0) * SUBTITULO_SIZE) / font.unitsPerEm + SUBTITULO_TRACKING;
  }
  return { d, width: cx - x - SUBTITULO_TRACKING };
}

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
    const mitad = 0.4 + 4.6 * Math.sin((Math.PI * Math.min(t / 0.25, 1)) / 2) * (1 - t) ** 1.3;
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

export function generarLogo(nombre: string, subtitulo?: string): string {
  const nombrePath = script.getPath(nombre, 20, NOMBRE_BASELINE, NOMBRE_SIZE);
  const bb = nombrePath.getBoundingBox();

  const x0 = bb.x1 + 20;
  const x1 = bb.x2 + 30;
  let yFinal = 200;
  let subtituloPath = '';
  if (subtitulo) {
    const texto = subtitulo.toUpperCase();
    const { width } = textoEspaciado(sans, texto, 0, 0);
    // Por debajo de los rasgos descendentes del nombre para que no se solapen.
    const y = Math.max(214, Math.ceil(bb.y2) + 24);
    subtituloPath = textoEspaciado(sans, texto, x1 - width - 4, y).d;
    yFinal = y + 8;
  }

  const minX = Math.floor(Math.min(bb.x1, x0)) - 6;
  const minY = Math.floor(bb.y1) - 6;
  const ancho = Math.ceil(Math.max(bb.x2, x1) + 6 - minX);
  const alto = Math.max(yFinal, Math.ceil(bb.y2) + 6) - minY;
  const titulo = escaparXml(nombre);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${ancho} ${alto}" role="img" aria-label="${titulo}">
  <title>${titulo}</title>
  <g fill="${TINTA}">
    <path d="${nombrePath.toPathData(2)}" stroke="${TINTA}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${subrayado(x0, x1, 192, 156)}"/>${subtituloPath ? `\n    <path d="${subtituloPath}"/>` : ''}
  </g>
</svg>
`;
}

const logosDir = path.join(datosDir, 'logos');

// Devuelve la ruta en disco del logo del fotógrafo. Si el JSON ya lo referencia y el
// archivo existe, se usa tal cual; si no, se genera, se guarda en datos/logos/<slug>.svg
// y se añade la referencia en organizacionFotos.json.
export function asegurarLogo(slug: string, fotografo: Fotografo): string {
  if (fotografo.logo) {
    const existente = path.join(logosDir, fotografo.logo);
    if (existsSync(existente)) {
      return existente;
    }
  }

  const archivo = `${slug}.svg`;
  mkdirSync(logosDir, { recursive: true });
  writeFileSync(path.join(logosDir, archivo), generarLogo(fotografo.nombre, fotografo.logoSubtitulo), 'utf-8');
  fotografo.logo = archivo;
  guardarOrganizacion();
  return path.join(logosDir, archivo);
}

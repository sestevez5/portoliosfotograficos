import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fotosDir, miniaturasDir } from '../config/rutas.js';
import { convertirAAvif, esAvif, LADO_MAXIMO_FOTO } from '../utils/foto-avif.js';

// Versiones de las fotos para la web. Las fotos se guardan en AVIF de alta resolución (3840 px de lado
// largo como máximo, ver utils/foto-avif.ts), que es lo que muestra el visor a pantalla completa; para
// las cuadrículas y portadas hay una miniatura AVIF de 960 px de ancho, reducida con un buen filtro
// (Lanczos, el de sharp por defecto) para que el navegador no tenga que reducir al vuelo una foto de
// 3840 px a 300 con un filtro rápido que deja dientes de sierra y grano. Nunca se amplía.
//
// Se piden como la foto más ?ancho=<ancho> (/photos/<fotógrafo>/<portfolio>/<colección>/<fichero>?ancho=960):
// - 960: la miniatura, que se genera la primera vez en datos/miniaturas/960/<misma ruta> y se vuelve a
//   generar si la foto es más reciente. Borrar la carpeta datos/miniaturas no pierde nada.
// - 3840: la foto tal cual. Solo si es una foto antigua, aún sin convertir a AVIF (ver
//   npm run fotos:convertir), se genera su versión grande en datos/miniaturas/3840.

export const ANCHOS_MINIATURA = [960, LADO_MAXIMO_FOTO] as const;
export type AnchoMiniatura = (typeof ANCHOS_MINIATURA)[number];

// Calidad AVIF de la miniatura: la más baja en la que, comparada al 100 % con la foto reducida sin
// pérdidas (fotos con mucho grano incluidas), no se aprecian diferencias.
const CALIDAD_MINIATURA = 75;

// Sin la caché de sharp: guarda las imágenes que abre y deja sus ficheros abiertos, y en Windows eso
// impide sobrescribir, renombrar o eliminar después las fotos (y las carpetas) que se han reducido.
sharp.cache(false);

// Generaciones en curso, para no generar dos veces la misma miniatura si llegan dos peticiones a la vez.
const enCurso = new Map<string, Promise<string>>();

// Ruta de la foto a partir de la ruta pedida (relativa a /photos, con los segmentos ya decodificados).
// null si no es una foto válida: fuera de la carpeta de fotos, un segmento oculto (con punto:
// papeleras, subidas a medias) o un fichero que no existe.
function rutaFoto(relativa: string): string | null {
  const segmentos = relativa.split('/').filter(Boolean);
  if (segmentos.length === 0 || segmentos.some((s) => s.startsWith('.') || s.includes('\\'))) {
    return null;
  }
  const ruta = path.join(fotosDir, ...segmentos);
  if (!ruta.startsWith(fotosDir + path.sep) || !existsSync(ruta) || !statSync(ruta).isFile()) {
    return null;
  }
  return ruta;
}

async function generar(foto: string, destino: string, ancho: AnchoMiniatura): Promise<string> {
  mkdirSync(path.dirname(destino), { recursive: true });
  const temporal = `${destino}.${process.pid}.${Date.now()}.tmp`;
  try {
    if (ancho === LADO_MAXIMO_FOTO) {
      writeFileSync(temporal, (await convertirAAvif(foto)).datos);
    } else {
      await sharp(foto)
        .rotate() // según la orientación EXIF (solo las fotos antiguas, sin convertir, la tienen)
        .resize({ width: ancho, withoutEnlargement: true })
        .withIccProfile('srgb') // sin el resto de metadatos
        // 4:4:4: sin submuestrear el color, que en AVIF ahorra poco y emborrona los bordes de color.
        .avif({ quality: CALIDAD_MINIATURA, effort: 4, chromaSubsampling: '4:4:4' })
        .toFile(temporal);
    }
    renameSync(temporal, destino);
  } catch (error) {
    rmSync(temporal, { force: true });
    throw error;
  }
  return destino;
}

// Ruta del fichero con la versión de la foto (relativa a /photos) al ancho indicado, generándola si
// hace falta. null si la foto no existe (la petición sigue su curso y acaba en 404).
export async function miniatura(relativa: string, ancho: AnchoMiniatura): Promise<string | null> {
  const foto = rutaFoto(relativa);
  if (!foto) {
    return null;
  }
  if (ancho === LADO_MAXIMO_FOTO && esAvif(foto)) {
    return foto; // la foto ya es la versión grande
  }
  const relativaFoto = path.relative(fotosDir, foto);
  const destino = path.join(miniaturasDir, String(ancho), esAvif(foto) ? relativaFoto : `${relativaFoto}.avif`);
  if (existsSync(destino) && statSync(destino).mtimeMs >= statSync(foto).mtimeMs) {
    return destino;
  }

  let generando = enCurso.get(destino);
  if (!generando) {
    generando = generar(foto, destino, ancho).finally(() => enCurso.delete(destino));
    enCurso.set(destino, generando);
  }
  return generando;
}

// Borra las miniaturas de una foto o de una carpeta entera (de un fotógrafo, portfolio o colección),
// con su ruta relativa a la carpeta de fotos. Se llama al eliminar o renombrar: si no, quedarían
// ocupando sitio (no se verían: sin la original ya no se sirven).
export function borrarMiniaturas(relativa: string): void {
  for (const ancho of ANCHOS_MINIATURA) {
    try {
      const carpeta = path.join(miniaturasDir, String(ancho));
      // Una carpeta (fotógrafo, portfolio, colección) o una foto (si es antigua, sin convertir, su
      // versión lleva .avif detrás).
      rmSync(path.join(carpeta, relativa), { recursive: true, force: true });
      rmSync(path.join(carpeta, `${relativa}.avif`), { force: true });
    } catch (error) {
      console.warn(`Aviso: no se han podido borrar las miniaturas de ${relativa}:`, (error as Error).message);
    }
  }
}

// Borra lo que ya no se usa de datos/miniaturas, para que no ocupe sitio: las carpetas de los anchos
// que ya no se generan (hasta la 2.2, JPEG de 480, 960, 1600 y 2400 px) y, en las de los anchos
// actuales, los ficheros que no son AVIF (los JPEG de 960 de antes y temporales que hayan quedado de
// una generación interrumpida). Se llama al arrancar.
export function borrarAnchosObsoletos(): void {
  if (!existsSync(miniaturasDir)) {
    return;
  }
  const vigentes = ANCHOS_MINIATURA.map(String);
  for (const carpeta of readdirSync(miniaturasDir)) {
    const ruta = path.join(miniaturasDir, carpeta);
    try {
      if (!vigentes.includes(carpeta)) {
        rmSync(ruta, { recursive: true, force: true });
        continue;
      }
      for (const fichero of readdirSync(ruta, { recursive: true, withFileTypes: true })) {
        if (fichero.isFile() && !fichero.name.endsWith('.avif')) {
          rmSync(path.join(fichero.parentPath, fichero.name), { force: true });
        }
      }
    } catch (error) {
      console.warn(`Aviso: no se han podido borrar las miniaturas antiguas de ${carpeta}:`, (error as Error).message);
    }
  }
}

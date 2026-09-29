import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fotosDir, miniaturasDir } from '../config/rutas.js';

// Versiones reducidas de las fotos, para que el navegador no tenga que reducir al vuelo una foto de
// 4000 px a 300: lo hace con un filtro rápido que deja dientes de sierra y grano, y además descarga
// varios MB por foto. Aquí se reducen con un buen filtro (Lanczos, el de sharp por defecto) a unos
// pocos anchos fijos, y la web los ofrece con srcset para que el navegador elija el más cercano al
// tamaño en que la muestra (teniendo en cuenta la densidad de la pantalla).
//
// Se piden como la foto original más ?ancho=<ancho> (/photos/<fotógrafo>/<portfolio>/<colección>/
// <fichero>?ancho=960) y se generan la primera vez, en datos/miniaturas/<ancho>/<misma ruta>. Si la
// foto original es más reciente que la miniatura, se vuelve a generar. Borrar la carpeta
// datos/miniaturas no pierde nada.

export const ANCHOS_MINIATURA = [480, 960, 1600, 2400] as const;

const CALIDAD_JPEG = 85;

// Sin la caché de sharp: guarda las imágenes que abre y deja sus ficheros abiertos, y en Windows eso
// impide sobrescribir, renombrar o eliminar después las fotos (y las carpetas) que se han reducido.
sharp.cache(false);

// Generaciones en curso, para no generar dos veces la misma miniatura si llegan dos peticiones a la vez.
const enCurso = new Map<string, Promise<string>>();

// Ruta de la foto original a partir de la ruta pedida (relativa a /photos, con los segmentos ya
// decodificados). null si no es una foto válida: fuera de la carpeta de fotos, un segmento oculto
// (con punto: papeleras, subidas a medias) o un fichero que no existe.
function rutaOriginal(relativa: string): string | null {
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

async function generar(original: string, destino: string, ancho: number): Promise<string> {
  mkdirSync(path.dirname(destino), { recursive: true });
  const temporal = `${destino}.${process.pid}.${Date.now()}.tmp`;
  try {
    await sharp(original)
      .rotate() // según la orientación EXIF (las fotos del móvil)
      .resize({ width: ancho, withoutEnlargement: true })
      .withIccProfile('srgb') // los colores, como en la original, en el espacio de color de la web
      .jpeg({ quality: CALIDAD_JPEG, mozjpeg: true })
      .toFile(temporal);
    renameSync(temporal, destino);
  } catch (error) {
    rmSync(temporal, { force: true });
    throw error;
  }
  return destino;
}

// Ruta del fichero con la miniatura de la foto (relativa a /photos) al ancho indicado, generándola
// si hace falta. null si la foto no existe (la petición sigue su curso y acaba en 404).
export async function miniatura(relativa: string, ancho: number): Promise<string | null> {
  const original = rutaOriginal(relativa);
  if (!original) {
    return null;
  }
  const destino = path.join(miniaturasDir, String(ancho), path.relative(fotosDir, original));
  if (existsSync(destino) && statSync(destino).mtimeMs >= statSync(original).mtimeMs) {
    return destino;
  }

  let generando = enCurso.get(destino);
  if (!generando) {
    generando = generar(original, destino, ancho).finally(() => enCurso.delete(destino));
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
      rmSync(path.join(miniaturasDir, String(ancho), relativa), { recursive: true, force: true });
    } catch (error) {
      console.warn(`Aviso: no se han podido borrar las miniaturas de ${relativa}:`, (error as Error).message);
    }
  }
}

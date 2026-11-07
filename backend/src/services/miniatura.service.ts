import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fotosDir, miniaturasDir } from '../config/rutas.js';
import { conPerfilDeColor, convertirAAvif, esAvif, LADO_MAXIMO_FOTO } from '../utils/foto-avif.js';

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
//
// Y con ?compartir, la versión para las vistas previas de los enlaces compartidos (og:image, ver
// services/seo.service.ts): un JPEG sRGB de 1200 px de ancho, porque WhatsApp, Facebook, LinkedIn…
// no admiten AVIF. Se genera la primera vez que se pide, en datos/miniaturas/compartir/<misma ruta>.jpg.

export const ANCHOS_MINIATURA = [960, LADO_MAXIMO_FOTO] as const;
export type AnchoMiniatura = (typeof ANCHOS_MINIATURA)[number];
const ANCHO_CUADRICULA: AnchoMiniatura = 960;

// Versión para compartir (og:image): 1200 px de ancho es lo que recomiendan Facebook y LinkedIn.
const CARPETA_COMPARTIR = 'compartir';
const ANCHO_COMPARTIR = 1200;
const CALIDAD_COMPARTIR = 82;

// Carpetas de datos/miniaturas que están en uso, con la extensión de sus ficheros.
const CARPETAS: readonly { carpeta: string; extension: string }[] = [
  ...ANCHOS_MINIATURA.map((ancho) => ({ carpeta: String(ancho), extension: '.avif' })),
  { carpeta: CARPETA_COMPARTIR, extension: '.jpg' },
];

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
      const imagen = sharp(foto)
        .rotate() // según la orientación EXIF (solo las fotos antiguas, sin convertir, la tienen)
        .resize({ width: ancho, withoutEnlargement: true });
      // El mismo perfil de color que la foto (sin el resto de metadatos).
      await (await conPerfilDeColor(imagen))
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

  return generarUnaVez(destino, () => generar(foto, destino, ancho));
}

// Una sola generación a la vez de cada fichero, aunque lleguen dos peticiones a la vez.
function generarUnaVez(destino: string, generarlo: () => Promise<string>): Promise<string> {
  let generando = enCurso.get(destino);
  if (!generando) {
    generando = generarlo().finally(() => enCurso.delete(destino));
    enCurso.set(destino, generando);
  }
  return generando;
}

async function generarParaCompartir(foto: string, destino: string): Promise<string> {
  mkdirSync(path.dirname(destino), { recursive: true });
  const temporal = `${destino}.${process.pid}.${Date.now()}.tmp`;
  try {
    await sharp(foto)
      .rotate()
      .resize({ width: ANCHO_COMPARTIR, withoutEnlargement: true })
      // En sRGB y sin metadatos: no todas las redes sociales respetan los perfiles de color.
      .toColourspace('srgb')
      .jpeg({ quality: CALIDAD_COMPARTIR, mozjpeg: true })
      .toFile(temporal);
    renameSync(temporal, destino);
  } catch (error) {
    rmSync(temporal, { force: true });
    throw error;
  }
  return destino;
}

// Ruta del JPEG para compartir de una foto (relativa a /photos), generándolo si hace falta. null si
// la foto no existe.
export async function fotoParaCompartir(relativa: string): Promise<string | null> {
  const foto = rutaFoto(relativa);
  if (!foto) {
    return null;
  }
  const destino = path.join(miniaturasDir, CARPETA_COMPARTIR, `${path.relative(fotosDir, foto)}.jpg`);
  if (existsSync(destino) && statSync(destino).mtimeMs >= statSync(foto).mtimeMs) {
    return destino;
  }
  return generarUnaVez(destino, () => generarParaCompartir(foto, destino));
}

// Genera por adelantado la miniatura de una foto (ruta relativa a la carpeta de fotos), para que la
// primera vez que se vea en una cuadrícula ya esté hecha y se sirva al instante: generarla al pedirla
// tarda de medio segundo a un segundo por foto, y una colección pide todas a la vez. Si falla, solo
// avisa: se volverá a intentar al pedirla.
export async function prepararMiniatura(relativa: string): Promise<void> {
  try {
    await miniatura(relativa.split(path.sep).join('/'), ANCHO_CUADRICULA);
  } catch (error) {
    console.warn(`Aviso: no se ha podido generar la miniatura de ${relativa}:`, (error as Error).message);
  }
}

// Genera, de una en una para no acaparar el procesador, las miniaturas que falten (fotos subidas con
// db:importar, convertidas con fotos:convertir, de antes de que se generaran al subirlas o cuya
// miniatura se ha borrado). Se llama al arrancar, en segundo plano.
export async function generarMiniaturasPendientes(): Promise<void> {
  if (!existsSync(fotosDir)) {
    return;
  }
  let generadas = 0;
  for (const fichero of readdirSync(fotosDir, { recursive: true, withFileTypes: true })) {
    if (!fichero.isFile()) {
      continue;
    }
    const relativa = path.relative(fotosDir, path.join(fichero.parentPath, fichero.name));
    if (relativa.split(path.sep).some((s) => s.startsWith('.'))) {
      continue; // papeleras y subidas a medias
    }
    const destino = path.join(miniaturasDir, String(ANCHO_CUADRICULA), esAvif(relativa) ? relativa : `${relativa}.avif`);
    if (existsSync(destino)) {
      continue;
    }
    await prepararMiniatura(relativa);
    generadas++;
  }
  if (generadas > 0) {
    console.log(`Generadas ${generadas} miniaturas pendientes.`);
  }
}

// Al renombrar un fotógrafo, portfolio o colección (y con él su carpeta de fotos), mueve también sus
// miniaturas a la ruta nueva, en vez de borrarlas: renombrar la carpeta es instantáneo y siguen
// valiendo (las fotos no cambian). Si no hubiera que regenerarlas, cada una tardaría casi un segundo la
// primera vez que se pidiera y la cuadrícula se iría llenando poco a poco. Si no se pueden mover (p. ej.
// una carpeta en uso en Windows), se borran y se regeneran ya, en segundo plano. Rutas relativas a la
// carpeta de fotos.
export function moverMiniaturas(antes: string, despues: string): void {
  let regenerar = false;
  for (const { carpeta } of CARPETAS) {
    const origen = path.join(miniaturasDir, carpeta, antes);
    const destino = path.join(miniaturasDir, carpeta, despues);
    if (!existsSync(origen)) {
      continue;
    }
    try {
      rmSync(destino, { recursive: true, force: true }); // restos de antes con el nombre nuevo
      mkdirSync(path.dirname(destino), { recursive: true });
      renameSync(origen, destino);
    } catch (error) {
      console.warn(`Aviso: no se han podido mover las miniaturas de ${antes} a ${despues}; se regeneran:`, (error as Error).message);
      borrarMiniaturas(antes);
      regenerar = true;
    }
  }
  if (regenerar) {
    void generarMiniaturasPendientes();
  }
}

// Borra las miniaturas de una foto o de una carpeta entera (de un fotógrafo, portfolio o colección),
// con su ruta relativa a la carpeta de fotos. Se llama al eliminar: si no, quedarían ocupando sitio
// (no se verían: sin la original ya no se sirven).
export function borrarMiniaturas(relativa: string): void {
  for (const { carpeta: nombre, extension } of CARPETAS) {
    try {
      const carpeta = path.join(miniaturasDir, nombre);
      // Una carpeta (fotógrafo, portfolio, colección) o una foto (si es antigua, sin convertir, su
      // versión lleva .avif detrás; la de compartir, siempre .jpg).
      rmSync(path.join(carpeta, relativa), { recursive: true, force: true });
      rmSync(path.join(carpeta, `${relativa}${extension}`), { force: true });
    } catch (error) {
      console.warn(`Aviso: no se han podido borrar las miniaturas de ${relativa}:`, (error as Error).message);
    }
  }
}

// Borra lo que ya no se usa de datos/miniaturas, para que no ocupe sitio: las carpetas de los anchos
// que ya no se generan (hasta la 2.2, JPEG de 480, 960, 1600 y 2400 px) y, en las de los anchos
// actuales, los ficheros que no son AVIF (los JPEG de 960 de antes y temporales que hayan quedado de
// una generación interrumpida; en la de compartir, los que no son JPEG). Se llama al arrancar.
export function borrarAnchosObsoletos(): void {
  if (!existsSync(miniaturasDir)) {
    return;
  }
  for (const carpeta of readdirSync(miniaturasDir)) {
    const ruta = path.join(miniaturasDir, carpeta);
    try {
      const vigente = CARPETAS.find((c) => c.carpeta === carpeta);
      if (!vigente) {
        rmSync(ruta, { recursive: true, force: true });
        continue;
      }
      for (const fichero of readdirSync(ruta, { recursive: true, withFileTypes: true })) {
        if (fichero.isFile() && !fichero.name.endsWith(vigente.extension)) {
          rmSync(path.join(fichero.parentPath, fichero.name), { force: true });
        }
      }
    } catch (error) {
      console.warn(`Aviso: no se han podido borrar las miniaturas antiguas de ${carpeta}:`, (error as Error).message);
    }
  }
}

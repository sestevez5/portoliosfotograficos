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

export const ANCHOS_MINIATURA = [960, LADO_MAXIMO_FOTO] as const;
export type AnchoMiniatura = (typeof ANCHOS_MINIATURA)[number];
const ANCHO_CUADRICULA: AnchoMiniatura = 960;

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

  let generando = enCurso.get(destino);
  if (!generando) {
    generando = generar(foto, destino, ancho).finally(() => enCurso.delete(destino));
    enCurso.set(destino, generando);
  }
  return generando;
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
  for (const ancho of ANCHOS_MINIATURA) {
    const origen = path.join(miniaturasDir, String(ancho), antes);
    const destino = path.join(miniaturasDir, String(ancho), despues);
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

import path from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { aGuardar, leerExif, quitarGps } from './metadatos-foto.js';

// Las fotos de las colecciones se guardan en AVIF, no tal como llegan: a igual calidad visual pesa
// bastante menos que JPEG. Al subirla (o al convertir una antigua con npm run fotos:convertir), la foto
// se gira según su orientación EXIF, se reduce para que su lado largo no pase de LADO_MAXIMO_FOTO (una
// pantalla 4K completa; nunca se amplía), conserva su perfil de color siempre que se pueda (ver
// conPerfilDeColor) y conserva su EXIF salvo la ubicación GPS (utils/metadatos-foto.ts; el EXIF
// completo, con la ubicación, se devuelve en "metadatos" para guardarlo en la BD). La original no se
// conserva.
//
// Calidad 80 con el color sin submuestrear (4:4:4): la más baja en la que, comparada al 100 % con la
// original (fotos con mucho grano incluidas), no se aprecian diferencias.

export const LADO_MAXIMO_FOTO = 3840;
const CALIDAD_FOTO = 80;

// Nombre con el que se guarda una foto: el del fichero subido con la extensión .avif
// ("Playa.jpg" -> "Playa.avif").
export function nombreAvif(nombreFichero: string): string {
  return `${path.parse(nombreFichero).name}.avif`;
}

export const esAvif = (nombreFichero: string) => nombreFichero.toLowerCase().endsWith('.avif');

// Perfil de color de la salida. Se conserva el de la foto si es RGB (p. ej. Display P3 de un móvil o
// Adobe RGB de una cámara): pasarla a sRGB recortaría los colores más saturados, que fuera de sRGB no
// existen (medido: ΔE2000 medio de 3,4 en los colores saturados de una foto P3 al pasarla a sRGB, frente
// a 0,3 conservando el perfil). Los navegadores aplican el perfil incrustado en la AVIF. Sin perfil
// (se supone sRGB), en CMYK (una AVIF no puede serlo) o en blanco y negro, se pasa a sRGB.
export async function conPerfilDeColor(imagen: Sharp): Promise<Sharp> {
  const { icc, space } = await imagen.metadata();
  return icc && (space === 'srgb' || space === 'rgb16') ? imagen.keepIccProfile() : imagen.withIccProfile('srgb');
}

// metadatos: el EXIF de la original para la BD (aGuardar), o null si no tenía.
export async function convertirAAvif(
  entrada: Buffer | string,
): Promise<{ datos: Buffer; ancho: number; alto: number; metadatos: string | null }> {
  const imagen = sharp(entrada)
    .rotate() // al girarla, la orientación del EXIF que se conserva pasa a ser la normal
    .resize({ width: LADO_MAXIMO_FOTO, height: LADO_MAXIMO_FOTO, fit: 'inside', withoutEnlargement: true })
    .keepExif();
  const { data, info } = await (await conPerfilDeColor(imagen))
    .avif({ quality: CALIDAD_FOTO, effort: 4, chromaSubsampling: '4:4:4' })
    .toBuffer({ resolveWithObject: true });
  return { datos: await quitarGps(data), ancho: info.width, alto: info.height, metadatos: aGuardar(await leerExif(entrada)) };
}

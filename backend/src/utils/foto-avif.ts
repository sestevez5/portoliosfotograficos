import path from 'node:path';
import sharp from 'sharp';

// Las fotos de las colecciones se guardan en AVIF, no tal como llegan: a igual calidad visual pesa
// bastante menos que JPEG. Al subirla (o al convertir una antigua con npm run fotos:convertir), la foto
// se gira según su orientación EXIF, se reduce para que su lado largo no pase de LADO_MAXIMO_FOTO (una
// pantalla 4K completa; nunca se amplía), se pasa a sRGB, el espacio de color de la web, y se le quitan
// el resto de metadatos (EXIF, ubicación GPS). La original no se conserva.
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

export async function convertirAAvif(entrada: Buffer | string): Promise<{ datos: Buffer; ancho: number; alto: number }> {
  const { data, info } = await sharp(entrada)
    .rotate()
    .resize({ width: LADO_MAXIMO_FOTO, height: LADO_MAXIMO_FOTO, fit: 'inside', withoutEnlargement: true })
    .withIccProfile('srgb')
    .avif({ quality: CALIDAD_FOTO, effort: 4, chromaSubsampling: '4:4:4' })
    .toBuffer({ resolveWithObject: true });
  return { datos: data, ancho: info.width, alto: info.height };
}

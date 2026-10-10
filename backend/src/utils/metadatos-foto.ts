import exifReader from 'exif-reader';
import sharp from 'sharp';
import type { MetadatosFoto } from '../types/catalogo.js';

// Metadatos EXIF de las fotos de las colecciones (cámara, objetivo, exposición, fecha…).
//
// - En la foto guardada (la AVIF grande) se conservan, salvo la ubicación GPS (ver quitarGps): la foto
//   la puede descargar cualquiera que la vea. Las miniaturas no los llevan.
// - En la BD (fotos.metadatos) se guardan completos, GPS incluido, en JSON (ver aGuardar), para poder
//   consultarlos sin abrir la foto, también desde una miniatura.
// - La API solo da un resumen legible (resumirMetadatos), nunca la ubicación.

// EXIF de una imagen (null si no tiene o no se puede leer).
export async function leerExif(imagen: Buffer | string): Promise<exifReader.Exif | null> {
  try {
    const { exif } = await sharp(imagen).metadata();
    return exif ? exifReader(exif) : null;
  } catch {
    return null;
  }
}

// Lo que se guarda en la BD: todos los grupos del EXIF salvo la miniatura incrustada. Los datos
// binarios (p. ej. MakerNote, las notas propias del fabricante) no se guardan, salvo los pequeños
// (como ExifVersion), en hexadecimal. Las fechas EXIF no tienen zona horaria: exif-reader las lee como
// UTC, así que se guardan sin la "Z" ("2026-05-01T10:20:30"), la hora tal como la marcó la cámara.
export function aGuardar(exif: exifReader.Exif | null): string | null {
  if (!exif) {
    return null;
  }
  const { Image, Photo, Iop, GPSInfo } = exif;
  const grupos = Object.fromEntries(Object.entries({ Image, Photo, Iop, GPSInfo }).filter(([, valor]) => valor));
  if (Object.keys(grupos).length === 0) {
    return null;
  }
  return JSON.stringify(grupos, function (_clave, valor) {
    // this[_clave] es el valor original (Date y Buffer ya llegan convertidos a "valor").
    const original = this[_clave];
    if (original instanceof Date) {
      return Number.isNaN(original.getTime()) ? undefined : original.toISOString().replace(/\.000Z$|Z$/, '');
    }
    if (Buffer.isBuffer(original)) {
      return original.length <= 64 ? original.toString('hex') : undefined;
    }
    return valor;
  });
}

type Grupo = Record<string, unknown>;
const texto = (valor: unknown) => (typeof valor === 'string' && valor.trim() ? valor.trim().replace(/\0+$/, '') : undefined);
const numero = (valor: unknown) => (typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? valor : undefined);
const redondear = (valor: number | undefined, decimales: number) =>
  valor === undefined ? undefined : Math.round(valor * 10 ** decimales) / 10 ** decimales;

// Tiempo de exposición como se escribe en fotografía: "1/250 s", "0,5 s", "2 s".
function exposicion(segundos: number | undefined): string | undefined {
  if (!segundos) {
    return undefined;
  }
  if (segundos < 0.5) {
    return `1/${Math.round(1 / segundos)} s`;
  }
  return `${String(redondear(segundos, 1)).replace('.', ',')} s`;
}

// Resumen legible de lo guardado en la BD, para la API (sin la ubicación GPS). undefined si no hay nada.
export function resumirMetadatos(guardado: string | null): MetadatosFoto | undefined {
  if (!guardado) {
    return undefined;
  }
  let grupos: { Image?: Grupo; Photo?: Grupo };
  try {
    grupos = JSON.parse(guardado);
  } catch {
    return undefined;
  }
  const imagen = grupos.Image ?? {};
  const foto = grupos.Photo ?? {};
  const marca = texto(imagen.Make);
  const modelo = texto(imagen.Model);
  // Muchas cámaras repiten la marca en el modelo ("Canon" + "Canon EOS R5").
  const camara = marca && modelo && !modelo.toLowerCase().startsWith(marca.toLowerCase().split(' ')[0]) ? `${marca} ${modelo}` : (modelo ?? marca);
  const objetivoMarca = texto(foto.LensMake);
  const objetivoModelo = texto(foto.LensModel);
  const resumen: MetadatosFoto = {
    camara,
    objetivo:
      objetivoMarca && objetivoModelo && !objetivoModelo.toLowerCase().startsWith(objetivoMarca.toLowerCase())
        ? `${objetivoMarca} ${objetivoModelo}`
        : (objetivoModelo ?? objetivoMarca),
    distanciaFocal: redondear(numero(foto.FocalLength), 1),
    distanciaFocal35mm: numero(foto.FocalLengthIn35mmFilm),
    apertura: redondear(numero(foto.FNumber), 1),
    exposicion: exposicion(numero(foto.ExposureTime)),
    iso: numero(foto.ISOSpeedRatings) ?? numero(foto.PhotographicSensitivity),
    compensacionExposicion: typeof foto.ExposureBiasValue === 'number' && foto.ExposureBiasValue !== 0 ? redondear(foto.ExposureBiasValue, 2) : undefined,
    fechaToma: texto(foto.DateTimeOriginal) ?? texto(imagen.DateTime),
    autor: texto(imagen.Artist),
    copyright: texto(imagen.Copyright),
    software: texto(imagen.Software),
  };
  const conDatos = Object.fromEntries(Object.entries(resumen).filter(([, valor]) => valor !== undefined)) as MetadatosFoto;
  return Object.keys(conDatos).length > 0 ? conDatos : undefined;
}

// ---------------- Quitar la ubicación de la foto guardada ----------------

const TAG_GPS = 0x8825;
const TAMANYO_TIPO: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

// Vacía el grupo GPS del EXIF de una imagen ya codificada (la AVIF que se va a guardar), sin tocar el
// resto: el EXIF va sin comprimir dentro del fichero, así que se borra en su sitio (con ceros), sin
// cambiar el tamaño del fichero ni volver a codificar la foto. El grupo queda vacío (0 entradas), como
// si no tuviera ubicación. Si el EXIF no tiene GPS o no se encuentra, devuelve la imagen tal cual.
export async function quitarGps(imagen: Buffer): Promise<Buffer> {
  const { exif } = await sharp(imagen).metadata();
  if (!exif) {
    return imagen;
  }
  const inicioTiff = exif.subarray(0, 6).toString('latin1') === 'Exif\0\0' ? 6 : 0;
  const tiff = exif.subarray(inicioTiff);
  const enFichero = imagen.indexOf(tiff);
  if (enFichero < 0 || tiff.length < 8) {
    return imagen;
  }
  const resultado = Buffer.from(imagen);
  const t = resultado.subarray(enFichero, enFichero + tiff.length);
  const le = t.toString('latin1', 0, 2) === 'II';
  const u16 = (o: number) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o: number) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const dentro = (o: number, n: number) => o >= 0 && o + n <= t.length;

  const ifd0 = u32(4);
  if (!dentro(ifd0, 2)) {
    return imagen;
  }
  let gps = -1;
  for (let i = 0, n = u16(ifd0); i < n && dentro(ifd0 + 2 + i * 12, 12); i++) {
    const entrada = ifd0 + 2 + i * 12;
    if (u16(entrada) === TAG_GPS) {
      gps = u32(entrada + 8);
    }
  }
  if (!dentro(gps, 2)) {
    return imagen;
  }
  const entradas = u16(gps);
  if (!dentro(gps, 2 + entradas * 12 + 4)) {
    return imagen;
  }
  // Primero los valores que no caben en la entrada (coordenadas, fecha…), luego las entradas.
  for (let i = 0; i < entradas; i++) {
    const entrada = gps + 2 + i * 12;
    const bytes = (TAMANYO_TIPO[u16(entrada + 2)] ?? 1) * u32(entrada + 4);
    if (bytes > 4 && dentro(u32(entrada + 8), bytes)) {
      t.fill(0, u32(entrada + 8), u32(entrada + 8) + bytes);
    }
  }
  // 0 entradas y, justo detrás, el enlace al siguiente grupo a 0 (ninguno).
  t.fill(0, gps, gps + 2 + entradas * 12 + 4);
  return resultado;
}

// Reconoce el formato de una imagen por sus primeros bytes (no por la extensión ni por el
// Content-Type, que los pone quien la envía) y lee su ancho y alto de la cabecera, sin
// decodificarla. Admite los formatos que muestran todos los navegadores: JPEG, PNG y WebP.

export type FormatoImagen = 'jpeg' | 'png' | 'webp';

export interface DatosImagen {
  formato: FormatoImagen;
  // null si la cabecera no permite leerlos (la imagen se admite igual).
  ancho: number | null;
  alto: number | null;
}

const empiezaPor = (datos: Buffer, firma: number[], desde = 0) =>
  datos.length >= desde + firma.length && firma.every((byte, i) => datos[desde + i] === byte);

// Marcadores SOF (Start Of Frame) de JPEG, que llevan las dimensiones: C0-CF salvo C4 (tablas
// Huffman), C8 (reservado) y CC (codificación aritmética).
const esSof = (marcador: number) => marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);

function dimensionesJpeg(datos: Buffer): { ancho: number; alto: number } | null {
  let i = 2;
  while (i + 9 < datos.length) {
    if (datos[i] !== 0xff) {
      return null;
    }
    const marcador = datos[i + 1];
    if (marcador === 0xff) {
      i++; // relleno
      continue;
    }
    if (esSof(marcador)) {
      return { alto: datos.readUInt16BE(i + 5), ancho: datos.readUInt16BE(i + 7) };
    }
    i += 2 + datos.readUInt16BE(i + 2);
  }
  return null;
}

function dimensionesWebp(datos: Buffer): { ancho: number; alto: number } | null {
  const bloque = datos.toString('ascii', 12, 16);
  if (bloque === 'VP8 ' && datos.length >= 30) {
    return { ancho: datos.readUInt16LE(26) & 0x3fff, alto: datos.readUInt16LE(28) & 0x3fff };
  }
  if (bloque === 'VP8L' && datos.length >= 25) {
    const bits = datos.readUInt32LE(21);
    return { ancho: (bits & 0x3fff) + 1, alto: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (bloque === 'VP8X' && datos.length >= 30) {
    return { ancho: datos.readUIntLE(24, 3) + 1, alto: datos.readUIntLE(27, 3) + 1 };
  }
  return null;
}

// null si no es una imagen de un formato admitido.
export function leerImagen(datos: Buffer): DatosImagen | null {
  if (empiezaPor(datos, [0xff, 0xd8, 0xff])) {
    const dimensiones = dimensionesJpeg(datos);
    return { formato: 'jpeg', ancho: dimensiones?.ancho ?? null, alto: dimensiones?.alto ?? null };
  }
  if (empiezaPor(datos, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    const conCabecera = datos.length >= 24;
    return {
      formato: 'png',
      ancho: conCabecera ? datos.readUInt32BE(16) : null,
      alto: conCabecera ? datos.readUInt32BE(20) : null,
    };
  }
  if (datos.toString('ascii', 0, 4) === 'RIFF' && datos.toString('ascii', 8, 12) === 'WEBP') {
    const dimensiones = dimensionesWebp(datos);
    return { formato: 'webp', ancho: dimensiones?.ancho ?? null, alto: dimensiones?.alto ?? null };
  }
  return null;
}

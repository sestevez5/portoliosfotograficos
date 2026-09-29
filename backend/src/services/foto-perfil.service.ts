import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { avataresDir } from '../config/rutas.js';
import { guardarFotoActualizada, obtenerFotografoEdicion, type FotografoEdicion } from '../db/catalogo.repository.js';
import { RecursoNoEncontrado } from '../errores.js';
import { enOperacion, exigir } from '../reglas/index.js';

// Foto de perfil de un usuario (de momento, de los fotógrafos: se gestiona desde su formulario).
// La web la recorta en el navegador (círculo que elige el usuario, exportado como JPEG cuadrado),
// así que aquí solo se comprueba que sea un JPEG razonable y se guarda tal cual en
// datos/avatares/u<idUsuario>.jpg. usuarios.fotoActualizada anota cuándo se puso (NULL = sin foto)
// y va en la URL, para que el navegador no muestre una versión antigua.

export const TAMANYO_MAXIMO_FOTO_MB = 2;

export const rutaFotoPerfil = (idUsuario: number) => path.join(avataresDir, `u${idUsuario}.jpg`);

// URL pública de la foto de un fotógrafo, o undefined si no tiene.
export function urlFotoPerfil(nombreInformalNormalizado: string, fotoActualizada: string | null): string | undefined {
  return fotoActualizada
    ? `/api/fotografos/${nombreInformalNormalizado}/foto?v=${encodeURIComponent(fotoActualizada)}`
    : undefined;
}

function cargar(fotografo: string): FotografoEdicion {
  const encontrado = obtenerFotografoEdicion(fotografo);
  if (!encontrado) {
    throw new RecursoNoEncontrado(`Fotógrafo '${fotografo}' no encontrado`);
  }
  return encontrado;
}

// Un JPEG empieza por FF D8 FF.
const esJpeg = (datos: Buffer) => datos.length > 3 && datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff;

// Pone (o sustituye) la foto. Se escribe a un fichero temporal y se renombra, para no dejar nunca
// una foto a medias. Devuelve la URL de la foto nueva.
export function guardarFotoPerfil(fotografo: string, datos: Buffer): string {
  const f = cargar(fotografo);
  enOperacion('CAMBIAR_FOTO_PERFIL', { nombreInformal: f.nombreInformal }, () =>
    exigir(esJpeg(datos) && datos.length <= TAMANYO_MAXIMO_FOTO_MB * 1024 * 1024, 'USUARIO_FOTO_NO_VALIDA', {
      maximo: TAMANYO_MAXIMO_FOTO_MB,
    }),
  );

  mkdirSync(avataresDir, { recursive: true });
  const ruta = rutaFotoPerfil(f.idUsuario);
  writeFileSync(`${ruta}.tmp`, datos);
  renameSync(`${ruta}.tmp`, ruta);
  const fecha = new Date().toISOString();
  guardarFotoActualizada(f.idUsuario, fecha);
  return urlFotoPerfil(f.nombreInformalNormalizado, fecha)!;
}

export function quitarFotoPerfil(fotografo: string): void {
  const f = cargar(fotografo);
  guardarFotoActualizada(f.idUsuario, null);
  rmSync(rutaFotoPerfil(f.idUsuario), { force: true });
}

// Ruta del fichero de la foto de un fotógrafo, para servirla (RecursoNoEncontrado si no tiene).
export function ficheroFotoPerfil(fotografo: string): string {
  const f = cargar(fotografo);
  const ruta = rutaFotoPerfil(f.idUsuario);
  if (!f.fotoActualizada || !existsSync(ruta)) {
    throw new RecursoNoEncontrado(`'${fotografo}' no tiene foto de perfil`);
  }
  return ruta;
}

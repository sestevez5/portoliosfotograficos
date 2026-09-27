import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fotosDir } from '../config/rutas.js';
import {
  actualizarAlbum,
  eliminarAlbum as eliminarAlbumBD,
  enTransaccion,
  insertarAlbum,
  numeroFotos,
  obtenerAlbum,
  validar,
  type AlbumFila,
  type FotografoFila,
} from '../db/catalogo.repository.js';
import { RecursoNoEncontrado } from '../errores.js';
import { enOperacion, type CodigoOperacion, type DatosRegla } from '../reglas/index.js';
import type { AlbumAlta } from '../types/album.js';
import { apartarCarpeta, renombrarCarpeta, vaciarPapelera } from '../utils/carpetas.js';
import { normalizarNombre } from '../utils/normalizar-nombre.js';
import { cargarFotografo, cargarPortfolio, opcional, type ResultadoRenombre } from './portfolio.service.js';

// Alta, edición, eliminación y cambio de nombre de álbumes, igual que los portfolios
// (portfolio.service.ts): su nombreNormalizado se calcula a partir del nombre y es el nombre de su
// carpeta dentro de la de su portfolio (datos/fotos/<fotógrafo>/<portfolio>/<álbum>); estas
// funciones crean, renombran y eliminan la carpeta en la misma transacción que la BD (si la
// operación con la carpeta falla, la BD no cambia). Los parámetros fotografo, portfolio y album son
// segmentos de URL. Validan antes las reglas de negocio dentro de su operación y lanzan
// RecursoNoEncontrado si no existen.
//
// Como los portfolios, los álbumes los mantiene su fotógrafo propietario, no el administrador.

function cargarAlbum(fotografo: string, portfolio: string, album: string): { f: FotografoFila; actual: AlbumFila } {
  const f = cargarFotografo(fotografo);
  const actual = obtenerAlbum(f.idFotografo, portfolio, album);
  if (!actual) {
    throw new RecursoNoEncontrado(`Álbum '${album}' no encontrado en '${fotografo}/${portfolio}'`);
  }
  return { f, actual };
}

// Tags sin espacios sobrantes y sin vacíos, en el orden indicado (los repetidos los rechaza la regla
// ALBUM_TAG_DUPLICADO).
const limpiarTags = (tags: string[] | undefined) => (tags ?? []).map((tag) => tag.trim()).filter(Boolean);

// Crea un álbum al final de los del portfolio, con su carpeta. Devuelve su nombreNormalizado.
export function crearAlbum(fotografo: string, portfolio: string, alta: AlbumAlta): string {
  const { f, actual: p } = cargarPortfolio(fotografo, portfolio);
  const nombre = alta.nombre.trim();
  const tags = limpiarTags(alta.tags);
  const carpetaPortfolio = path.join(f.nombreInformalNormalizado, p.nombreNormalizado);
  enOperacion('CREAR_ALBUM', { nombre, portfolio: p.nombre, fotografo: f.nombreInformal }, () => {
    validar.altaAlbum(p.idPortfolio, carpetaPortfolio, nombre);
    validar.tags(nombre, tags);
  });

  const nombreNormalizado = normalizarNombre(nombre);
  enTransaccion(() => {
    insertarAlbum(p.idPortfolio, { nombre, nombreNormalizado, descripcion: opcional(alta.descripcion), tags });
    // recursive: por si faltara la carpeta del portfolio (la del álbum ya se ha comprobado).
    mkdirSync(path.join(fotosDir, carpetaPortfolio, nombreNormalizado), { recursive: true });
  });
  return nombreNormalizado;
}

// Guarda nombre, descripción y tags; si cambia el nombreNormalizado renombra la carpeta en la misma
// transacción. Valida dentro de la operación indicada.
function modificarAlbum(
  f: FotografoFila,
  actual: AlbumFila,
  cambios: { nombre: string; descripcion: string | null; tags: string[] },
  operacion: { codigo: CodigoOperacion; datos: DatosRegla },
): ResultadoRenombre {
  const { nombre } = cambios;
  const carpetaPortfolio = path.join(f.nombreInformalNormalizado, actual.carpetaPortfolio);
  enOperacion(operacion.codigo, operacion.datos, () => {
    validar.renombreAlbum(actual.idPortfolio, actual.idAlbum, carpetaPortfolio, actual.nombreNormalizado, nombre);
    validar.tags(nombre, cambios.tags);
  });

  const normalizado = normalizarNombre(nombre);
  const carpetaRenombrada = enTransaccion(() => {
    actualizarAlbum(actual.idAlbum, { ...cambios, nombreNormalizado: normalizado });
    return renombrarCarpeta(
      path.join(fotosDir, carpetaPortfolio, actual.nombreNormalizado),
      path.join(fotosDir, carpetaPortfolio, normalizado),
    );
  });

  return {
    antes: { nombre: actual.nombre, nombreNormalizado: actual.nombreNormalizado },
    despues: { nombre, nombreNormalizado: normalizado },
    carpetaRenombrada,
  };
}

// Edición desde la aplicación (nombre, descripción y tags).
export function editarAlbum(fotografo: string, portfolio: string, album: string, cambios: AlbumAlta): ResultadoRenombre {
  const { f, actual } = cargarAlbum(fotografo, portfolio, album);
  return modificarAlbum(
    f,
    actual,
    { nombre: cambios.nombre.trim(), descripcion: opcional(cambios.descripcion), tags: limpiarTags(cambios.tags) },
    { codigo: 'EDITAR_ALBUM', datos: { nombre: actual.nombre, portfolio: actual.nombrePortfolio } },
  );
}

// Solo cambia el nombre (comando npm run album:renombrar).
export function renombrarAlbum(fotografo: string, portfolio: string, album: string, nuevoNombre: string): ResultadoRenombre {
  const { f, actual } = cargarAlbum(fotografo, portfolio, album);
  const nombre = nuevoNombre.trim();
  return modificarAlbum(
    f,
    actual,
    { nombre, descripcion: actual.descripcion, tags: actual.tags },
    { codigo: 'RENOMBRAR_ALBUM', datos: { actual: actual.nombre, portfolio: actual.nombrePortfolio, nuevo: nombre } },
  );
}

// Elimina un álbum con sus fotos (BD en cascada) y su carpeta. Si tiene fotos exige confirmación
// (regla ALBUM_ELIMINAR_CON_FOTOS). La carpeta se aparta a la papelera dentro de la transacción y
// se borra cuando el borrado en la BD está confirmado (ver apartarCarpeta).
export function eliminarAlbum(fotografo: string, portfolio: string, album: string, confirmado: boolean): void {
  const { f, actual } = cargarAlbum(fotografo, portfolio, album);
  enOperacion('ELIMINAR_ALBUM', { nombre: actual.nombre, portfolio: actual.nombrePortfolio }, () =>
    validar.eliminacionAlbum(numeroFotos(actual.idAlbum), confirmado),
  );

  const papelera = enTransaccion(() => {
    eliminarAlbumBD(actual.idAlbum);
    return apartarCarpeta(
      path.join(fotosDir, f.nombreInformalNormalizado, actual.carpetaPortfolio, actual.nombreNormalizado),
      fotosDir,
    );
  });
  vaciarPapelera(papelera);
}

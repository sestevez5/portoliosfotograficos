import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fotosDir } from '../config/rutas.js';
import {
  actualizarColeccion,
  cambiarFotoPortada,
  cambiarOrdenColeccion,
  eliminarColeccion as eliminarColeccionBD,
  enTransaccion,
  insertarColeccion,
  listarColecciones,
  listarFotos,
  numeroFotos,
  obtenerColeccion,
  validar,
  type ColeccionFila,
  type FotografoFila,
} from '../db/catalogo.repository.js';
import { RecursoNoEncontrado } from '../errores.js';
import { enOperacion, type CodigoOperacion, type DatosRegla } from '../reglas/index.js';
import type { ColeccionAlta } from '../types/catalogo.js';
import { apartarCarpeta, renombrarCarpeta, vaciarPapelera } from '../utils/carpetas.js';
import { normalizarNombre } from '../utils/normalizar-nombre.js';
import { borrarMiniaturas } from './miniatura.service.js';
import { cargarFotografo, cargarPortfolio, opcional, type ResultadoRenombre } from './portfolio.service.js';

// Alta, edición, eliminación y cambio de nombre de colecciones, igual que los portfolios
// (portfolio.service.ts): su nombreNormalizado se calcula a partir del nombre y es el nombre de su
// carpeta dentro de la de su portfolio (datos/fotos/<fotógrafo>/<portfolio>/<colección>); estas
// funciones crean, renombran y eliminan la carpeta en la misma transacción que la BD (si la
// operación con la carpeta falla, la BD no cambia). Los parámetros fotografo, portfolio y coleccion son
// segmentos de URL. Validan antes las reglas de negocio dentro de su operación y lanzan
// RecursoNoEncontrado si no existen.
//
// Como los portfolios, las colecciones los mantiene su fotógrafo propietario, no el administrador.

export function cargarColeccion(fotografo: string, portfolio: string, coleccion: string): { f: FotografoFila; actual: ColeccionFila } {
  const f = cargarFotografo(fotografo);
  const actual = obtenerColeccion(f.idFotografo, portfolio, coleccion);
  if (!actual) {
    throw new RecursoNoEncontrado(`Colección '${coleccion}' no encontrada en '${fotografo}/${portfolio}'`);
  }
  return { f, actual };
}

// Tags sin espacios sobrantes y sin vacíos, en el orden indicado (los repetidos los rechaza la regla
// COLECCION_TAG_DUPLICADO).
const limpiarTags = (tags: string[] | undefined) => (tags ?? []).map((tag) => tag.trim()).filter(Boolean);

// Crea una colección al final de los del portfolio, con su carpeta. Devuelve su nombreNormalizado.
export function crearColeccion(fotografo: string, portfolio: string, alta: ColeccionAlta): string {
  const { f, actual: p } = cargarPortfolio(fotografo, portfolio);
  const nombre = alta.nombre.trim();
  const tags = limpiarTags(alta.tags);
  const carpetaPortfolio = path.join(f.nombreInformalNormalizado, p.nombreNormalizado);
  enOperacion('CREAR_COLECCION', { nombre, portfolio: p.nombre, fotografo: f.nombreInformal }, () => {
    validar.altaColeccion(p.idPortfolio, carpetaPortfolio, nombre);
    validar.tags(nombre, tags);
  });

  const nombreNormalizado = normalizarNombre(nombre);
  enTransaccion(() => {
    insertarColeccion(p.idPortfolio, { nombre, nombreNormalizado, descripcion: opcional(alta.descripcion), tags });
    // recursive: por si faltara la carpeta del portfolio (la dla colección ya se ha comprobado).
    mkdirSync(path.join(fotosDir, carpetaPortfolio, nombreNormalizado), { recursive: true });
  });
  return nombreNormalizado;
}

// Guarda nombre, descripción y tags; si cambia el nombreNormalizado renombra la carpeta en la misma
// transacción. Valida dentro de la operación indicada.
function modificarColeccion(
  f: FotografoFila,
  actual: ColeccionFila,
  cambios: { nombre: string; descripcion: string | null; tags: string[] },
  operacion: { codigo: CodigoOperacion; datos: DatosRegla },
): ResultadoRenombre {
  const { nombre } = cambios;
  const carpetaPortfolio = path.join(f.nombreInformalNormalizado, actual.carpetaPortfolio);
  enOperacion(operacion.codigo, operacion.datos, () => {
    validar.renombreColeccion(actual.idPortfolio, actual.idColeccion, carpetaPortfolio, actual.nombreNormalizado, nombre);
    validar.tags(nombre, cambios.tags);
  });

  const normalizado = normalizarNombre(nombre);
  const carpetaRenombrada = enTransaccion(() => {
    actualizarColeccion(actual.idColeccion, { ...cambios, nombreNormalizado: normalizado });
    return renombrarCarpeta(
      path.join(fotosDir, carpetaPortfolio, actual.nombreNormalizado),
      path.join(fotosDir, carpetaPortfolio, normalizado),
    );
  });
  if (carpetaRenombrada) {
    borrarMiniaturas(path.join(carpetaPortfolio, actual.nombreNormalizado));
  }

  return {
    antes: { nombre: actual.nombre, nombreNormalizado: actual.nombreNormalizado },
    despues: { nombre, nombreNormalizado: normalizado },
    carpetaRenombrada,
  };
}

// Edición desde la aplicación (nombre, descripción y tags).
export function editarColeccion(fotografo: string, portfolio: string, coleccion: string, cambios: ColeccionAlta): ResultadoRenombre {
  const { f, actual } = cargarColeccion(fotografo, portfolio, coleccion);
  return modificarColeccion(
    f,
    actual,
    { nombre: cambios.nombre.trim(), descripcion: opcional(cambios.descripcion), tags: limpiarTags(cambios.tags) },
    { codigo: 'EDITAR_COLECCION', datos: { nombre: actual.nombre, portfolio: actual.nombrePortfolio } },
  );
}

// Solo cambia el nombre (comando npm run coleccion:renombrar).
export function renombrarColeccion(fotografo: string, portfolio: string, coleccion: string, nuevoNombre: string): ResultadoRenombre {
  const { f, actual } = cargarColeccion(fotografo, portfolio, coleccion);
  const nombre = nuevoNombre.trim();
  return modificarColeccion(
    f,
    actual,
    { nombre, descripcion: actual.descripcion, tags: actual.tags },
    { codigo: 'RENOMBRAR_COLECCION', datos: { actual: actual.nombre, portfolio: actual.nombrePortfolio, nuevo: nombre } },
  );
}

// Elige la foto de portada de una colección por su nombre de fichero, o ninguna (null: la portada pasa
// a ser la primera foto). Debe ser una de sus fotos (regla COLECCION_FOTO_PORTADA_INEXISTENTE). La
// portada del portfolio es la de su colección de portada (o, sin ella, la de la primera).
export function cambiarPortada(fotografo: string, portfolio: string, coleccion: string, nombreFichero: string | null): void {
  const { actual } = cargarColeccion(fotografo, portfolio, coleccion);
  const fotos = listarFotos(actual.idColeccion);
  enOperacion('CAMBIAR_PORTADA_COLECCION', { coleccion: actual.nombre, portfolio: actual.nombrePortfolio }, () =>
    validar.fotoPortada(
      actual.nombre,
      nombreFichero ?? undefined,
      fotos.map((foto) => foto.nombreFichero),
    ),
  );
  cambiarFotoPortada(actual.idColeccion, fotos.find((foto) => foto.nombreFichero === nombreFichero)?.idFoto ?? null);
}

// Cambia el orden de las colecciones de un portfolio: nuevoOrden son los nombreNormalizado de todas
// sus colecciones en el orden en que deben quedar (0, 1, 2…). Si no son exactamente sus colecciones
// (p. ej. porque entretanto se ha creado o eliminado alguna) no cambia nada (regla
// COLECCION_ORDEN_NO_VALIDO). Sin colección de portada elegida, la del portfolio es la de la primera.
export function ordenarColecciones(fotografo: string, portfolio: string, nuevoOrden: string[]): void {
  const { f, actual: p } = cargarPortfolio(fotografo, portfolio);
  const colecciones = listarColecciones({ idPortfolio: p.idPortfolio });
  enOperacion('ORDENAR_COLECCIONES', { portfolio: p.nombre, fotografo: f.nombreInformal }, () =>
    validar.ordenColecciones(
      p.nombre,
      colecciones.map((c) => c.nombreNormalizado),
      nuevoOrden,
    ),
  );

  const idPorNombre = new Map(colecciones.map((c) => [c.nombreNormalizado, c.idColeccion]));
  enTransaccion(() => nuevoOrden.forEach((nombre, orden) => cambiarOrdenColeccion(idPorNombre.get(nombre)!, orden)));
}

// Elimina una colección con sus fotos (BD en cascada) y su carpeta. Si tiene fotos exige confirmación
// (regla COLECCION_ELIMINAR_CON_FOTOS). La carpeta se aparta a la papelera dentro de la transacción y
// se borra cuando el borrado en la BD está confirmado (ver apartarCarpeta).
export function eliminarColeccion(fotografo: string, portfolio: string, coleccion: string, confirmado: boolean): void {
  const { f, actual } = cargarColeccion(fotografo, portfolio, coleccion);
  enOperacion('ELIMINAR_COLECCION', { nombre: actual.nombre, portfolio: actual.nombrePortfolio }, () =>
    validar.eliminacionColeccion(numeroFotos(actual.idColeccion), confirmado),
  );

  const papelera = enTransaccion(() => {
    eliminarColeccionBD(actual.idColeccion);
    return apartarCarpeta(
      path.join(fotosDir, f.nombreInformalNormalizado, actual.carpetaPortfolio, actual.nombreNormalizado),
      fotosDir,
    );
  });
  vaciarPapelera(papelera);
  borrarMiniaturas(path.join(f.nombreInformalNormalizado, actual.carpetaPortfolio, actual.nombreNormalizado));
}

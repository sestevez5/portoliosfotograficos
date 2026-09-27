import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fotosDir } from '../config/rutas.js';
import {
  actualizarPortfolio,
  eliminarPortfolio as eliminarPortfolioBD,
  enTransaccion,
  insertarPortfolio,
  numeroAlbumes,
  obtenerFotografo,
  obtenerPortfolio,
  validar,
  type FotografoFila,
  type PortfolioFila,
} from '../db/catalogo.repository.js';
import { RecursoNoEncontrado } from '../errores.js';
import { enOperacion, type CodigoOperacion, type DatosRegla } from '../reglas/index.js';
import type { PortfolioAlta } from '../types/album.js';
import { apartarCarpeta, renombrarCarpeta, vaciarPapelera } from '../utils/carpetas.js';
import { normalizarNombre } from '../utils/normalizar-nombre.js';

// Alta, edición, eliminación y cambio de nombre de portfolios (los álbumes, en album.service.ts). Su
// nombreNormalizado se calcula a partir del nombre y es el nombre de su carpeta en datos/fotos:
// estas funciones crean, renombran y eliminan la carpeta en la misma transacción que la BD (si la
// operación con la carpeta falla, la BD no cambia). Los parámetros fotografo y portfolio son
// segmentos de URL. Validan antes las reglas de negocio dentro de su operación y lanzan
// RecursoNoEncontrado si no existen.
//
// Mantener los portfolios es cosa del propio fotógrafo, no del administrador. Mientras no haya
// login no se comprueba quién lo hace; cuando lo haya, solo el fotógrafo propietario podrá.

export interface ResultadoRenombre {
  antes: { nombre: string; nombreNormalizado: string };
  despues: { nombre: string; nombreNormalizado: string };
  carpetaRenombrada: boolean;
}

export function cargarFotografo(fotografo: string): FotografoFila {
  const encontrado = obtenerFotografo(fotografo);
  if (!encontrado) {
    throw new RecursoNoEncontrado(`Fotógrafo '${fotografo}' no encontrado`);
  }
  return encontrado;
}

export function cargarPortfolio(fotografo: string, portfolio: string): { f: FotografoFila; actual: PortfolioFila } {
  const f = cargarFotografo(fotografo);
  const actual = obtenerPortfolio(f.idFotografo, portfolio);
  if (!actual) {
    throw new RecursoNoEncontrado(`Portfolio '${portfolio}' no encontrado para '${fotografo}'`);
  }
  return { f, actual };
}

// Descripción opcional: sin espacios sobrantes; vacía equivale a no indicada.
export const opcional = (texto: string | null | undefined) => texto?.trim() || null;

// Crea un portfolio al final de los del fotógrafo, con su carpeta. Devuelve su nombreNormalizado.
export function crearPortfolio(fotografo: string, alta: PortfolioAlta): string {
  const f = cargarFotografo(fotografo);
  const nombre = alta.nombre.trim();
  enOperacion('CREAR_PORTFOLIO', { nombre, fotografo: f.nombreInformal }, () =>
    validar.altaPortfolio(f.idFotografo, f.nombreInformalNormalizado, nombre),
  );

  const nombreNormalizado = normalizarNombre(nombre);
  enTransaccion(() => {
    insertarPortfolio(f.idFotografo, { nombre, nombreNormalizado, descripcion: opcional(alta.descripcion) });
    // recursive: por si faltara la carpeta del fotógrafo (la del portfolio ya se ha comprobado).
    mkdirSync(path.join(fotosDir, f.nombreInformalNormalizado, nombreNormalizado), { recursive: true });
  });
  return nombreNormalizado;
}

// Guarda nombre y descripción; si cambia el nombreNormalizado renombra la carpeta en la misma
// transacción. Valida dentro de la operación indicada.
function modificarPortfolio(
  f: FotografoFila,
  actual: PortfolioFila,
  nombre: string,
  descripcion: string | null,
  operacion: { codigo: CodigoOperacion; datos: DatosRegla },
): ResultadoRenombre {
  enOperacion(operacion.codigo, operacion.datos, () =>
    validar.renombrePortfolio(f.idFotografo, actual.idPortfolio, f.nombreInformalNormalizado, actual.nombreNormalizado, nombre),
  );

  const normalizado = normalizarNombre(nombre);
  const carpetaFotografo = path.join(fotosDir, f.nombreInformalNormalizado);
  const carpetaRenombrada = enTransaccion(() => {
    actualizarPortfolio(actual.idPortfolio, { nombre, nombreNormalizado: normalizado, descripcion });
    return renombrarCarpeta(path.join(carpetaFotografo, actual.nombreNormalizado), path.join(carpetaFotografo, normalizado));
  });

  return {
    antes: { nombre: actual.nombre, nombreNormalizado: actual.nombreNormalizado },
    despues: { nombre, nombreNormalizado: normalizado },
    carpetaRenombrada,
  };
}

// Edición desde la aplicación (nombre y descripción).
export function editarPortfolio(fotografo: string, portfolio: string, cambios: PortfolioAlta): ResultadoRenombre {
  const { f, actual } = cargarPortfolio(fotografo, portfolio);
  return modificarPortfolio(f, actual, cambios.nombre.trim(), opcional(cambios.descripcion), {
    codigo: 'EDITAR_PORTFOLIO',
    datos: { nombre: actual.nombre, fotografo: f.nombreInformal },
  });
}

// Solo cambia el nombre (comando npm run portfolio:renombrar).
export function renombrarPortfolio(fotografo: string, portfolio: string, nuevoNombre: string): ResultadoRenombre {
  const { f, actual } = cargarPortfolio(fotografo, portfolio);
  const nombre = nuevoNombre.trim();
  return modificarPortfolio(f, actual, nombre, actual.descripcion, {
    codigo: 'RENOMBRAR_PORTFOLIO',
    datos: { actual: actual.nombre, fotografo: f.nombreInformal, nuevo: nombre },
  });
}

// Elimina un portfolio con sus álbumes y fotos (BD en cascada) y su carpeta. Si tiene álbumes exige
// confirmación (regla PORTFOLIO_ELIMINAR_CON_ALBUMES). La carpeta se aparta a la papelera dentro de
// la transacción y se borra cuando el borrado en la BD está confirmado (ver apartarCarpeta).
export function eliminarPortfolio(fotografo: string, portfolio: string, confirmado: boolean): void {
  const { f, actual } = cargarPortfolio(fotografo, portfolio);
  enOperacion('ELIMINAR_PORTFOLIO', { nombre: actual.nombre, fotografo: f.nombreInformal }, () =>
    validar.eliminacionPortfolio(numeroAlbumes(actual.idPortfolio), confirmado),
  );

  const papelera = enTransaccion(() => {
    eliminarPortfolioBD(actual.idPortfolio);
    return apartarCarpeta(path.join(fotosDir, f.nombreInformalNormalizado, actual.nombreNormalizado), fotosDir);
  });
  vaciarPapelera(papelera);
}

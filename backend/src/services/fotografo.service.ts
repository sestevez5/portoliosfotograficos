import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fotosDir } from '../config/rutas.js';
import {
  actualizarFotografo,
  eliminarFotografo as eliminarFotografoBD,
  enTransaccion,
  insertarFotografo,
  numeroPortfolios,
  obtenerFotografo,
  obtenerFotografoEdicion,
  usuarioExiste,
  validar,
  type FotografoEdicion,
  type FotografoFila,
} from '../db/catalogo.repository.js';
import { RecursoNoEncontrado } from '../errores.js';
import { enOperacion, type CodigoOperacion, type DatosRegla } from '../reglas/index.js';
import type { FotografoAlta } from '../types/album.js';
import { hashContrasenya } from '../utils/contrasenya.js';
import { apartarCarpeta, renombrarCarpeta, vaciarPapelera } from '../utils/carpetas.js';
import { normalizarNombre } from '../utils/normalizar-nombre.js';
import { generarUsuario } from '../utils/usuario.js';
import { rutaLogo } from './logo.service.js';

// Alta, edición y eliminación de fotógrafos. La carpeta datos/fotos/<nombreInformalNormalizado>
// de cada fotógrafo debe existir y llamarse siempre así: estas funciones la crean, la renombran y
// la eliminan junto con la BD (dentro de la misma transacción). Todas validan antes las reglas de
// negocio (reglas/) dentro de su operación, y lanzan RecursoNoEncontrado si el fotógrafo no existe.

// Texto opcional del formulario: sin espacios sobrantes; vacío equivale a no indicado.
const opcional = (texto: string | undefined) => texto?.trim() || null;

function limpiar(alta: FotografoAlta) {
  return {
    nombreInformal: alta.nombreInformal.trim(),
    nombre: alta.nombre.trim(),
    primerApellido: alta.primerApellido.trim(),
    segundoApellido: opcional(alta.segundoApellido),
    email: opcional(alta.email),
    descripcion: alta.descripcion?.trim() ?? '',
  };
}

function cargar(fotografo: string): FotografoEdicion {
  const actual = obtenerFotografoEdicion(fotografo);
  if (!actual) {
    throw new RecursoNoEncontrado(`Fotógrafo '${fotografo}' no encontrado`);
  }
  return actual;
}

// Alta desde la aplicación: calcula su usuario y su nombreInformalNormalizado (internos, no se
// piden en el formulario), guarda solo el hash de la contraseña y crea su carpeta.
export function crearFotografo(alta: FotografoAlta): FotografoFila {
  const datos = limpiar(alta);
  enOperacion('CREAR_FOTOGRAFO', { nombreInformal: datos.nombreInformal }, () =>
    validar.altaFotografo({ ...datos, contrasenya: alta.contrasenya }),
  );

  const nombreInformalNormalizado = normalizarNombre(datos.nombreInformal);
  enTransaccion(() => {
    insertarFotografo({
      ...datos,
      usuario: generarUsuario(datos.nombre, datos.primerApellido, usuarioExiste),
      nombreInformalNormalizado,
      passwordHash: alta.contrasenya ? hashContrasenya(alta.contrasenya) : null,
    });
    mkdirSync(path.join(fotosDir, nombreInformalNormalizado));
  });

  return obtenerFotografo(nombreInformalNormalizado)!;
}

// Aplica una modificación ya preparada: valida (dentro de la operación indicada), guarda y, si
// cambia el nombreInformalNormalizado, renombra la carpeta en la misma transacción. Si cambia el
// texto del nombre informal se borra el logo anterior (se regenera con la firma nueva).
function modificar(
  actual: FotografoEdicion,
  datos: ReturnType<typeof limpiar>,
  contrasenya: string | undefined,
  operacion: { codigo: CodigoOperacion; datos: DatosRegla },
): FotografoFila {
  enOperacion(operacion.codigo, operacion.datos, () =>
    validar.edicionFotografo(actual.idFotografo, actual.nombreInformalNormalizado, { ...datos, contrasenya }),
  );

  const normalizado = normalizarNombre(datos.nombreInformal);

  enTransaccion(() => {
    actualizarFotografo(actual.idFotografo, {
      ...datos,
      nombreInformalNormalizado: normalizado,
      passwordHash: contrasenya ? hashContrasenya(contrasenya) : null,
    });
    renombrarCarpeta(path.join(fotosDir, actual.nombreInformalNormalizado), path.join(fotosDir, normalizado));
  });

  if (datos.nombreInformal !== actual.nombreInformal) {
    rmSync(rutaLogo(actual.nombreInformalNormalizado), { force: true });
  }
  return obtenerFotografo(normalizado)!;
}

// Edición desde la aplicación. Una contraseña vacía conserva la actual.
export function editarFotografo(fotografo: string, cambios: FotografoAlta): FotografoFila {
  const actual = cargar(fotografo);
  return modificar(actual, limpiar(cambios), cambios.contrasenya || undefined, {
    codigo: 'EDITAR_FOTOGRAFO',
    datos: { nombreInformal: actual.nombreInformal },
  });
}

// Solo cambia el nombre informal (comando npm run fotografo:renombrar).
export function cambiarNombreInformal(fotografo: string, nuevoNombreInformal: string) {
  const actual = cargar(fotografo);
  const nombreInformal = nuevoNombreInformal.trim();
  const datos = {
    nombreInformal,
    nombre: actual.nombre,
    primerApellido: actual.primerApellido,
    segundoApellido: actual.segundoApellido,
    email: actual.email,
    descripcion: actual.descripcion,
  };
  const despues = modificar(actual, datos, undefined, {
    codigo: 'CAMBIAR_NOMBRE_INFORMAL',
    datos: { actual: actual.nombreInformal, nuevo: nombreInformal },
  });

  return {
    antes: { nombreInformal: actual.nombreInformal, nombreInformalNormalizado: actual.nombreInformalNormalizado },
    despues: { nombreInformal: despues.nombreInformal, nombreInformalNormalizado: despues.nombreInformalNormalizado },
    carpetaRenombrada: despues.nombreInformalNormalizado !== actual.nombreInformalNormalizado,
  };
}

// Elimina un fotógrafo con todo su contenido: portfolios, álbumes y fotos (BD en cascada), su
// carpeta de fotos y su logo. Si tiene portfolios exige confirmación (regla
// FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS). La carpeta se aparta a la papelera dentro de la transacción y
// solo se borra de verdad cuando el borrado en la BD está confirmado (ver apartarCarpeta).
export function eliminarFotografo(fotografo: string, confirmado: boolean): void {
  const actual = cargar(fotografo);
  enOperacion('ELIMINAR_FOTOGRAFO', { nombreInformal: actual.nombreInformal }, () =>
    validar.eliminacionFotografo(numeroPortfolios(actual.idFotografo), confirmado),
  );

  const papelera = enTransaccion(() => {
    eliminarFotografoBD(actual.idFotografo);
    return apartarCarpeta(path.join(fotosDir, actual.nombreInformalNormalizado), fotosDir);
  });

  rmSync(rutaLogo(actual.nombreInformalNormalizado), { force: true });
  vaciarPapelera(papelera);
}

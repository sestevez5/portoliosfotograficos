import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fotosDir } from '../config/rutas.js';
import {
  actualizarFotografo,
  actualizarUsuario,
  eliminarUsuario,
  enTransaccion,
  insertarFotografo,
  insertarUsuario,
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
import type { FotografoAlta, RegistroFotografo } from '../types/catalogo.js';
import { hashContrasenya } from '../utils/contrasenya.js';
import { apartarCarpeta, renombrarCarpeta, vaciarPapelera } from '../utils/carpetas.js';
import { normalizarNombre } from '../utils/normalizar-nombre.js';
import { generarUsuario } from '../utils/usuario.js';
import { rutaFotoPerfil } from './foto-perfil.service.js';
import { rutaLogo } from './logo.service.js';
import { borrarMiniaturas } from './miniatura.service.js';

// Alta, edición y eliminación de fotógrafos. La carpeta fotos/<nombreInformalNormalizado>
// de cada fotógrafo debe existir y llamarse siempre así: estas funciones la crean, la renombran y
// la eliminan junto con la BD (dentro de la misma transacción). Todas validan antes las reglas de
// negocio (reglas/) dentro de su operación, y lanzan RecursoNoEncontrado si el fotógrafo no existe.
//
// Cada fotógrafo tiene su usuario (tabla usuarios: usuario, email y hash de la contraseña). El
// formulario del fotógrafo incluye el email y la contraseña, así que estas funciones mantienen
// fotógrafo y usuario juntos: se crean, se modifican y se eliminan en la misma transacción.

// Texto opcional del formulario: sin espacios sobrantes; vacío equivale a no indicado.
const opcional = (texto: string | null | undefined) => texto?.trim() || null;

// Datos del fotógrafo y email de su usuario, limpios.
function limpiar(alta: FotografoAlta) {
  return {
    nombreInformal: alta.nombreInformal.trim(),
    nombre: alta.nombre.trim(),
    primerApellido: alta.primerApellido.trim(),
    segundoApellido: opcional(alta.segundoApellido),
    descripcion: alta.descripcion?.trim() ?? '',
    email: opcional(alta.email),
  };
}

function cargar(fotografo: string): FotografoEdicion {
  const actual = obtenerFotografoEdicion(fotografo);
  if (!actual) {
    throw new RecursoNoEncontrado(`Fotógrafo '${fotografo}' no encontrado`);
  }
  return actual;
}

// Crea usuario, fotógrafo y carpeta en la misma transacción (ya validados). Sin nombre de usuario
// se calcula uno (interno) a partir del nombre y el primer apellido.
function guardarAlta(datos: Omit<ReturnType<typeof limpiar>, 'email'>, email: string | null, contrasenya: string | undefined, usuario?: string) {
  const nombreInformalNormalizado = normalizarNombre(datos.nombreInformal);
  enTransaccion(() => {
    const idUsuario = insertarUsuario({
      usuario: usuario ?? generarUsuario(datos.nombre, datos.primerApellido, usuarioExiste),
      email,
      passwordHash: contrasenya ? hashContrasenya(contrasenya) : null,
    });
    insertarFotografo({ ...datos, idUsuario, nombreInformalNormalizado });
    // recursive: en una instalación nueva fotos aún no existe (la del fotógrafo ya se ha
    // comprobado que no existe en la validación).
    mkdirSync(path.join(fotosDir, nombreInformalNormalizado), { recursive: true });
  });
  return obtenerFotografo(nombreInformalNormalizado)!;
}

// Alta desde la aplicación: crea su usuario (con el nombre de usuario calculado, que es interno, y
// solo el hash de la contraseña), el fotógrafo (con su nombreInformalNormalizado) y su carpeta.
export function crearFotografo(alta: FotografoAlta): FotografoFila {
  const { email, ...datos } = limpiar(alta);
  enOperacion('CREAR_FOTOGRAFO', { nombreInformal: datos.nombreInformal }, () =>
    validar.altaFotografo({ ...datos, email, contrasenya: alta.contrasenya }),
  );
  return guardarAlta(datos, email, alta.contrasenya);
}

// Registro desde la web: igual que el alta, pero con el nombre de usuario que elige la persona (en
// minúsculas) y con correo y contraseña obligatorios. Quien llama inicia después su sesión.
export function registrarFotografo(registro: RegistroFotografo): FotografoFila {
  const { email, ...datos } = limpiar(registro);
  const usuario = registro.usuario.trim().toLowerCase();
  enOperacion('REGISTRAR_USUARIO', { usuario }, () =>
    validar.registro({ ...datos, email, usuario, contrasenya: registro.contrasenya }),
  );
  return guardarAlta(datos, email, registro.contrasenya, usuario);
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
    validar.edicionFotografo(actual, actual.nombreInformalNormalizado, { ...datos, contrasenya }),
  );

  const { email, ...perfil } = datos;
  const normalizado = normalizarNombre(perfil.nombreInformal);

  enTransaccion(() => {
    actualizarFotografo(actual.idFotografo, { ...perfil, nombreInformalNormalizado: normalizado });
    actualizarUsuario(actual.idUsuario, { email, passwordHash: contrasenya ? hashContrasenya(contrasenya) : null });
    renombrarCarpeta(path.join(fotosDir, actual.nombreInformalNormalizado), path.join(fotosDir, normalizado));
  });

  if (datos.nombreInformal !== actual.nombreInformal) {
    rmSync(rutaLogo(actual.nombreInformalNormalizado), { force: true });
  }
  if (normalizado !== actual.nombreInformalNormalizado) {
    borrarMiniaturas(actual.nombreInformalNormalizado);
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

// Elimina un fotógrafo con todo su contenido: su usuario, portfolios, colecciones y fotos (se borra el
// usuario y el resto va en cascada), su carpeta de fotos, su logo y su foto de perfil. Si tiene portfolios exige
// confirmación (regla
// FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS). La carpeta se aparta a la papelera dentro de la transacción y
// solo se borra de verdad cuando el borrado en la BD está confirmado (ver apartarCarpeta).
export function eliminarFotografo(fotografo: string, confirmado: boolean): void {
  const actual = cargar(fotografo);
  enOperacion('ELIMINAR_FOTOGRAFO', { nombreInformal: actual.nombreInformal }, () =>
    validar.eliminacionFotografo(numeroPortfolios(actual.idFotografo), confirmado),
  );

  const papelera = enTransaccion(() => {
    eliminarUsuario(actual.idUsuario);
    return apartarCarpeta(path.join(fotosDir, actual.nombreInformalNormalizado), fotosDir);
  });

  rmSync(rutaLogo(actual.nombreInformalNormalizado), { force: true });
  rmSync(rutaFotoPerfil(actual.idUsuario), { force: true });
  vaciarPapelera(papelera);
  borrarMiniaturas(actual.nombreInformalNormalizado);
}

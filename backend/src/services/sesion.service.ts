import { createHash, randomBytes } from 'node:crypto';
import { SinSesion } from '../errores.js';
import {
  cambiarContrasenya,
  cambiarNombreUsuario,
  eliminarOtrasSesiones,
  eliminarSesion,
  enTransaccion,
  guardarTemaPreferido,
  idUsuarioDeSesion,
  insertarSesion,
  obtenerPerfil,
  obtenerUsuarioSesion,
  passwordHashDe,
  registrarAcceso,
  usuarioParaIniciarSesion,
  validar,
} from '../db/catalogo.repository.js';
import { enOperacion, exigir } from '../reglas/index.js';
import type { CuentaEdicion, Perfil, Preferencias, UsuarioSesion } from '../types/catalogo.js';
import { hashContrasenya, verificarContrasenya } from '../utils/contrasenya.js';
import { urlFotoPerfil } from './foto-perfil.service.js';

// Sesiones: al iniciar sesión se genera un token aleatorio que el navegador guarda en una cookie
// HttpOnly (el JavaScript de la página no puede leerlo) y la BD guarda solo su hash (tabla
// sesiones), así que quien lea la BD no puede suplantar a nadie. Caducan a los DURACION_SESION_DIAS.
//
// Todavía no se restringe nada según quién tenga la sesión iniciada: solo se identifica al usuario.

export const COOKIE_SESION = 'sesion';
export const DURACION_SESION_DIAS = 30;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Abre una sesión para el usuario y devuelve el token que se envía al navegador.
export function crearSesion(idUsuario: number): string {
  const token = randomBytes(32).toString('base64url');
  const expiracion = new Date(Date.now() + DURACION_SESION_DIAS * 24 * 60 * 60 * 1000).toISOString();
  insertarSesion(idUsuario, hashToken(token), expiracion);
  registrarAcceso(idUsuario);
  return token;
}

// Con el nombre de usuario o el correo y la contraseña. El mensaje de error es el mismo si el
// usuario no existe, si no tiene contraseña o si no coincide, para no revelar cuál falla.
export function iniciarSesion(identificador: string, contrasenya: string): string {
  return enOperacion('INICIAR_SESION', {}, () => {
    const usuario = usuarioParaIniciarSesion(identificador.trim().toLowerCase());
    exigir(
      !!usuario?.passwordHash && verificarContrasenya(contrasenya, usuario.passwordHash),
      'USUARIO_CREDENCIALES_INCORRECTAS',
    );
    return crearSesion(usuario!.idUsuario);
  });
}

// Usuario de la sesión del token (null si no hay sesión, no existe o ha caducado).
export function usuarioDeSesion(token: string | undefined): UsuarioSesion | null {
  const idUsuario = token ? idUsuarioDeSesion(hashToken(token)) : undefined;
  const fila = idUsuario !== undefined ? obtenerUsuarioSesion(idUsuario) : undefined;
  if (!fila) {
    return null;
  }
  return {
    usuario: fila.usuario,
    ...(fila.email !== null && { email: fila.email }),
    rol: fila.rol,
    ...(fila.temaPreferido !== null && { temaPreferido: fila.temaPreferido }),
    ...(fila.nombreInformalNormalizado !== null &&
      fila.fotoActualizada !== null && { fotoUrl: urlFotoPerfil(fila.nombreInformalNormalizado, fila.fotoActualizada) }),
    ...(fila.nombreInformal !== null &&
      fila.nombreInformalNormalizado !== null && {
        fotografo: {
          nombreInformal: fila.nombreInformal,
          nombreInformalNormalizado: fila.nombreInformalNormalizado,
          logoUrl: `/api/fotografos/${fila.nombreInformalNormalizado}/logo`,
        },
      }),
  };
}

export function cerrarSesion(token: string | undefined): void {
  if (token) {
    eliminarSesion(hashToken(token));
  }
}

// Para lo que solo tiene sentido con la sesión iniciada ("Mi perfil", "Editar cuenta"): el
// idUsuario de la sesión, o SinSesion (401) si no hay.
function exigirSesion(token: string | undefined): number {
  const idUsuario = token ? idUsuarioDeSesion(hashToken(token)) : undefined;
  if (idUsuario === undefined) {
    throw new SinSesion();
  }
  return idUsuario;
}

// "Mi perfil": todo lo del usuario de la sesión y, si lo es, de su fotógrafo.
export function perfilDeSesion(token: string | undefined): Perfil {
  const fila = obtenerPerfil(exigirSesion(token))!;
  const sinNulos = <K extends string, V>(clave: K, valor: V | null) => (valor === null ? {} : { [clave]: valor });
  return {
    usuario: fila.usuario,
    ...sinNulos('email', fila.email),
    rol: fila.rol,
    ...sinNulos('temaPreferido', fila.temaPreferido),
    ...(fila.nombreInformalNormalizado !== null &&
      fila.fotoActualizada !== null && { fotoUrl: urlFotoPerfil(fila.nombreInformalNormalizado, fila.fotoActualizada) }),
    fechaCreacion: fila.fechaCreacion,
    ...sinNulos('fechaUltimoAcceso', fila.fechaUltimoAcceso),
    tieneContrasenya: fila.tieneContrasenya === 1,
    ...(fila.idFotografo !== null && {
      fotografo: {
        nombreInformal: fila.nombreInformal!,
        nombreInformalNormalizado: fila.nombreInformalNormalizado!,
        nombre: fila.nombre!,
        primerApellido: fila.primerApellido!,
        ...sinNulos('segundoApellido', fila.segundoApellido),
        descripcion: fila.descripcion ?? '',
        logoUrl: `/api/fotografos/${fila.nombreInformalNormalizado}/logo`,
        portfolioCount: fila.portfolioCount,
        collectionCount: fila.collectionCount,
      },
    }),
  } as Perfil;
}

// El tema que prefiere el usuario de la sesión (null = sin preferencia); PUT /api/perfil/preferencias.
export function guardarPreferencias(token: string | undefined, preferencias: Preferencias): void {
  guardarTemaPreferido(exigirSesion(token), preferencias.temaPreferido);
}

// "Editar cuenta" ("Mi perfil"): el nombre de usuario (se guarda en minúsculas, con las mismas reglas
// que al registrarse), las preferencias y, si se indica (cuenta.contrasenya), la contraseña del
// usuario de la sesión. Todo se valida antes y se guarda junto, en una transacción: o todo o nada. El
// nombre del administrador no se puede cambiar: es el usuario especial "admin".
//
// La contraseña exige la actual y una nueva válida y distinta. Al cambiarla se cierran las demás
// sesiones del usuario (otros navegadores), por si la cambia porque alguien la conocía; la de quien la
// cambia sigue abierta.
export function editarCuenta(token: string | undefined, cuenta: CuentaEdicion): void {
  const idUsuario = exigirSesion(token);
  const actual = obtenerPerfil(idUsuario)!;
  const usuario = cuenta.usuario.trim().toLowerCase();
  const { contrasenya } = cuenta;
  enOperacion('EDITAR_CUENTA', { usuario: actual.usuario }, () => {
    exigir(usuario !== '', 'USUARIO_OBLIGATORIO');
    exigir(actual.rol !== 'administrador' || usuario === actual.usuario, 'USUARIO_ADMINISTRADOR_NO_RENOMBRABLE', {
      usuario: actual.usuario,
    });
    validar.usuario({ usuario }, idUsuario);
    if (contrasenya) {
      const hash = passwordHashDe(idUsuario);
      exigir(!!hash && verificarContrasenya(contrasenya.contrasenyaActual, hash), 'USUARIO_CONTRASENYA_ACTUAL_INCORRECTA');
      exigir(contrasenya.contrasenyaNueva !== '', 'USUARIO_CONTRASENYA_OBLIGATORIA');
      validar.usuario({ contrasenya: contrasenya.contrasenyaNueva });
      exigir(contrasenya.contrasenyaNueva !== contrasenya.contrasenyaActual, 'USUARIO_CONTRASENYA_REPETIDA');
    }
  });
  enTransaccion(() => {
    cambiarNombreUsuario(idUsuario, usuario);
    guardarTemaPreferido(idUsuario, cuenta.temaPreferido);
    if (contrasenya) {
      cambiarContrasenya(idUsuario, hashContrasenya(contrasenya.contrasenyaNueva));
      eliminarOtrasSesiones(idUsuario, hashToken(token!));
    }
  });
}

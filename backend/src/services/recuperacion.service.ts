import { randomBytes } from 'node:crypto';
import {
  cambiarContrasenya,
  eliminarRecuperacion,
  eliminarSesionesDe,
  enTransaccion,
  guardarRecuperacion,
  idUsuarioDeRecuperacion,
  recuperacionReciente,
  usuarioParaRecuperar,
  validar,
} from '../db/catalogo.repository.js';
import { enOperacion, exigir, exigirEmailValido } from '../reglas/index.js';
import { enviarCorreo } from '../utils/correo.js';
import { hashContrasenya } from '../utils/contrasenya.js';
import { hashToken } from './sesion.service.js';

// Recuperación de la contraseña ("¿Has olvidado tu contraseña?"): se pide con el correo de la cuenta
// y la aplicación envía a ese correo un enlace con un token aleatorio (la BD guarda solo su hash, como
// en las sesiones). Con el enlace se elige una contraseña nueva; entonces se cierran todas las
// sesiones del usuario (por si alguien la conocía) y el enlace deja de servir. Caduca a los
// DURACION_ENLACE_MINUTOS y pedir otro sustituye al anterior.
//
// La respuesta al pedirlo es la misma exista o no una cuenta con ese correo, para no revelar qué
// correos están registrados; por eso el correo se envía en segundo plano y, si falla, solo se avisa en
// la consola.

export const DURACION_ENLACE_MINUTOS = 60;

// Entre dos enlaces para el mismo usuario (para no enviar correos en ráfaga).
const ESPERA_ENTRE_ENLACES_SEGUNDOS = 60;

// Dirección de la web con la que se construye el enlace (PUBLIC_URL; en desarrollo, la de ng serve).
// No se toma de la petición: quien la hace podría falsear el origen y recibir así el token ajeno.
export function urlPublica(): string {
  // || y no ??: docker-compose.yml la pasa vacía si no está en .env.
  return (process.env.PUBLIC_URL || 'http://localhost:4200').replace(/\/+$/, '');
}

export function solicitarRecuperacion(email: string): void {
  const limpio = email.trim();
  enOperacion('SOLICITAR_RECUPERACION', {}, () => exigirEmailValido(limpio));
  const usuario = usuarioParaRecuperar(limpio);
  if (!usuario || recuperacionReciente(usuario.idUsuario, ESPERA_ENTRE_ENLACES_SEGUNDOS)) {
    return;
  }
  const token = randomBytes(32).toString('base64url');
  const expiracion = new Date(Date.now() + DURACION_ENLACE_MINUTOS * 60 * 1000).toISOString();
  guardarRecuperacion(usuario.idUsuario, hashToken(token), expiracion);

  const enlace = `${urlPublica()}/recuperar-contrasenya/nueva?token=${token}`;
  const saludo = usuario.nombre ? `Hola, ${usuario.nombre}:` : 'Hola:';
  const aviso = `El enlace caduca en ${DURACION_ENLACE_MINUTOS} minutos y solo sirve una vez. Si no has pedido cambiar la contraseña, ignora este correo: tu contraseña no cambiará.`;
  enviarCorreo({
    para: usuario.email,
    asunto: 'Recupera tu contraseña de Portfolios fotográficos',
    texto: `${saludo}\n\nPara elegir una contraseña nueva, abre este enlace:\n\n${enlace}\n\n${aviso}\n`,
    html: `<p>${escaparHtml(saludo)}</p>
<p>Para elegir una contraseña nueva, pulsa este enlace:</p>
<p><a href="${enlace}">Elegir una contraseña nueva</a></p>
<p>Si no funciona, copia esta dirección en el navegador:<br>${enlace}</p>
<p>${aviso}</p>`,
  }).catch((error: unknown) => {
    console.error(`No se ha podido enviar el correo para recuperar la contraseña a ${usuario.email}:`, error);
  });
}

// Para que la web avise antes de pedir la contraseña si el enlace ya no sirve.
export function comprobarEnlace(token: string): void {
  enOperacion('RESTABLECER_CONTRASENYA', {}, () => usuarioDelEnlace(token));
}

// Cambia la contraseña del usuario del enlace y devuelve su idUsuario (para iniciar su sesión).
export function restablecerContrasenya(token: string, contrasenyaNueva: string): number {
  const idUsuario = enOperacion('RESTABLECER_CONTRASENYA', {}, () => {
    const id = usuarioDelEnlace(token);
    exigir(contrasenyaNueva !== '', 'USUARIO_CONTRASENYA_OBLIGATORIA');
    validar.usuario({ contrasenya: contrasenyaNueva });
    return id;
  });
  enTransaccion(() => {
    cambiarContrasenya(idUsuario, hashContrasenya(contrasenyaNueva));
    eliminarSesionesDe(idUsuario);
    eliminarRecuperacion(idUsuario);
  });
  return idUsuario;
}

function usuarioDelEnlace(token: string): number {
  const idUsuario = token ? idUsuarioDeRecuperacion(hashToken(token)) : undefined;
  exigir(idUsuario !== undefined, 'RECUPERACION_ENLACE_NO_VALIDO', { minutos: DURACION_ENLACE_MINUTOS });
  return idUsuario!;
}

const escaparHtml = (texto: string) =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

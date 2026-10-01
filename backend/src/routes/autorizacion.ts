import type { Request } from 'express';
import { VER_TODO, type Vista } from '../db/catalogo.repository.js';
import { SinPermiso, SinSesion } from '../errores.js';
import { COOKIE_SESION, usuarioDeSesion } from '../services/sesion.service.js';
import type { UsuarioSesion } from '../types/catalogo.js';
import { normalizarNombre } from '../utils/normalizar-nombre.js';

// Permisos para modificar el catálogo. El administrador puede modificarlo todo; cualquier otro
// usuario, solo lo suyo: sus datos de usuario y de fotógrafo, su foto, sus portfolios, sus
// colecciones (y sus fotos). Sin sesión no se puede modificar nada (salvo registrarse). Lo que no
// se cumple se responde con 401 (sin sesión, SinSesion) o 403 (sin permiso, SinPermiso).
//
// La web esconde además los botones de lo que el usuario no puede modificar, pero quien protege
// de verdad es esto: la API se puede llamar directamente.

// El token de la cookie de sesión (HttpOnly), si la hay.
export function tokenDeSesion(req: Request): string | undefined {
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const [nombre, ...valor] = parte.trim().split('=');
    if (nombre === COOKIE_SESION) {
      return decodeURIComponent(valor.join('='));
    }
  }
  return undefined;
}

// Qué ve del catálogo quien hace la petición (ver "Visibilidad" en db/catalogo.repository.ts): el
// administrador, todo; un fotógrafo, lo visible y además lo oculto suyo; los demás, solo lo visible.
export function vistaDe(req: Request): Vista {
  const usuario = usuarioDeSesion(tokenDeSesion(req));
  if (!usuario) {
    return null;
  }
  return usuario.rol === 'administrador' ? VER_TODO : (usuario.fotografo?.nombreInformalNormalizado ?? null);
}

function exigirSesion(req: Request): UsuarioSesion {
  const usuario = usuarioDeSesion(tokenDeSesion(req));
  if (!usuario) {
    throw new SinSesion();
  }
  return usuario;
}

// Solo el administrador (p. ej. dar de alta fotógrafos desde /admin).
export function exigirAdministrador(req: Request): void {
  if (exigirSesion(req).rol !== 'administrador') {
    throw new SinPermiso('Solo el administrador puede hacer esta operación.');
  }
}

// Lo que pertenece a un fotógrafo (sus datos, su foto, sus portfolios y colecciones): solo él
// mismo o el administrador. fotografo es el segmento de la URL (se compara normalizado).
export function exigirDuenyoOAdministrador(req: Request, fotografo: string): void {
  const usuario = exigirSesion(req);
  if (usuario.rol === 'administrador' || usuario.fotografo?.nombreInformalNormalizado === normalizarNombre(fotografo)) {
    return;
  }
  throw new SinPermiso();
}

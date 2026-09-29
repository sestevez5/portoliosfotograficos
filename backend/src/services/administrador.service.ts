import {
  cambiarContrasenya,
  enTransaccion,
  obtenerAdministrador,
  registrarAcceso,
  validar,
} from '../db/catalogo.repository.js';
import { enOperacion, exigir } from '../reglas/index.js';
import { hashContrasenya, verificarContrasenya } from '../utils/contrasenya.js';

// El administrador: usuario especial "admin", gestor de la aplicación. Lo crea la base de datos con
// la contraseña "admin" (ver ADMINISTRADOR en db/conexion.ts), que se puede cambiar.
//
// Primer uso: mientras el administrador no haya entrado nunca (fechaUltimoAcceso vacía), la web
// pide sus credenciales y ofrece cambiar la contraseña; al completarlo queda registrado el acceso.
//
// Todavía no hay sesiones ni se restringe nada: estas funciones solo comprueban las credenciales
// en cada operación.

export interface PrimerUso {
  usuario: string;
  contrasenya: string;
  // Opcional: si se indica, sustituye a la contraseña actual.
  contrasenyaNueva?: string;
}

export interface CambioContrasenya {
  contrasenyaActual: string;
  contrasenyaNueva: string;
}

export function esPrimerUso(): boolean {
  return obtenerAdministrador().fechaUltimoAcceso === null;
}

// Comprueba que usuario y contraseña son los del administrador (mismo mensaje en ambos casos, para
// no revelar cuál de los dos falla).
function comprobarCredenciales(usuario: string, contrasenya: string) {
  const administrador = obtenerAdministrador();
  exigir(
    usuario.trim().toLowerCase() === administrador.usuario && verificarContrasenya(contrasenya, administrador.passwordHash),
    'USUARIO_CREDENCIALES_INCORRECTAS',
  );
  return administrador;
}

// La contraseña nueva debe cumplir las reglas de cualquier contraseña y ser distinta de la actual.
function comprobarContrasenyaNueva(actual: string, nueva: string): void {
  validar.usuario({ contrasenya: nueva });
  exigir(nueva !== actual, 'USUARIO_CONTRASENYA_REPETIDA');
}

// Devuelve el idUsuario del administrador (quien llama le abre la sesión).
export function completarPrimerUso(datos: PrimerUso): number {
  return enOperacion('COMPLETAR_PRIMER_USO', {}, () => {
    exigir(esPrimerUso(), 'PRIMER_USO_COMPLETADO');
    const administrador = comprobarCredenciales(datos.usuario, datos.contrasenya);
    if (datos.contrasenyaNueva) {
      comprobarContrasenyaNueva(datos.contrasenya, datos.contrasenyaNueva);
    }
    enTransaccion(() => {
      if (datos.contrasenyaNueva) {
        cambiarContrasenya(administrador.idUsuario, hashContrasenya(datos.contrasenyaNueva));
      }
      registrarAcceso(administrador.idUsuario);
    });
    return administrador.idUsuario;
  });
}

export function cambiarContrasenyaAdministrador(datos: CambioContrasenya): void {
  enOperacion('CAMBIAR_CONTRASENYA_ADMINISTRADOR', {}, () => {
    const administrador = comprobarCredenciales(obtenerAdministrador().usuario, datos.contrasenyaActual);
    comprobarContrasenyaNueva(datos.contrasenyaActual, datos.contrasenyaNueva);
    cambiarContrasenya(administrador.idUsuario, hashContrasenya(datos.contrasenyaNueva));
  });
}

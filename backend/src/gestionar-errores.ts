import type { ErrorRequestHandler } from 'express';
import { AccesoRestringido, RecursoNoEncontrado, SinPermiso, SinSesion } from './errores.js';
import { ReglaNegocioIncumplida } from './reglas/index.js';

// Una regla de negocio incumplida (reglas/) se responde con 422: qué se intentaba hacer
// (operacion), qué regla lo impide (regla) y el mensaje completo para mostrarlo tal cual.
// Un recurso inexistente, con 404; sin sesión cuando hace falta, con 401; sin permiso, con 403.
// Cualquier otro error es inesperado: se escribe en la consola y se responde 500 con un mensaje en
// JSON, para que la web lo muestre (sin él, decía "No se ha podido conectar con el servidor").
export const ERROR_INESPERADO =
  'Ha ocurrido un error inesperado en el servidor y no se ha guardado nada. Vuelve a intentarlo; si se repite, avisa al administrador.';

export const gestionarErrores: ErrorRequestHandler = (error, req, res, next) => {
  if (error instanceof ReglaNegocioIncumplida) {
    res.status(422).json(error.toJSON());
    return;
  }
  if (error instanceof RecursoNoEncontrado) {
    res.status(404).json({ message: error.message });
    return;
  }
  if (error instanceof SinSesion) {
    res.status(401).json({ message: error.message });
    return;
  }
  if (error instanceof AccesoRestringido) {
    res.status(403).json({ tipo: 'accesoRestringido', message: error.message });
    return;
  }
  if (error instanceof SinPermiso) {
    res.status(403).json({ message: error.message });
    return;
  }
  // Errores de Express con su propio código (p. ej. 413, un cuerpo demasiado grande, o 400, un JSON mal
  // formado): se dejan a su gestor. Y si ya se había empezado a responder, no se puede cambiar.
  const estado = (error as { status?: number; statusCode?: number }).status ?? (error as { statusCode?: number }).statusCode;
  if (res.headersSent || (estado !== undefined && estado < 500)) {
    next(error);
    return;
  }
  console.error(`Error inesperado en ${req.method} ${req.originalUrl}:`, error);
  res.status(500).json({ message: ERROR_INESPERADO });
};

import type { ErrorRequestHandler } from 'express';
import { RecursoNoEncontrado, SinPermiso, SinSesion } from './errores.js';
import { ReglaNegocioIncumplida } from './reglas/index.js';

// Una regla de negocio incumplida (reglas/) se responde con 422: qué se intentaba hacer
// (operacion), qué regla lo impide (regla) y el mensaje completo para mostrarlo tal cual.
// Un recurso inexistente, con 404; sin sesión cuando hace falta, con 401; sin permiso, con 403. El resto de errores sigue al gestor por defecto de Express.
export const gestionarErrores: ErrorRequestHandler = (error, _req, res, next) => {
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
  if (error instanceof SinPermiso) {
    res.status(403).json({ message: error.message });
    return;
  }
  next(error);
};

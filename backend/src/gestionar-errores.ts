import type { ErrorRequestHandler } from 'express';
import { RecursoNoEncontrado } from './errores.js';
import { ReglaNegocioIncumplida } from './reglas/index.js';

// Una regla de negocio incumplida (reglas/) se responde con 422: qué se intentaba hacer
// (operacion), qué regla lo impide (regla) y el mensaje completo para mostrarlo tal cual.
// Un recurso inexistente, con 404. El resto de errores sigue al gestor por defecto de Express.
export const gestionarErrores: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof ReglaNegocioIncumplida) {
    res.status(422).json(error.toJSON());
    return;
  }
  if (error instanceof RecursoNoEncontrado) {
    res.status(404).json({ message: error.message });
    return;
  }
  next(error);
};

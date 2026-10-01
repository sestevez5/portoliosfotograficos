import type { NextFunction, Request, Response } from 'express';
import { obtenerColeccion, obtenerFotografo, VER_TODO } from '../db/catalogo.repository.js';
import { vistaDe } from './autorizacion.js';

// Middleware para /photos, delante de las miniaturas y de express.static: solo deja pasar las fotos
// de las colecciones que puede ver quien las pide. Las de una colección oculta (o de un portfolio
// oculto) solo se sirven a su fotógrafo y al administrador (con la cookie de sesión, que el
// navegador envía también al pedir una imagen); para los demás no existen (404), aunque conozcan
// su dirección.
//
// Solo se sirve /photos/<fotógrafo>/<portfolio>/<colección>/<fichero> de una colección que esté en
// la BD: cualquier otra ruta es 404. Así no hay forma de llegar a una carpeta oculta escribiendo su
// nombre de otra manera que el sistema de ficheros sí admita (nombres cortos de Windows, puntos al
// final…). La ruta se decodifica entera antes de separarla, igual que hace express.static ("%2F").
export function soloFotosVisibles(req: Request, res: Response, next: NextFunction): void {
  let segmentos: string[];
  try {
    segmentos = decodeURIComponent(req.path)
      .split(/[\\/]+/)
      .filter((segmento) => segmento !== '');
  } catch {
    res.status(400).json({ message: 'Ruta no válida' });
    return;
  }

  const [fotografo, portfolio, coleccion] = segmentos;
  const f = segmentos.length === 4 ? obtenerFotografo(fotografo) : undefined;
  const c = f && obtenerColeccion(f.idFotografo, portfolio, coleccion);
  if (!f || !c) {
    res.status(404).end();
    return;
  }
  if (c.visible === 1 && c.portfolioVisible === 1) {
    next();
    return;
  }

  const ve = vistaDe(req);
  if (ve !== VER_TODO && ve !== f.nombreInformalNormalizado) {
    res.status(404).end();
    return;
  }
  // Que no se quede en cachés compartidas (ver miniaturas.routes.ts).
  res.locals.fotoOculta = true;
  res.set('Cache-Control', 'private, no-cache');
  next();
}

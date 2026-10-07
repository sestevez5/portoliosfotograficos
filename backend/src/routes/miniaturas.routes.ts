import type { NextFunction, Request, Response } from 'express';
import { ANCHOS_MINIATURA, type AnchoMiniatura, miniatura } from '../services/miniatura.service.js';

// Middleware para /photos, delante de express.static: si la petición lleva ?ancho=<ancho> sirve la
// versión AVIF de la foto a ese ancho (ver services/miniatura.service.ts); sin ?ancho, la foto tal cual.
// Si la miniatura no se puede generar (p. ej. un fichero dañado), se sirve la foto.
export function servirMiniaturas(req: Request, res: Response, next: NextFunction): void {
  if (req.query.ancho === undefined) {
    next();
    return;
  }
  const ancho = Number(req.query.ancho);
  if (!(ANCHOS_MINIATURA as readonly number[]).includes(ancho)) {
    res.status(400).json({ message: `El ancho debe ser uno de estos: ${ANCHOS_MINIATURA.join(', ')}` });
    return;
  }

  let relativa: string;
  try {
    relativa = decodeURIComponent(req.path);
  } catch {
    res.status(400).json({ message: 'Ruta no válida' });
    return;
  }

  miniatura(relativa, ancho as AnchoMiniatura).then(
    (fichero) => {
      if (!fichero) {
        next(); // no existe: express.static responde 404
        return;
      }
      // Un día en caché: si se cambia una foto por otra con el mismo nombre, se verá al día siguiente.
      // Las de una colección oculta (ver fotos-visibles.routes.ts), solo en la caché de quien puede verla.
      res.set('Cache-Control', `${res.locals.fotoOculta ? 'private' : 'public'}, max-age=86400`);
      res.sendFile(fichero, { headers: { 'Content-Type': 'image/avif' } }); // express no conoce .avif
    },
    (error: Error) => {
      console.warn(`Aviso: no se ha podido generar la miniatura de ${relativa} a ${ancho} px:`, error.message);
      next();
    },
  );
}

// Para express.static en /photos: express no conoce la extensión .avif y serviría las fotos como
// application/octet-stream.
export function tipoAvif(res: Response, ruta: string): void {
  if (ruta.toLowerCase().endsWith('.avif')) {
    res.setHeader('Content-Type', 'image/avif');
  }
}

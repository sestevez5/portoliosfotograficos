import { Router } from 'express';
import { describirPagina, generarRobots, generarSitemap, insertarEnPlantilla } from '../services/seo.service.js';
import { vistaDe } from './autorizacion.js';

// Rutas para los buscadores y las vistas previas de los enlaces (ver services/seo.service.ts). En
// Docker, nginx (frontend/nginx.conf) reenvía aquí /robots.txt, /sitemap.xml y cada página de la web
// (/pagina/<ruta de la página>); en desarrollo (ng serve) no se usan.

// De dónde se lee el index.html de la web: lo genera el build de Angular y está en la imagen del
// frontend, que nginx sirve en PLANTILLA_HTML_URL (en docker-compose.yml, http://frontend/index.html).
// Se guarda un minuto, para no pedirlo en cada página y ver igualmente una versión nueva al desplegar.
const DURACION_PLANTILLA_MS = 60_000;

type LeerPlantilla = () => Promise<string>;

async function leerDeFrontend(): Promise<string> {
  const url = process.env.PLANTILLA_HTML_URL;
  if (!url) {
    throw new Error('Falta PLANTILLA_HTML_URL (la dirección del index.html de la web)');
  }
  const respuesta = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!respuesta.ok) {
    throw new Error(`${url} ha respondido ${respuesta.status}`);
  }
  return respuesta.text();
}

let leerPlantilla: LeerPlantilla = leerDeFrontend;
let guardada: { html: string; hasta: number } | null = null;

// Para los tests: sustituye de dónde se lee el index.html.
export function cambiarPlantilla(leer: LeerPlantilla): void {
  leerPlantilla = leer;
  guardada = null;
}

async function plantilla(): Promise<string> {
  if (guardada && guardada.hasta > Date.now()) {
    return guardada.html;
  }
  try {
    const html = await leerPlantilla();
    guardada = { html, hasta: Date.now() + DURACION_PLANTILLA_MS };
    return html;
  } catch (error) {
    if (guardada) {
      return guardada.html; // mejor la anterior que ninguna
    }
    throw error;
  }
}

export const seoRouter = Router();

seoRouter.get('/robots.txt', (_req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(generarRobots());
});

seoRouter.get('/sitemap.xml', (_req, res) => {
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(generarSitemap());
});

// La página de la web con su <head> relleno y su código de estado (404 si no existe, 403 si está
// bloqueada). Depende de quién mira (lo oculto solo lo ve su fotógrafo), así que no se guarda en
// cachés compartidas. Si no se puede leer el index.html responde 502, y nginx sirve entonces el
// index.html tal cual (la web funciona igual, sin los metadatos).
seoRouter.get(/^\/pagina(\/.*)?$/, (req, res, next) => {
  const ruta = req.path.slice('/pagina'.length) || '/';
  plantilla()
    .then(
      (html) => {
        const pagina = describirPagina(ruta, vistaDe(req));
        res
          .status(pagina.estado)
          .type('html')
          .set('Cache-Control', 'private, no-cache')
          .send(insertarEnPlantilla(html, pagina));
      },
      (error: Error) => {
        console.warn('Aviso: no se ha podido leer el index.html de la web:', error.message);
        res.status(502).type('text/plain').send('No se ha podido leer el index.html de la web');
      },
    )
    .catch(next);
});

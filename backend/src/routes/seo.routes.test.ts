import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import express from 'express';
import sharp from 'sharp';

// SEO: el index.html de cada página con su <head> (título, descripción, canónica, Open Graph, JSON-LD) y
// su código de estado, robots.txt, sitemap.xml y el JPEG para compartir. Lo oculto y lo bloqueado no
// salen para quien no puede verlo.
const datos = mkdtempSync(path.join(tmpdir(), 'portfolio-datos-'));
process.env.DATOS_DIR = datos;
process.env.PUBLIC_URL = 'https://fotos.example.com/';

const { catalogoRouter } = await import('./catalogo.routes.js');
const { seoRouter, cambiarPlantilla } = await import('./seo.routes.js');
const { soloFotosVisibles } = await import('./fotos-visibles.routes.js');
const { servirMiniaturas } = await import('./miniaturas.routes.js');
const { gestionarErrores } = await import('../gestionar-errores.js');
const { abrirBaseDatos } = await import('../db/conexion.js');
const { fotosDir } = await import('../config/rutas.js');
const { registrarFotografo } = await import('../services/fotografo.service.js');
const { crearPortfolio, cambiarVisibilidadPortfolio } = await import('../services/portfolio.service.js');
const { crearColeccion, cambiarVisibilidadColeccion } = await import('../services/coleccion.service.js');
const { anyadirFoto, cambiarTituloFoto } = await import('../services/foto.service.js');
const { recortarDescripcion } = await import('../services/seo.service.js');

const PLANTILLA = `<!doctype html>
<html lang="es">
<head>
  <!-- seo -->
  <title>Genérico</title>
  <meta name="description" content="Genérica">
  <!-- /seo -->
</head>
<body><app-root></app-root></body>
</html>`;
cambiarPlantilla(async () => PLANTILLA);

const db = abrirBaseDatos();
const app = express();
app.use('/api', catalogoRouter);
app.use(seoRouter);
app.use('/photos', soloFotosVisibles, servirMiniaturas, express.static(fotosDir, { dotfiles: 'ignore' }));
app.use(gestionarErrores);
const servidor = app.listen(0);
const base = `http://localhost:${(servidor.address() as AddressInfo).port}`;

after(() => {
  servidor.close();
  db.close();
  try {
    rmSync(datos, { recursive: true, force: true });
  } catch {
    // se limpiará con el resto de temporales del sistema
  }
});

// Ana Prieto ("Ana"): portfolio "Viajes" con las colecciones "Mar" (una foto con título) y "Monte"
// (oculta), y "Secreto" (bloqueado), con la colección "Cueva".
registrarFotografo({
  usuario: 'ana',
  email: 'ana@x.com',
  contrasenya: 'secreta123',
  nombreInformal: 'Ana',
  nombre: 'Ana',
  primerApellido: 'Prieto',
  descripcion: 'Fotógrafa de viajes <y> "mar".',
});
crearPortfolio('ana', { nombre: 'Viajes', descripcion: 'Viajes por el mundo' });
crearPortfolio('ana', { nombre: 'Secreto' });
crearColeccion('ana', 'viajes', { nombre: 'Mar' });
crearColeccion('ana', 'viajes', { nombre: 'Monte' });
crearColeccion('ana', 'secreto', { nombre: 'Cueva' });
const jpeg = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#406080' } }).jpeg().toBuffer();
await anyadirFoto('ana', 'viajes', 'mar', 'Ola grande.jpg', jpeg);
cambiarTituloFoto('ana', 'viajes', 'mar', 'Ola grande.avif', 'La ola');
await anyadirFoto('ana', 'secreto', 'cueva', 'oscura.jpg', jpeg);
cambiarVisibilidadColeccion('ana', 'viajes', 'monte', 'oculto');
cambiarVisibilidadPortfolio('ana', 'secreto', 'bloqueado');

const pagina = async (ruta: string) => {
  const respuesta = await fetch(`${base}/pagina${ruta}`);
  return { estado: respuesta.status, html: await respuesta.text() };
};

// El JSON-LD de una página.
const datosEstructurados = (html: string) =>
  JSON.parse(/<script type="application\/ld\+json" id="datos-estructurados">([\s\S]*?)<\/script>/.exec(html)![1]);

test('la portada lleva el título del sitio, la canónica y el JSON-LD de WebSite', async () => {
  const { estado, html } = await pagina('/');
  assert.equal(estado, 200);
  assert.match(html, /<title>Portfolios fotográficos<\/title>/);
  assert.doesNotMatch(html, /Genérico/);
  assert.match(html, /<link rel="canonical" href="https:\/\/fotos\.example\.com\/">/);
  assert.doesNotMatch(html, /noindex/);
  assert.equal(datosEstructurados(html)['@type'], 'WebSite');
  assert.match(html, /<app-root><\/app-root>/);
});

test('la página del fotógrafo: título, descripción escapada, imagen JPEG y ProfilePage', async () => {
  const { estado, html } = await pagina('/Ana');
  assert.equal(estado, 200);
  assert.match(html, /<title>Ana · Portfolios fotográficos<\/title>/);
  assert.match(html, /<meta name="description" content="Fotógrafa de viajes &lt;y&gt; &quot;mar&quot;\.">/);
  // Canónica con el nombre normalizado, aunque se pida "/Ana".
  assert.match(html, /<link rel="canonical" href="https:\/\/fotos\.example\.com\/ana">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/fotos\.example\.com\/photos\/ana\/viajes\/mar\/Ola%20grande\.avif\?compartir">/);
  assert.match(html, /<meta property="og:type" content="profile">/);
  const jsonLd = datosEstructurados(html);
  assert.equal(jsonLd['@type'], 'ProfilePage');
  assert.equal(jsonLd.mainEntity.name, 'Ana');
  assert.equal(jsonLd.mainEntity.alternateName, 'Ana Prieto');
});

test('la página de una colección: ImageGallery con sus fotos y las migas', async () => {
  const { estado, html } = await pagina('/ana/viajes/mar?limpia=true');
  assert.equal(estado, 200);
  assert.match(html, /<title>Mar · Viajes · Ana<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/fotos\.example\.com\/ana\/viajes\/mar">/);
  const [galeria, migas] = datosEstructurados(html);
  assert.equal(galeria['@type'], 'ImageGallery');
  assert.equal(galeria.image.length, 1);
  assert.deepEqual(galeria.image[0], {
    '@type': 'ImageObject',
    contentUrl: 'https://fotos.example.com/photos/ana/viajes/mar/Ola%20grande.avif',
    thumbnailUrl: 'https://fotos.example.com/photos/ana/viajes/mar/Ola%20grande.avif?ancho=960',
    name: 'La ola',
    width: 1600,
    height: 1000,
    creator: { '@type': 'Person', name: 'Ana Prieto' },
    creditText: 'Ana Prieto',
    copyrightNotice: '© Ana Prieto',
    acquireLicensePage: 'https://fotos.example.com/ana',
  });
  assert.equal(migas['@type'], 'BreadcrumbList');
  assert.deepEqual(
    migas.itemListElement.map((e: { name: string }) => e.name),
    ['Ana', 'Viajes', 'Mar'],
  );
});

test('el portfolio solo enumera las colecciones visibles', async () => {
  const { html } = await pagina('/ana/viajes');
  const [portfolio] = datosEstructurados(html);
  assert.equal(portfolio['@type'], 'CollectionPage');
  assert.deepEqual(
    portfolio.hasPart.map((c: { name: string }) => c.name),
    ['Mar'],
  );
});

test('lo que no existe o está oculto responde 404 y noindex; lo bloqueado, 403', async () => {
  for (const ruta of ['/nadie', '/ana/nada', '/ana/viajes/monte', '/ana/viajes/mar/de/mas']) {
    const { estado, html } = await pagina(ruta);
    assert.equal(estado, 404, ruta);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.doesNotMatch(html, /Monte/);
  }
  for (const ruta of ['/ana/secreto', '/ana/secreto/cueva']) {
    const { estado, html } = await pagina(ruta);
    assert.equal(estado, 403, ruta);
    assert.match(html, /noindex/);
    assert.doesNotMatch(html, /og:image|ld\+json|oscura/);
  }
});

test('las páginas de la aplicación (formularios, gestión…) no se indexan', async () => {
  for (const ruta of ['/registro', '/gestion/ana/portfolios/nuevo', '/perfil']) {
    const { estado, html } = await pagina(ruta);
    assert.equal(estado, 200, ruta);
    assert.match(html, /<meta name="robots" content="noindex">/);
  }
});

test('su fotógrafo entra en lo oculto, pero no se indexa', async () => {
  const cookie = (
    await fetch(`${base}/api/sesion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'ana', contrasenya: 'secreta123' }),
    })
  ).headers
    .get('set-cookie')!
    .split(';')[0];
  const respuesta = await fetch(`${base}/pagina/ana/viajes/monte`, { headers: { Cookie: cookie } });
  assert.equal(respuesta.status, 200);
  assert.match(await respuesta.text(), /noindex/);
});

test('sin el index.html de la web responde 502 (y nginx sirve el de siempre)', async () => {
  cambiarPlantilla(async () => {
    throw new Error('sin frontend');
  });
  try {
    assert.equal((await fetch(`${base}/pagina/ana`)).status, 502);
  } finally {
    cambiarPlantilla(async () => PLANTILLA);
  }
});

test('sitemap.xml: solo lo visible, con fechas y las fotos de cada colección', async () => {
  const respuesta = await fetch(`${base}/sitemap.xml`);
  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get('content-type')!, /application\/xml/);
  const xml = await respuesta.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(urls, [
    'https://fotos.example.com/',
    'https://fotos.example.com/ana',
    'https://fotos.example.com/ana/viajes',
    'https://fotos.example.com/ana/viajes/mar',
  ]);
  assert.match(xml, /<image:loc>https:\/\/fotos\.example\.com\/photos\/ana\/viajes\/mar\/Ola%20grande\.avif<\/image:loc>/);
  assert.match(xml, /<lastmod>\d{4}-\d{2}-\d{2}T/);
  assert.doesNotMatch(xml, /monte|secreto|cueva|oscura/);
});

test('robots.txt: fuera las páginas de la aplicación y la API, y la dirección del sitemap', async () => {
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  assert.match(robots, /^Disallow: \/admin\/$/m);
  assert.match(robots, /^Disallow: \/registro\$$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, /^Disallow: \/\*\?limpia=$/m);
  assert.doesNotMatch(robots, /photos/);
  assert.match(robots, /^Sitemap: https:\/\/fotos\.example\.com\/sitemap\.xml$/m);
});

test('?compartir sirve un JPEG de 1200 px; el de lo bloqueado, no', async () => {
  const respuesta = await fetch(`${base}/photos/ana/viajes/mar/Ola%20grande.avif?compartir`);
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('content-type'), 'image/jpeg');
  const imagen = await sharp(Buffer.from(await respuesta.arrayBuffer())).metadata();
  assert.equal(imagen.format, 'jpeg');
  assert.equal(imagen.width, 1200);
  assert.equal((await fetch(`${base}/photos/ana/secreto/cueva/oscura.avif?compartir`)).status, 404);
});

test('recortarDescripcion: sin saltos de línea y recortada por una palabra', () => {
  assert.equal(recortarDescripcion('  Una\n\nfoto  bonita '), 'Una foto bonita');
  const larga = recortarDescripcion('palabra '.repeat(40));
  assert.ok(larga.length <= 160);
  assert.match(larga, /palabra…$/);
});

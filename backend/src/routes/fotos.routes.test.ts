import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import express from 'express';

// El repositorio abre la BD al importarse: se apunta antes a una carpeta de datos temporal
// (cada fichero de test se ejecuta en su propio proceso).
const datos = mkdtempSync(path.join(tmpdir(), 'portfolio-datos-'));
process.env.DATOS_DIR = datos;

const { catalogoRouter } = await import('./catalogo.routes.js');
const { gestionarErrores } = await import('../gestionar-errores.js');
const { abrirBaseDatos } = await import('../db/conexion.js');
const { crearFotografo } = await import('../services/fotografo.service.js');
const { crearPortfolio } = await import('../services/portfolio.service.js');
const { crearColeccion } = await import('../services/coleccion.service.js');

const db = abrirBaseDatos();
const app = express();
app.use('/api', catalogoRouter);
app.use(gestionarErrores);
const servidor = app.listen(0);
const raiz = `http://localhost:${(servidor.address() as AddressInfo).port}/api`;
const api = `${raiz}/fotografos/ana-uno/portfolios/viajes/colecciones/mar`;

// Las peticiones del test van con la sesión del administrador, que puede modificarlo todo (los
// permisos se prueban en permisos.routes.test.ts).
const cookieAdministrador = (
  await globalThis.fetch(`${raiz}/sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin', contrasenya: 'admin' }),
  })
).headers
  .get('set-cookie')!
  .split(';')[0];
const fetch = (url: string, init: RequestInit = {}) =>
  globalThis.fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Cookie: cookieAdministrador } });

after(() => {
  servidor.close();
  db.close();
  try {
    rmSync(datos, { recursive: true, force: true });
  } catch {
    // se limpiará con el resto de temporales del sistema
  }
});

crearFotografo({ nombreInformal: 'Ana Uno', nombre: 'Ana', primerApellido: 'Uno' });
crearPortfolio('ana-uno', { nombre: 'Viajes' });
crearColeccion('ana-uno', 'viajes', { nombre: 'Mar' });
const carpeta = path.join(datos, 'fotos', 'ana-uno', 'viajes', 'mar');

// Cabecera de un PNG de 640 x 480: firma y bloque IHDR (basta para reconocerlo y leer su tamaño).
function png(ancho: number, alto: number): Buffer {
  const cabecera = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(cabecera);
  cabecera.writeUInt32BE(13, 8);
  cabecera.write('IHDR', 12, 'ascii');
  cabecera.writeUInt32BE(ancho, 16);
  cabecera.writeUInt32BE(alto, 20);
  return cabecera;
}

const subir = (nombreFichero: string, cuerpo: Buffer, tipo = 'image/png') =>
  fetch(`${api}/fotos?nombreFichero=${encodeURIComponent(nombreFichero)}`, {
    method: 'POST',
    headers: { 'Content-Type': tipo },
    body: new Uint8Array(cuerpo),
  });

const fotosDeLaColeccion = async () => (await (await fetch(api)).json()).fotos as { nombreFichero: string; titulo?: string; orden: number; url: string }[];

test('subir fotos las guarda en la carpeta dla colección, al final y con su tamaño', async () => {
  const primera = await subir('playa.png', png(640, 480));
  assert.equal(primera.status, 201);
  assert.deepEqual(await primera.json(), {
    nombreFichero: 'playa.png',
    orden: 0,
    ancho: 640,
    alto: 480,
    url: '/photos/ana-uno/viajes/mar/playa.png',
  });
  assert.ok(existsSync(path.join(carpeta, 'playa.png')));

  // El nombre original se conserva (con espacios) y la URL va codificada.
  const segunda = await subir('Atardecer 2.png', png(100, 200));
  assert.equal(segunda.status, 201);
  assert.equal((await segunda.json()).url, '/photos/ana-uno/viajes/mar/Atardecer%202.png');

  assert.deepEqual(
    (await fotosDeLaColeccion()).map(({ nombreFichero, orden }) => ({ nombreFichero, orden })),
    [
      { nombreFichero: 'playa.png', orden: 0 },
      { nombreFichero: 'Atardecer 2.png', orden: 1 },
    ],
  );
  // No quedan ficheros temporales.
  assert.deepEqual(readdirSync(carpeta).sort(), ['Atardecer 2.png', 'playa.png']);
});

test('se rechaza con 422 lo que no es una imagen, un nombre no válido o repetido', async () => {
  const regla = async (respuesta: Response) => {
    assert.equal(respuesta.status, 422);
    return (await respuesta.json()).regla.codigo;
  };
  assert.equal(await regla(await subir('texto.png', Buffer.from('no soy una imagen'))), 'FOTO_FORMATO_NO_VALIDO');
  assert.equal(await regla(await subir('.oculta.png', png(1, 1))), 'FOTO_NOMBRE_FICHERO_NO_VALIDO');
  assert.equal(await regla(await subir('playa.png', png(1, 1))), 'FOTO_FICHERO_DUPLICADO');
  assert.equal((await fotosDeLaColeccion()).length, 2);
  assert.ok(!existsSync(path.join(carpeta, 'texto.png')));
});

test('sin nombreFichero la petición está mal formada (400)', async () => {
  const respuesta = await fetch(`${api}/fotos`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(png(1, 1)) });
  assert.equal(respuesta.status, 400);
});

test('cambiar el orden de las fotos: todas, cada una una vez', async () => {
  const ordenar = (orden: unknown) =>
    fetch(`${api}/fotos/orden`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden }) });

  assert.equal((await ordenar(['Atardecer 2.png', 'playa.png'])).status, 204);
  assert.deepEqual(
    (await fotosDeLaColeccion()).map(({ nombreFichero, orden }) => ({ nombreFichero, orden })),
    [
      { nombreFichero: 'Atardecer 2.png', orden: 0 },
      { nombreFichero: 'playa.png', orden: 1 },
    ],
  );

  // Faltan fotos, sobran, se repiten o no existen: no cambia nada.
  for (const orden of [['playa.png'], ['playa.png', 'playa.png'], ['playa.png', 'otra.png'], ['playa.png', 'Atardecer 2.png', 'otra.png']]) {
    const respuesta = await ordenar(orden);
    assert.equal(respuesta.status, 422);
    assert.equal((await respuesta.json()).regla.codigo, 'FOTO_ORDEN_NO_VALIDO');
  }
  assert.equal((await ordenar('playa.png')).status, 400);
  assert.deepEqual((await fotosDeLaColeccion()).map((foto) => foto.nombreFichero), ['Atardecer 2.png', 'playa.png']);
});

test('eliminar una foto borra su registro y su fichero', async () => {
  const respuesta = await fetch(`${api}/fotos/${encodeURIComponent('Atardecer 2.png')}`, { method: 'DELETE' });
  assert.equal(respuesta.status, 204);
  assert.deepEqual((await fotosDeLaColeccion()).map((foto) => foto.nombreFichero), ['playa.png']);
  assert.ok(!existsSync(path.join(carpeta, 'Atardecer 2.png')));
  assert.equal((await fetch(`${api}/fotos/no-existe.png`, { method: 'DELETE' })).status, 404);
});

test('cambiar el título de una foto: menos de 20 caracteres; vacío o "Sin título" es no tener título', async () => {
  const titulo = (valor: unknown, fichero = 'playa.png') =>
    fetch(`${api}/fotos/${encodeURIComponent(fichero)}/titulo`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: valor }),
    });
  const tituloGuardado = async () => (await fotosDeLaColeccion()).find((foto) => foto.nombreFichero === 'playa.png')!.titulo;

  const respuesta = await titulo('  Amanecer en la ría ');
  assert.equal(respuesta.status, 200);
  assert.equal((await respuesta.json()).titulo, 'Amanecer en la ría');
  assert.equal(await tituloGuardado(), 'Amanecer en la ría');

  const largo = await titulo('x'.repeat(20));
  assert.equal(largo.status, 422);
  assert.equal((await largo.json()).regla.codigo, 'FOTO_TITULO_DEMASIADO_LARGO');
  assert.equal(await tituloGuardado(), 'Amanecer en la ría');
  assert.equal((await titulo('x'.repeat(19))).status, 200);

  for (const sinTitulo of ['', '   ', 'Sin título', null]) {
    await titulo('Algo');
    assert.equal((await titulo(sinTitulo)).status, 200);
    assert.equal(await tituloGuardado(), undefined, String(sinTitulo));
  }
  assert.equal((await titulo(3)).status, 400);
  assert.equal((await titulo('Hola', 'no-existe.png')).status, 404);
  assert.equal((await titulo('Hola', 'orden')).status, 404);
});

test('sin sesión no se pueden subir ni eliminar fotos', async () => {
  const sinSesion = await globalThis.fetch(`${api}/fotos?nombreFichero=x.png`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: new Uint8Array(png(1, 1)),
  });
  assert.equal(sinSesion.status, 401);
  assert.equal((await globalThis.fetch(`${api}/fotos/playa.png`, { method: 'DELETE' })).status, 401);
  assert.ok(existsSync(path.join(carpeta, 'playa.png')));
});

test('elegir la foto de portada: sale en la colección y es la portada; al quitarla, la primera', async () => {
  await subir('rio.png', png(10, 10));
  await subir('lago.png', png(10, 10));
  const portada = (fotoPortada: unknown) =>
    fetch(`${api}/portada`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fotoPortada }) });
  const coleccion = async () => (await fetch(api)).json();
  const portadaEnPortfolio = async () =>
    ((await (await fetch(api.replace(/\/colecciones\/mar$/, ''))).json()).colecciones[0] as { coverPhotoUrl: string }).coverPhotoUrl;

  assert.equal((await coleccion()).fotoPortada, undefined);
  assert.equal((await portada('lago.png')).status, 204);
  assert.equal((await coleccion()).fotoPortada, 'lago.png');
  assert.equal(await portadaEnPortfolio(), '/photos/ana-uno/viajes/mar/lago.png');

  const inexistente = await portada('no-existe.png');
  assert.equal(inexistente.status, 422);
  assert.equal((await inexistente.json()).regla.codigo, 'COLECCION_FOTO_PORTADA_INEXISTENTE');
  assert.equal((await portada(3)).status, 400);

  assert.equal((await portada(null)).status, 204);
  assert.equal((await coleccion()).fotoPortada, undefined);
  assert.equal(await portadaEnPortfolio(), `/photos/ana-uno/viajes/mar/${(await coleccion()).fotos[0].nombreFichero}`);

  // Si se elimina la foto de portada, la colección se queda sin portada elegida.
  await portada('rio.png');
  await fetch(`${api}/fotos/rio.png`, { method: 'DELETE' });
  assert.equal((await coleccion()).fotoPortada, undefined);
});

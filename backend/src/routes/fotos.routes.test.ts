import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import express from 'express';
import sharp from 'sharp';

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

// Un PNG de verdad de ancho x alto, de un solo color (las fotos se convierten a AVIF al subirlas).
const png = (ancho: number, alto: number) =>
  sharp({ create: { width: ancho, height: alto, channels: 3, background: '#808080' } }).png().toBuffer();

const subir = (nombreFichero: string, cuerpo: Buffer, tipo = 'image/png') =>
  fetch(`${api}/fotos?nombreFichero=${encodeURIComponent(nombreFichero)}`, {
    method: 'POST',
    headers: { 'Content-Type': tipo },
    body: new Uint8Array(cuerpo),
  });

const fotosDeLaColeccion = async () => (await (await fetch(api)).json()).fotos as { nombreFichero: string; titulo?: string; orden: number; url: string }[];

test('subir fotos las guarda en AVIF en la carpeta dla colección, al final y con su tamaño', async () => {
  const primera = await subir('playa.png', await png(640, 480));
  assert.equal(primera.status, 201);
  assert.deepEqual(await primera.json(), {
    nombreFichero: 'playa.avif',
    orden: 0,
    ancho: 640,
    alto: 480,
    url: '/photos/ana-uno/viajes/mar/playa.avif',
  });
  assert.equal((await sharp(path.join(carpeta, 'playa.avif')).metadata()).format, 'heif');

  // El nombre original se conserva (con espacios, y la extensión pasa a .avif) y la URL va codificada.
  const segunda = await subir('Atardecer 2.png', await png(100, 200));
  assert.equal(segunda.status, 201);
  assert.equal((await segunda.json()).url, '/photos/ana-uno/viajes/mar/Atardecer%202.avif');

  assert.deepEqual(
    (await fotosDeLaColeccion()).map(({ nombreFichero, orden }) => ({ nombreFichero, orden })),
    [
      { nombreFichero: 'playa.avif', orden: 0 },
      { nombreFichero: 'Atardecer 2.avif', orden: 1 },
    ],
  );
  // No quedan ficheros temporales.
  assert.deepEqual(readdirSync(carpeta).sort(), ['Atardecer 2.avif', 'playa.avif']);
});

test('una foto más grande que 3840 px se reduce por su lado largo', async () => {
  const respuesta = await subir('panoramica.jpg', await sharp({ create: { width: 6000, height: 1500, channels: 3, background: '#406080' } }).jpeg().toBuffer(), 'image/jpeg');
  assert.equal(respuesta.status, 201);
  const { ancho, alto } = await respuesta.json();
  assert.deepEqual({ ancho, alto }, { ancho: 3840, alto: 960 });
  const { width, height } = await sharp(path.join(carpeta, 'panoramica.avif')).metadata();
  assert.deepEqual({ width, height }, { width: 3840, height: 960 });
  await fetch(`${api}/fotos/panoramica.avif`, { method: 'DELETE' });
});

test('se rechaza con 422 lo que no es una imagen, un nombre no válido o repetido', async () => {
  const regla = async (respuesta: Response) => {
    assert.equal(respuesta.status, 422);
    return (await respuesta.json()).regla.codigo;
  };
  assert.equal(await regla(await subir('texto.png', Buffer.from('no soy una imagen'))), 'FOTO_FORMATO_NO_VALIDO');
  assert.equal(await regla(await subir('.oculta.png', await png(1, 1))), 'FOTO_NOMBRE_FICHERO_NO_VALIDO');
  // Otro formato con el mismo nombre también se guardaría como playa.avif.
  assert.equal(await regla(await subir('playa.jpg', await png(1, 1))), 'FOTO_FICHERO_DUPLICADO');
  // Parece un PNG (su cabecera lo es), pero no se puede decodificar.
  assert.equal(await regla(await subir('rota.png', (await png(50, 50)).subarray(0, 60))), 'FOTO_FORMATO_NO_VALIDO');
  assert.ok(!existsSync(path.join(carpeta, 'rota.avif')));
  assert.equal((await fotosDeLaColeccion()).length, 2);
  assert.ok(!existsSync(path.join(carpeta, 'texto.avif')));
});

test('sin nombreFichero la petición está mal formada (400)', async () => {
  const respuesta = await fetch(`${api}/fotos`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(await png(1, 1)) });
  assert.equal(respuesta.status, 400);
});

test('cambiar el orden de las fotos: todas, cada una una vez', async () => {
  const ordenar = (orden: unknown) =>
    fetch(`${api}/fotos/orden`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden }) });

  assert.equal((await ordenar(['Atardecer 2.avif', 'playa.avif'])).status, 204);
  assert.deepEqual(
    (await fotosDeLaColeccion()).map(({ nombreFichero, orden }) => ({ nombreFichero, orden })),
    [
      { nombreFichero: 'Atardecer 2.avif', orden: 0 },
      { nombreFichero: 'playa.avif', orden: 1 },
    ],
  );

  // Faltan fotos, sobran, se repiten o no existen: no cambia nada.
  for (const orden of [['playa.avif'], ['playa.avif', 'playa.avif'], ['playa.avif', 'otra.avif'], ['playa.avif', 'Atardecer 2.avif', 'otra.avif']]) {
    const respuesta = await ordenar(orden);
    assert.equal(respuesta.status, 422);
    assert.equal((await respuesta.json()).regla.codigo, 'FOTO_ORDEN_NO_VALIDO');
  }
  assert.equal((await ordenar('playa.avif')).status, 400);
  assert.deepEqual((await fotosDeLaColeccion()).map((foto) => foto.nombreFichero), ['Atardecer 2.avif', 'playa.avif']);
});

test('eliminar una foto borra su registro y su fichero', async () => {
  const respuesta = await fetch(`${api}/fotos/${encodeURIComponent('Atardecer 2.avif')}`, { method: 'DELETE' });
  assert.equal(respuesta.status, 204);
  assert.deepEqual((await fotosDeLaColeccion()).map((foto) => foto.nombreFichero), ['playa.avif']);
  assert.ok(!existsSync(path.join(carpeta, 'Atardecer 2.avif')));
  assert.equal((await fetch(`${api}/fotos/no-existe.avif`, { method: 'DELETE' })).status, 404);
});

test('cambiar el título de una foto: menos de 20 caracteres; vacío o "Sin título" es no tener título', async () => {
  const titulo = (valor: unknown, fichero = 'playa.avif') =>
    fetch(`${api}/fotos/${encodeURIComponent(fichero)}/titulo`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: valor }),
    });
  const tituloGuardado = async () => (await fotosDeLaColeccion()).find((foto) => foto.nombreFichero === 'playa.avif')!.titulo;

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
  assert.equal((await titulo('Hola', 'no-existe.avif')).status, 404);
  assert.equal((await titulo('Hola', 'orden')).status, 404);
});

test('sin sesión no se pueden subir ni eliminar fotos', async () => {
  const sinSesion = await globalThis.fetch(`${api}/fotos?nombreFichero=x.png`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: new Uint8Array(await png(1, 1)),
  });
  assert.equal(sinSesion.status, 401);
  assert.equal((await globalThis.fetch(`${api}/fotos/playa.avif`, { method: 'DELETE' })).status, 401);
  assert.ok(existsSync(path.join(carpeta, 'playa.avif')));
});

test('elegir la foto de portada: sale en la colección y es la portada; al quitarla, la primera', async () => {
  await subir('rio.png', await png(10, 10));
  await subir('lago.png', await png(10, 10));
  const portada = (fotoPortada: unknown) =>
    fetch(`${api}/portada`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fotoPortada }) });
  const coleccion = async () => (await fetch(api)).json();
  const portadaEnPortfolio = async () =>
    ((await (await fetch(api.replace(/\/colecciones\/mar$/, ''))).json()).colecciones[0] as { coverPhotoUrl: string }).coverPhotoUrl;

  assert.equal((await coleccion()).fotoPortada, undefined);
  assert.equal((await portada('lago.avif')).status, 204);
  assert.equal((await coleccion()).fotoPortada, 'lago.avif');
  assert.equal(await portadaEnPortfolio(), '/photos/ana-uno/viajes/mar/lago.avif');

  const inexistente = await portada('no-existe.avif');
  assert.equal(inexistente.status, 422);
  assert.equal((await inexistente.json()).regla.codigo, 'COLECCION_FOTO_PORTADA_INEXISTENTE');
  assert.equal((await portada(3)).status, 400);

  assert.equal((await portada(null)).status, 204);
  assert.equal((await coleccion()).fotoPortada, undefined);
  assert.equal(await portadaEnPortfolio(), `/photos/ana-uno/viajes/mar/${(await coleccion()).fotos[0].nombreFichero}`);

  // Si se elimina la foto de portada, la colección se queda sin portada elegida.
  await portada('rio.avif');
  await fetch(`${api}/fotos/rio.avif`, { method: 'DELETE' });
  assert.equal((await coleccion()).fotoPortada, undefined);
});

test('convertir las fotos guardadas antes en su formato original: pasan a AVIF y se borra la original', async () => {
  const { insertarFoto, listarFotosSinConvertir } = await import('../db/catalogo.repository.js');
  const { convertirFotoGuardada } = await import('../services/foto.service.js');
  const { writeFileSync } = await import('node:fs');
  const idColeccion = (db.prepare("SELECT idColeccion FROM colecciones WHERE nombreNormalizado = 'mar'").get() as { idColeccion: number }).idColeccion;
  // Una foto antigua, en JPEG, y otra con el mismo nombre en PNG: la segunda se queda con "-2".
  writeFileSync(path.join(carpeta, 'antigua.jpg'), await sharp({ create: { width: 5000, height: 2500, channels: 3, background: '#a08060' } }).jpeg().toBuffer());
  writeFileSync(path.join(carpeta, 'antigua.png'), await png(20, 10));
  insertarFoto(idColeccion, { nombreFichero: 'antigua.jpg', ancho: 5000, alto: 2500 });
  insertarFoto(idColeccion, { nombreFichero: 'antigua.png', ancho: 20, alto: 10 });

  const pendientes = listarFotosSinConvertir();
  assert.deepEqual(pendientes.map((foto) => foto.nombreFichero), ['antigua.jpg', 'antigua.png']);
  for (const foto of pendientes) {
    assert.ok(await convertirFotoGuardada(foto));
  }
  assert.deepEqual(listarFotosSinConvertir(), []);

  const fotos = await fotosDeLaColeccion();
  assert.ok(fotos.some((foto) => foto.nombreFichero === 'antigua.avif'));
  assert.ok(fotos.some((foto) => foto.nombreFichero === 'antigua-2.avif'));
  assert.ok(!existsSync(path.join(carpeta, 'antigua.jpg')));
  assert.ok(!existsSync(path.join(carpeta, 'antigua.png')));
  const { width, height, format } = await sharp(path.join(carpeta, 'antigua.avif')).metadata();
  assert.deepEqual({ width, height, format }, { width: 3840, height: 1920, format: 'heif' });
});

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, utimesSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import express from 'express';
import sharp from 'sharp';

// Las rutas de datos se leen al importar: se apuntan antes a una carpeta temporal.
const datos = mkdtempSync(path.join(tmpdir(), 'portfolio-datos-'));
process.env.DATOS_DIR = datos;

const { servirMiniaturas, tipoAvif } = await import('./miniaturas.routes.js');
const { borrarAnchosObsoletos, borrarMiniaturas, moverMiniaturas } = await import('../services/miniatura.service.js');
const { fotosDir, miniaturasDir } = await import('../config/rutas.js');

const app = express();
app.use('/photos', servirMiniaturas, express.static(fotosDir, { dotfiles: 'ignore', setHeaders: tipoAvif })); // como en index.ts
const servidor = app.listen(0);
const base = `http://localhost:${(servidor.address() as AddressInfo).port}/photos`;

after(() => {
  servidor.close();
  try {
    rmSync(datos, { recursive: true, force: true });
  } catch {
    // se limpiará con el resto de temporales del sistema
  }
});

const coleccion = path.join(fotosDir, 'ana-uno', 'viajes', 'mar');
mkdirSync(coleccion, { recursive: true });

// Un JPEG de verdad de ancho x alto, de un solo color.
const jpeg = (ancho: number, alto: number, destino: string) =>
  sharp({ create: { width: ancho, height: alto, channels: 3, background: '#808080' } }).jpeg().toFile(destino);

await jpeg(2000, 1000, path.join(coleccion, 'Playa grande.jpg'));
await jpeg(300, 200, path.join(coleccion, 'pequenya.jpg'));

const medidas = async (respuesta: Response) => {
  const { width, height, format } = await sharp(Buffer.from(await respuesta.arrayBuffer())).metadata();
  return { width, height, format };
};

test('con ?ancho sirve la foto reducida a ese ancho, en AVIF, y la guarda en caché', async () => {
  const respuesta = await fetch(`${base}/ana-uno/viajes/mar/Playa%20grande.jpg?ancho=960`);
  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get('content-type') ?? '', /image\/avif/);
  assert.deepEqual(await medidas(respuesta), { width: 960, height: 480, format: 'heif' });
  assert.ok(existsSync(path.join(miniaturasDir, '960', 'ana-uno', 'viajes', 'mar', 'Playa grande.jpg.avif')));
});

test('la grande se reduce por el lado largo: una vertical cabe en 3840 de alto', async () => {
  await jpeg(2000, 5000, path.join(coleccion, 'vertical.jpg'));
  const respuesta = await fetch(`${base}/ana-uno/viajes/mar/vertical.jpg?ancho=3840`);
  assert.deepEqual(await medidas(respuesta), { width: 1536, height: 3840, format: 'heif' });
});

test('sin ?ancho sirve la original', async () => {
  const respuesta = await fetch(`${base}/ana-uno/viajes/mar/Playa%20grande.jpg`);
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await medidas(respuesta), { width: 2000, height: 1000, format: 'jpeg' });
});

test('una foto más estrecha que el ancho pedido no se amplía', async () => {
  const respuesta = await fetch(`${base}/ana-uno/viajes/mar/pequenya.jpg?ancho=3840`);
  assert.deepEqual(await medidas(respuesta), { width: 300, height: 200, format: 'heif' });
});

test('si la original cambia, la miniatura se vuelve a generar', async () => {
  const original = path.join(coleccion, 'cambia.jpg');
  await jpeg(1000, 1000, original);
  assert.equal((await medidas(await fetch(`${base}/ana-uno/viajes/mar/cambia.jpg?ancho=960`))).height, 960);

  await jpeg(1000, 500, original);
  const futuro = new Date(Date.now() + 60_000);
  utimesSync(original, futuro, futuro);
  assert.equal((await medidas(await fetch(`${base}/ana-uno/viajes/mar/cambia.jpg?ancho=960`))).height, 480);
});

test('anchos no admitidos (400), fotos que no existen y carpetas ocultas (404)', async () => {
  assert.equal((await fetch(`${base}/ana-uno/viajes/mar/Playa%20grande.jpg?ancho=500`)).status, 400);
  assert.equal((await fetch(`${base}/ana-uno/viajes/mar/Playa%20grande.jpg?ancho=480`)).status, 400); // ya no se generan
  assert.equal((await fetch(`${base}/ana-uno/viajes/mar/no-existe.jpg?ancho=960`)).status, 404);

  const oculta = path.join(fotosDir, '.papelera-mar-1');
  mkdirSync(oculta, { recursive: true });
  await jpeg(100, 100, path.join(oculta, 'x.jpg'));
  assert.equal((await fetch(`${base}/.papelera-mar-1/x.jpg?ancho=960`)).status, 404);
  assert.equal((await fetch(`${base}/.papelera-mar-1/x.jpg`)).status, 404); // ni la original
  assert.equal((await fetch(`${base}/ana-uno/..%2F..%2Fx.jpg?ancho=960`)).status, 404);
});

test('borrarAnchosObsoletos borra los anchos que ya no se generan y lo que no es AVIF', async () => {
  mkdirSync(path.join(miniaturasDir, '480', 'ana-uno'), { recursive: true });
  mkdirSync(path.join(miniaturasDir, '2400', 'ana-uno'), { recursive: true });
  const jpegAntiguo = path.join(miniaturasDir, '960', 'ana-uno', 'viajes', 'mar', 'Playa grande.jpg');
  await jpeg(100, 100, jpegAntiguo);
  borrarAnchosObsoletos();
  assert.ok(!existsSync(jpegAntiguo));
  assert.ok(!existsSync(path.join(miniaturasDir, '480')));
  assert.ok(!existsSync(path.join(miniaturasDir, '2400')));
  assert.ok(existsSync(path.join(miniaturasDir, '960', 'ana-uno', 'viajes', 'mar', 'Playa grande.jpg.avif')));
});

test('borrarMiniaturas borra las de una foto o de una carpeta, en todos los anchos', async () => {
  await fetch(`${base}/ana-uno/viajes/mar/Playa%20grande.jpg?ancho=960`);
  await fetch(`${base}/ana-uno/viajes/mar/Playa%20grande.jpg?ancho=3840`);
  await fetch(`${base}/ana-uno/viajes/mar/pequenya.jpg?ancho=960`);
  borrarMiniaturas(path.join('ana-uno', 'viajes', 'mar', 'Playa grande.jpg'));
  assert.ok(!existsSync(path.join(miniaturasDir, '960', 'ana-uno', 'viajes', 'mar', 'Playa grande.jpg.avif')));
  assert.ok(!existsSync(path.join(miniaturasDir, '3840', 'ana-uno', 'viajes', 'mar', 'Playa grande.jpg.avif')));
  assert.ok(existsSync(path.join(miniaturasDir, '960', 'ana-uno', 'viajes', 'mar', 'pequenya.jpg.avif')));
  borrarMiniaturas(path.join('ana-uno', 'viajes'));
  assert.ok(!existsSync(path.join(miniaturasDir, '960', 'ana-uno', 'viajes')));
});

test('una foto guardada en AVIF es ya la versión grande: ?ancho=3840 la sirve tal cual', async () => {
  const avif = path.join(coleccion, 'guardada.avif');
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#808080' } }).avif().toFile(avif);
  const grande = await fetch(`${base}/ana-uno/viajes/mar/guardada.avif?ancho=3840`);
  assert.match(grande.headers.get('content-type') ?? '', /image\/avif/);
  assert.deepEqual(Buffer.from(await grande.arrayBuffer()), readFileSync(avif));
  assert.ok(!existsSync(path.join(miniaturasDir, '3840', 'ana-uno', 'viajes', 'mar', 'guardada.avif')));
  // Sin ?ancho, también con su tipo.
  assert.match((await fetch(`${base}/ana-uno/viajes/mar/guardada.avif`)).headers.get('content-type') ?? '', /image\/avif/);
  // La miniatura, con el mismo nombre en la carpeta de 960.
  assert.equal((await medidas(await fetch(`${base}/ana-uno/viajes/mar/guardada.avif?ancho=960`))).width, 960);
  assert.ok(existsSync(path.join(miniaturasDir, '960', 'ana-uno', 'viajes', 'mar', 'guardada.avif')));
});

test('al renombrar una carpeta, sus miniaturas se mueven con ella y se sirven al instante', async () => {
  const otra = path.join(fotosDir, 'bea-dos', 'viajes', 'rio');
  mkdirSync(otra, { recursive: true });
  await jpeg(2000, 1000, path.join(otra, 'agua.jpg'));
  await (await fetch(`${base}/bea-dos/viajes/rio/agua.jpg?ancho=960`)).arrayBuffer();
  const antes = path.join(miniaturasDir, '960', 'bea-dos', 'viajes', 'rio', 'agua.jpg.avif');
  assert.ok(existsSync(antes));

  // Como hace la aplicación al renombrar el fotógrafo: su carpeta de fotos y luego sus miniaturas.
  renameSync(path.join(fotosDir, 'bea-dos'), path.join(fotosDir, 'beatriz-dos'));
  moverMiniaturas('bea-dos', 'beatriz-dos');
  const despues = path.join(miniaturasDir, '960', 'beatriz-dos', 'viajes', 'rio', 'agua.jpg.avif');
  assert.ok(!existsSync(antes) && existsSync(despues));
  const generada = statSync(despues).mtimeMs;

  const respuesta = await fetch(`${base}/beatriz-dos/viajes/rio/agua.jpg?ancho=960`);
  assert.deepEqual(await medidas(respuesta), { width: 960, height: 480, format: 'heif' });
  assert.equal(statSync(despues).mtimeMs, generada); // la misma, sin volver a generarla
});

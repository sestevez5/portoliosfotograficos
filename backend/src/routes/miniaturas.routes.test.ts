import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import express from 'express';
import sharp from 'sharp';

// Las rutas de datos se leen al importar: se apuntan antes a una carpeta temporal.
const datos = mkdtempSync(path.join(tmpdir(), 'portfolio-datos-'));
process.env.DATOS_DIR = datos;

const { servirMiniaturas } = await import('./miniaturas.routes.js');
const { borrarMiniaturas } = await import('../services/miniatura.service.js');
const { fotosDir, miniaturasDir } = await import('../config/rutas.js');

const app = express();
app.use('/photos', servirMiniaturas, express.static(fotosDir, { dotfiles: 'ignore' })); // como en index.ts
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

test('con ?ancho sirve la foto reducida a ese ancho, en JPEG, y la guarda en caché', async () => {
  const respuesta = await fetch(`${base}/ana-uno/viajes/mar/Playa%20grande.jpg?ancho=480`);
  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get('content-type') ?? '', /image\/jpeg/);
  assert.deepEqual(await medidas(respuesta), { width: 480, height: 240, format: 'jpeg' });
  assert.ok(existsSync(path.join(miniaturasDir, '480', 'ana-uno', 'viajes', 'mar', 'Playa grande.jpg')));
});

test('sin ?ancho sirve la original', async () => {
  const respuesta = await fetch(`${base}/ana-uno/viajes/mar/Playa%20grande.jpg`);
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await medidas(respuesta), { width: 2000, height: 1000, format: 'jpeg' });
});

test('una foto más estrecha que el ancho pedido no se amplía', async () => {
  const respuesta = await fetch(`${base}/ana-uno/viajes/mar/pequenya.jpg?ancho=960`);
  assert.deepEqual(await medidas(respuesta), { width: 300, height: 200, format: 'jpeg' });
});

test('si la original cambia, la miniatura se vuelve a generar', async () => {
  const original = path.join(coleccion, 'cambia.jpg');
  await jpeg(1000, 1000, original);
  assert.equal((await medidas(await fetch(`${base}/ana-uno/viajes/mar/cambia.jpg?ancho=480`))).height, 480);

  await jpeg(1000, 500, original);
  const futuro = new Date(Date.now() + 60_000);
  utimesSync(original, futuro, futuro);
  assert.equal((await medidas(await fetch(`${base}/ana-uno/viajes/mar/cambia.jpg?ancho=480`))).height, 240);
});

test('anchos no admitidos (400), fotos que no existen y carpetas ocultas (404)', async () => {
  assert.equal((await fetch(`${base}/ana-uno/viajes/mar/Playa%20grande.jpg?ancho=500`)).status, 400);
  assert.equal((await fetch(`${base}/ana-uno/viajes/mar/no-existe.jpg?ancho=480`)).status, 404);

  const oculta = path.join(fotosDir, '.papelera-mar-1');
  mkdirSync(oculta, { recursive: true });
  await jpeg(100, 100, path.join(oculta, 'x.jpg'));
  assert.equal((await fetch(`${base}/.papelera-mar-1/x.jpg?ancho=480`)).status, 404);
  assert.equal((await fetch(`${base}/.papelera-mar-1/x.jpg`)).status, 404); // ni la original
  assert.equal((await fetch(`${base}/ana-uno/..%2F..%2Fx.jpg?ancho=480`)).status, 404);
});

test('borrarMiniaturas borra las de una carpeta en todos los anchos', async () => {
  await fetch(`${base}/ana-uno/viajes/mar/Playa%20grande.jpg?ancho=960`);
  assert.ok(existsSync(path.join(miniaturasDir, '960', 'ana-uno', 'viajes', 'mar')));
  borrarMiniaturas(path.join('ana-uno', 'viajes'));
  assert.ok(!existsSync(path.join(miniaturasDir, '480', 'ana-uno', 'viajes')));
  assert.ok(!existsSync(path.join(miniaturasDir, '960', 'ana-uno', 'viajes')));
});

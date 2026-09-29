import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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

const db = abrirBaseDatos();
const app = express();
app.use('/api', catalogoRouter);
app.use(gestionarErrores);
const servidor = app.listen(0);
const api = `http://localhost:${(servidor.address() as AddressInfo).port}/api/fotografos/ana-uno`;

// Las peticiones del test van con la sesión del administrador, que puede modificarlo todo (los
// permisos se prueban en permisos.routes.test.ts).
const raiz = `http://localhost:${(servidor.address() as AddressInfo).port}/api`;
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

const { idUsuario } = crearFotografo({ nombreInformal: 'Ana Uno', nombre: 'Ana', primerApellido: 'Uno' });
const fichero = path.join(datos, 'avatares', `u${idUsuario}.jpg`);
// Un "JPEG" mínimo: basta con que empiece como uno (FF D8 FF).
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const subir = (cuerpo: Buffer, tipo = 'image/jpeg') =>
  fetch(`${api}/foto`, { method: 'PUT', headers: { 'Content-Type': tipo }, body: new Uint8Array(cuerpo) });

test('sin foto: 404 y no sale en los datos de edición', async () => {
  assert.equal((await fetch(`${api}/foto`)).status, 404);
  assert.equal((await (await fetch(`${api}/edicion`)).json()).fotoUrl, undefined);
});

test('subir la foto la guarda en datos/avatares y la sirve en la URL que devuelve', async () => {
  const respuesta = await subir(JPEG);
  assert.equal(respuesta.status, 200);
  const { fotoUrl } = await respuesta.json();
  assert.match(fotoUrl, /^\/api\/fotografos\/ana-uno\/foto\?v=/);
  assert.ok(existsSync(fichero));

  const servida = await fetch(`http://localhost:${(servidor.address() as AddressInfo).port}${fotoUrl}`);
  assert.equal(servida.status, 200);
  assert.deepEqual(Buffer.from(await servida.arrayBuffer()), JPEG);
  assert.equal((await (await fetch(`${api}/edicion`)).json()).fotoUrl, fotoUrl);
});

test('lo que no es un JPEG se rechaza con 422 y no cambia la foto', async () => {
  const noJpeg = await subir(Buffer.from('no soy una imagen'));
  assert.equal(noJpeg.status, 422);
  assert.equal((await noJpeg.json()).regla.codigo, 'USUARIO_FOTO_NO_VALIDA');
  assert.equal((await subir(Buffer.from('x'), 'text/plain')).status, 422);
  assert.ok(existsSync(fichero));
});

test('quitar la foto borra el fichero; eliminar al fotógrafo también', async () => {
  assert.equal((await fetch(`${api}/foto`, { method: 'DELETE' })).status, 204);
  assert.ok(!existsSync(fichero));
  assert.equal((await fetch(`${api}/foto`)).status, 404);

  await subir(JPEG);
  assert.equal((await fetch(api, { method: 'DELETE' })).status, 204);
  assert.ok(!existsSync(fichero));
});

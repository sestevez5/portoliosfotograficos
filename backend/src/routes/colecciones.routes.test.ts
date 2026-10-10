import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import express from 'express';

// El repositorio abre la BD al importarse: se apunta antes a una carpeta de datos temporal
// (cada fichero de test se ejecuta en su propio proceso).
const datos = mkdtempSync(path.join(tmpdir(), 'portfolio-datos-'));
process.env.DATOS_DIR = datos;
const fotos = path.join(datos, 'fotos');

const { catalogoRouter } = await import('./catalogo.routes.js');
const { gestionarErrores } = await import('../gestionar-errores.js');
const { abrirBaseDatos } = await import('../db/conexion.js');
const { importarOrganizacion } = await import('../db/importar.js');

const db = abrirBaseDatos();
importarOrganizacion(db, [
  {
    fotografo: { nombreInformal: 'Ana Uno', nombre: 'Ana', primerApellido: 'Uno', descripcion: '' },
    portfolios: [{ nombre: 'Viajes', colecciones: [{ nombre: 'Mar', tags: [], fotos: [{ nombreFichero: '01.jpg', orden: 1 }] }] }],
  },
]);
mkdirSync(path.join(fotos, 'ana-uno', 'viajes', 'mar'), { recursive: true });

const app = express();
app.use('/api', catalogoRouter);
app.use(gestionarErrores);
const servidor = app.listen(0);
const base = `http://localhost:${(servidor.address() as AddressInfo).port}/api/fotografos/ana-uno/portfolios/viajes/colecciones`;

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

const json = (method: string, url: string, cuerpo: unknown) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });

test('POST crea la colección (201) y valida el cuerpo (400) y las reglas (422)', async () => {
  const creado = await json('POST', base, { nombre: 'Montaña', descripcion: 'Picos', tags: ['nieve'] });
  assert.equal(creado.status, 201);
  assert.equal(creado.headers.get('location'), '/api/fotografos/ana-uno/portfolios/viajes/colecciones/montanya');
  assert.deepEqual(await creado.json(), {
    nombre: 'Montaña',
    nombreNormalizado: 'montanya',
    descripcion: 'Picos',
    tags: ['nieve'],
    portfolio: { nombre: 'Viajes', nombreNormalizado: 'viajes' },
    visible: true,
    visibilidad: 'visible',
    fotos: [],
  });
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'montanya')));

  assert.equal((await json('POST', base, { nombre: 3 })).status, 400);
  assert.equal((await json('POST', base, { nombre: 'X', tags: 'nieve' })).status, 400);

  const duplicado = await json('POST', base, { nombre: 'mar' });
  assert.equal(duplicado.status, 422);
  assert.equal((await duplicado.json()).regla.codigo, 'COLECCION_NOMBRE_DUPLICADO');
});

test('PUT modifica la colección y devuelve su nueva dirección', async () => {
  const editado = await json('PUT', `${base}/montanya`, { nombre: 'Alta montaña' });
  assert.equal(editado.status, 200);
  const cuerpo = await editado.json();
  assert.equal(cuerpo.nombreNormalizado, 'alta-montanya');
  assert.equal(cuerpo.descripcion, undefined);
  assert.deepEqual(cuerpo.tags, []);
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'alta-montanya')));

  assert.equal((await json('PUT', `${base}/nada`, { nombre: 'X' })).status, 404);
});

test('DELETE pide confirmación si la colección tiene fotos', async () => {
  const sinConfirmar = await fetch(`${base}/mar`, { method: 'DELETE' });
  assert.equal(sinConfirmar.status, 422);
  const regla = await sinConfirmar.json();
  assert.equal(regla.regla.codigo, 'COLECCION_ELIMINAR_CON_FOTOS');
  assert.match(regla.regla.mensaje, /^Esta colección contiene fotos\./);

  assert.equal((await fetch(`${base}/mar?confirmar=true`, { method: 'DELETE' })).status, 204);
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'viajes', 'mar')));

  // Sin fotos no hace falta confirmar.
  assert.equal((await fetch(`${base}/alta-montanya`, { method: 'DELETE' })).status, 204);
});

test('PUT orden-colecciones cambia el orden de las colecciones del portfolio', async () => {
  const portfolio = base.replace(/\/colecciones$/, '');
  const nombres = async () =>
    ((await (await fetch(portfolio)).json()).colecciones as { nombreNormalizado: string }[]).map((c) => c.nombreNormalizado);
  await json('POST', base, { nombre: 'Bosque' });
  await json('POST', base, { nombre: 'Ciudad' });
  const antes = await nombres();
  assert.ok(antes.length >= 2);

  const alReves = [...antes].reverse();
  assert.equal((await json('PUT', `${portfolio}/orden-colecciones`, { orden: alReves })).status, 204);
  assert.deepEqual(await nombres(), alReves);

  // Faltan, se repiten o no existen: 422 y no cambia nada.
  for (const orden of [alReves.slice(1), [...alReves.slice(1), alReves[1]], [...alReves.slice(1), 'no-existe']]) {
    const respuesta = await json('PUT', `${portfolio}/orden-colecciones`, { orden });
    assert.equal(respuesta.status, 422);
    assert.equal((await respuesta.json()).regla.codigo, 'COLECCION_ORDEN_NO_VALIDO');
  }
  assert.equal((await json('PUT', `${portfolio}/orden-colecciones`, { orden: 'bosque' })).status, 400);
  assert.deepEqual(await nombres(), alReves);
});

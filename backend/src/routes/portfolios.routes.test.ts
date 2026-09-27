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

const { albumsRouter } = await import('./albums.routes.js');
const { gestionarErrores } = await import('../gestionar-errores.js');
const { abrirBaseDatos } = await import('../db/conexion.js');
const { importarOrganizacion } = await import('../db/importar.js');

const db = abrirBaseDatos();
importarOrganizacion(db, [
  {
    fotografo: { nombreInformal: 'Ana Uno', nombre: 'Ana', primerApellido: 'Uno', descripcion: '' },
    portfolios: [{ nombre: 'Viajes', albumes: [{ nombre: 'Mar', tags: [], fotos: [] }] }],
  },
]);
mkdirSync(path.join(fotos, 'ana-uno', 'viajes', 'mar'), { recursive: true });

const app = express();
app.use('/api', albumsRouter);
app.use(gestionarErrores);
const servidor = app.listen(0);
const base = `http://localhost:${(servidor.address() as AddressInfo).port}/api/fotografos/ana-uno/portfolios`;

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

test('POST crea el portfolio (201) y valida el cuerpo (400) y las reglas (422)', async () => {
  const creado = await json('POST', base, { nombre: 'Retratos de estudio', descripcion: 'En blanco y negro' });
  assert.equal(creado.status, 201);
  assert.equal(creado.headers.get('location'), '/api/fotografos/ana-uno/portfolios/retratos-de-estudio');
  assert.deepEqual(await creado.json(), {
    nombre: 'Retratos de estudio',
    nombreNormalizado: 'retratos-de-estudio',
    descripcion: 'En blanco y negro',
    albumes: [],
  });
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'retratos-de-estudio')));

  assert.equal((await json('POST', base, { nombre: 3 })).status, 400);

  const duplicado = await json('POST', base, { nombre: 'viajes' });
  assert.equal(duplicado.status, 422);
  assert.equal((await duplicado.json()).regla.codigo, 'PORTFOLIO_NOMBRE_DUPLICADO');
});

test('PUT modifica el portfolio y devuelve su nueva dirección', async () => {
  const editado = await json('PUT', `${base}/retratos-de-estudio`, { nombre: 'Retratos' });
  assert.equal(editado.status, 200);
  const cuerpo = await editado.json();
  assert.equal(cuerpo.nombreNormalizado, 'retratos');
  assert.equal(cuerpo.descripcion, undefined);

  assert.equal((await json('PUT', `${base}/nada`, { nombre: 'X' })).status, 404);
});

test('DELETE pide confirmación si el portfolio tiene álbumes', async () => {
  const sinConfirmar = await fetch(`${base}/viajes`, { method: 'DELETE' });
  assert.equal(sinConfirmar.status, 422);
  const regla = await sinConfirmar.json();
  assert.equal(regla.regla.codigo, 'PORTFOLIO_ELIMINAR_CON_ALBUMES');
  assert.match(regla.regla.mensaje, /^Este portfolio contiene álbumes\./);

  assert.equal((await fetch(`${base}/viajes?confirmar=true`, { method: 'DELETE' })).status, 204);
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'viajes')));

  // Sin álbumes no hace falta confirmar.
  assert.equal((await fetch(`${base}/retratos`, { method: 'DELETE' })).status, 204);
});

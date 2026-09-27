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
    portfolios: [{ nombre: 'Viajes', albumes: [{ nombre: 'Mar', tags: [], fotos: [{ nombreFichero: '01.jpg', orden: 1 }] }] }],
  },
]);
mkdirSync(path.join(fotos, 'ana-uno', 'viajes', 'mar'), { recursive: true });

const app = express();
app.use('/api', albumsRouter);
app.use(gestionarErrores);
const servidor = app.listen(0);
const base = `http://localhost:${(servidor.address() as AddressInfo).port}/api/fotografos/ana-uno/portfolios/viajes/albums`;

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

test('POST crea el álbum (201) y valida el cuerpo (400) y las reglas (422)', async () => {
  const creado = await json('POST', base, { nombre: 'Montaña', descripcion: 'Picos', tags: ['nieve'] });
  assert.equal(creado.status, 201);
  assert.equal(creado.headers.get('location'), '/api/fotografos/ana-uno/portfolios/viajes/albums/montanya');
  assert.deepEqual(await creado.json(), {
    nombre: 'Montaña',
    nombreNormalizado: 'montanya',
    descripcion: 'Picos',
    tags: ['nieve'],
    portfolio: { nombre: 'Viajes', nombreNormalizado: 'viajes' },
    fotos: [],
  });
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'montanya')));

  assert.equal((await json('POST', base, { nombre: 3 })).status, 400);
  assert.equal((await json('POST', base, { nombre: 'X', tags: 'nieve' })).status, 400);

  const duplicado = await json('POST', base, { nombre: 'mar' });
  assert.equal(duplicado.status, 422);
  assert.equal((await duplicado.json()).regla.codigo, 'ALBUM_NOMBRE_DUPLICADO');
});

test('PUT modifica el álbum y devuelve su nueva dirección', async () => {
  const editado = await json('PUT', `${base}/montanya`, { nombre: 'Alta montaña' });
  assert.equal(editado.status, 200);
  const cuerpo = await editado.json();
  assert.equal(cuerpo.nombreNormalizado, 'alta-montanya');
  assert.equal(cuerpo.descripcion, undefined);
  assert.deepEqual(cuerpo.tags, []);
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'alta-montanya')));

  assert.equal((await json('PUT', `${base}/nada`, { nombre: 'X' })).status, 404);
});

test('DELETE pide confirmación si el álbum tiene fotos', async () => {
  const sinConfirmar = await fetch(`${base}/mar`, { method: 'DELETE' });
  assert.equal(sinConfirmar.status, 422);
  const regla = await sinConfirmar.json();
  assert.equal(regla.regla.codigo, 'ALBUM_ELIMINAR_CON_FOTOS');
  assert.match(regla.regla.mensaje, /^Este álbum contiene fotos\./);

  assert.equal((await fetch(`${base}/mar?confirmar=true`, { method: 'DELETE' })).status, 204);
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'viajes', 'mar')));

  // Sin fotos no hace falta confirmar.
  assert.equal((await fetch(`${base}/alta-montanya`, { method: 'DELETE' })).status, 204);
});

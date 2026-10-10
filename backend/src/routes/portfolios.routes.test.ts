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
    portfolios: [{ nombre: 'Viajes', colecciones: [{ nombre: 'Mar', tags: [], fotos: [] }] }],
  },
]);
mkdirSync(path.join(fotos, 'ana-uno', 'viajes', 'mar'), { recursive: true });

const app = express();
app.use('/api', catalogoRouter);
app.use(gestionarErrores);
const servidor = app.listen(0);
const base = `http://localhost:${(servidor.address() as AddressInfo).port}/api/fotografos/ana-uno/portfolios`;

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

test('POST crea el portfolio (201) y valida el cuerpo (400) y las reglas (422)', async () => {
  const creado = await json('POST', base, { nombre: 'Retratos de estudio', descripcion: 'En blanco y negro' });
  assert.equal(creado.status, 201);
  assert.equal(creado.headers.get('location'), '/api/fotografos/ana-uno/portfolios/retratos-de-estudio');
  assert.deepEqual(await creado.json(), {
    nombre: 'Retratos de estudio',
    nombreNormalizado: 'retratos-de-estudio',
    descripcion: 'En blanco y negro',
    visible: true,
    visibilidad: 'visible',
    colecciones: [],
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

test('DELETE pide confirmación si el portfolio tiene colecciones', async () => {
  const sinConfirmar = await fetch(`${base}/viajes`, { method: 'DELETE' });
  assert.equal(sinConfirmar.status, 422);
  const regla = await sinConfirmar.json();
  assert.equal(regla.regla.codigo, 'PORTFOLIO_ELIMINAR_CON_COLECCIONES');
  assert.match(regla.regla.mensaje, /^Este portfolio contiene colecciones\./);

  assert.equal((await fetch(`${base}/viajes?confirmar=true`, { method: 'DELETE' })).status, 204);
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'viajes')));

  // Sin colecciones no hace falta confirmar.
  assert.equal((await fetch(`${base}/retratos`, { method: 'DELETE' })).status, 204);
});

test('PUT orden-portfolios cambia el orden de los portfolios del fotógrafo', async () => {
  const fotografo = base.replace(/\/portfolios$/, '');
  const nombres = async () =>
    ((await (await fetch(fotografo)).json()).portfolios as { nombreNormalizado: string }[]).map((p) => p.nombreNormalizado);
  await json('POST', base, { nombre: 'Bodas' });
  await json('POST', base, { nombre: 'Paisaje' });
  const antes = await nombres();
  assert.ok(antes.length >= 2);

  const alReves = [...antes].reverse();
  assert.equal((await json('PUT', `${fotografo}/orden-portfolios`, { orden: alReves })).status, 204);
  assert.deepEqual(await nombres(), alReves);

  // Faltan, se repiten o no existen: 422 y no cambia nada.
  for (const orden of [alReves.slice(1), [...alReves.slice(1), alReves[1]], [...alReves.slice(1), 'no-existe']]) {
    const respuesta = await json('PUT', `${fotografo}/orden-portfolios`, { orden });
    assert.equal(respuesta.status, 422);
    assert.equal((await respuesta.json()).regla.codigo, 'PORTFOLIO_ORDEN_NO_VALIDO');
  }
  assert.equal((await json('PUT', `${fotografo}/orden-portfolios`, { orden: 'bodas' })).status, 400);
  assert.deepEqual(await nombres(), alReves);
});

test('PUT portada elige la colección cuya portada es la del portfolio; sin elegir, la primera', async () => {
  // Otra fotógrafa con un portfolio de tres colecciones (la última importada ya como portada).
  importarOrganizacion(db, [
    {
      fotografo: { nombreInformal: 'Bea Dos', nombre: 'Bea', primerApellido: 'Dos', descripcion: '' },
      portfolios: [
        {
          nombre: 'Paisajes',
          coleccionPortada: 'Río',
          colecciones: [
            { nombre: 'Montaña', tags: [], fotos: [{ nombreFichero: 'cima.jpg', orden: 0 }] },
            { nombre: 'Vacía', tags: [], fotos: [] },
            { nombre: 'Río', tags: [], fotos: [{ nombreFichero: 'cascada.jpg', orden: 0 }] },
          ],
        },
      ],
    },
  ]);
  const fotografa = `${raiz}/fotografos/bea-dos`;
  const portfolio = `${fotografa}/portfolios/paisajes`;
  const portada = (coleccionPortada: unknown) => json('PUT', `${portfolio}/portada`, { coleccionPortada });
  const elegida = async () => (await (await fetch(portfolio)).json()).coleccionPortada;
  const portadaEnFotografo = async () => (await (await fetch(fotografa)).json()).portfolios[0].coverPhotoUrl;

  assert.equal(await elegida(), 'rio');
  assert.equal(await portadaEnFotografo(), '/photos/bea-dos/paisajes/rio/cascada.jpg');

  // La colección elegida sin fotos: el portfolio no tiene portada ("Sin fotos" en la web).
  assert.equal((await portada('vacia')).status, 204);
  assert.equal(await elegida(), 'vacia');
  assert.equal(await portadaEnFotografo(), '');

  const inexistente = await portada('no-existe');
  assert.equal(inexistente.status, 422);
  assert.equal((await inexistente.json()).regla.codigo, 'PORTFOLIO_COLECCION_PORTADA_INEXISTENTE');
  assert.equal((await portada(3)).status, 400);

  assert.equal((await portada(null)).status, 204);
  assert.equal(await elegida(), undefined);
  assert.equal(await portadaEnFotografo(), '/photos/bea-dos/paisajes/montanya/cima.jpg');

  // Si se elimina la colección de portada, el portfolio se queda sin portada elegida.
  await portada('Río');
  assert.equal(await elegida(), 'rio');
  mkdirSync(path.join(fotos, 'bea-dos', 'paisajes', 'rio'), { recursive: true });
  assert.equal((await fetch(`${portfolio}/colecciones/rio?confirmar=true`, { method: 'DELETE' })).status, 204);
  assert.equal(await elegida(), undefined);
});

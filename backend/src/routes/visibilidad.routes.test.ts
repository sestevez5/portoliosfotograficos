import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import express from 'express';

// Visibilidad: un portfolio o una colección ocultos solo los ven su fotógrafo y el administrador;
// para los demás no existen (ni en los listados, ni en los totales, ni sus fotos en /photos).
const datos = mkdtempSync(path.join(tmpdir(), 'portfolio-datos-'));
process.env.DATOS_DIR = datos;

const { catalogoRouter } = await import('./catalogo.routes.js');
const { soloFotosVisibles } = await import('./fotos-visibles.routes.js');
const { gestionarErrores } = await import('../gestionar-errores.js');
const { abrirBaseDatos } = await import('../db/conexion.js');
const { fotosDir } = await import('../config/rutas.js');
const { registrarFotografo } = await import('../services/fotografo.service.js');
const { crearPortfolio } = await import('../services/portfolio.service.js');
const { crearColeccion } = await import('../services/coleccion.service.js');

const db = abrirBaseDatos();
const app = express();
app.use('/api', catalogoRouter);
app.use('/photos', soloFotosVisibles, express.static(fotosDir, { dotfiles: 'ignore' }));
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

// Ana tiene dos portfolios: "Viajes" (colecciones "Mar", con etiqueta y una foto, y "Monte") y "Bodas"
// (colección "Playa"). Bea no tiene nada.
const alta = (usuario: string, nombreInformal: string) =>
  registrarFotografo({ usuario, email: `${usuario}@x.com`, contrasenya: 'secreta123', nombreInformal, nombre: nombreInformal, primerApellido: 'Prueba' });
alta('ana', 'Ana');
alta('bea', 'Bea');
crearPortfolio('ana', { nombre: 'Viajes' });
crearPortfolio('ana', { nombre: 'Bodas' });
crearColeccion('ana', 'viajes', { nombre: 'Mar', tags: ['agua'] });
crearColeccion('ana', 'viajes', { nombre: 'Monte' });
crearColeccion('ana', 'bodas', { nombre: 'Playa' });
writeFileSync(path.join(fotosDir, 'ana', 'viajes', 'mar', '01.jpg'), 'foto');
writeFileSync(path.join(fotosDir, 'ana', 'bodas', 'playa', '01.jpg'), 'foto');

const entrar = async (usuario: string, contrasenya: string) =>
  (
    await fetch(`${base}/api/sesion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, contrasenya }),
    })
  ).headers
    .get('set-cookie')!
    .split(';')[0];

const ana = await entrar('ana', 'secreta123');
const bea = await entrar('bea', 'secreta123');
const admin = await entrar('admin', 'admin');

const peticion = (method: string, ruta: string, cookie?: string, cuerpo?: unknown) =>
  fetch(`${base}${ruta}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
    ...(cuerpo !== undefined && { body: JSON.stringify(cuerpo) }),
  });
const estado = async (ruta: string, cookie?: string) => (await peticion('GET', ruta, cookie)).status;
const json = async (ruta: string, cookie?: string) => (await peticion('GET', ruta, cookie)).json();

const MAR = '/api/fotografos/ana/portfolios/viajes/colecciones/mar';
const FOTO_MAR = '/photos/ana/viajes/mar/01.jpg';

test('por defecto todo es visible para cualquiera', async () => {
  const portfolio = await json('/api/fotografos/ana/portfolios/viajes');
  assert.equal(portfolio.visible, true);
  assert.deepEqual(
    portfolio.colecciones.map((c: { nombreNormalizado: string; visible: boolean }) => [c.nombreNormalizado, c.visible]),
    [['mar', true], ['monte', true]],
  );
  assert.equal(await estado(FOTO_MAR), 200);
});

test('solo el dueño o el administrador cambian la visibilidad', async () => {
  assert.equal((await peticion('PUT', `${MAR}/visibilidad`, undefined, { visible: false })).status, 401);
  assert.equal((await peticion('PUT', `${MAR}/visibilidad`, bea, { visible: false })).status, 403);
  assert.equal((await peticion('PUT', '/api/fotografos/ana/portfolios/viajes/visibilidad', bea, { visible: false })).status, 403);
  assert.equal((await peticion('PUT', `${MAR}/visibilidad`, ana, { visible: 'no' })).status, 400);
  assert.equal((await json(MAR)).visible, true);
});

test('una colección oculta solo la ven su fotógrafo y el administrador', async () => {
  assert.equal((await peticion('PUT', `${MAR}/visibilidad`, ana, { visible: false })).status, 204);

  for (const cookie of [undefined, bea]) {
    assert.equal(await estado(MAR, cookie), 404);
    assert.equal(await estado(FOTO_MAR, cookie), 404);
    const portfolio = await json('/api/fotografos/ana/portfolios/viajes', cookie);
    assert.deepEqual(portfolio.colecciones.map((c: { nombreNormalizado: string }) => c.nombreNormalizado), ['monte']);
    const fotografo = await json('/api/fotografos/ana', cookie);
    assert.equal(fotografo.portfolios[0].collectionCount, 1);
    // La portada del portfolio ya no es la de la colección oculta (la primera), sino la de "Monte" (sin fotos).
    assert.equal(fotografo.portfolios[0].coverPhotoUrl, '');
    assert.equal((await json('/api/fotografos', cookie))[0].collectionCount, 2);
    assert.deepEqual(await json('/api/tags', cookie), []);
    assert.equal((await json('/api/colecciones', cookie)).length, 2);
  }

  for (const cookie of [ana, admin]) {
    assert.equal((await json(MAR, cookie)).visible, false);
    assert.equal(await estado(FOTO_MAR, cookie), 200);
    const portfolio = await json('/api/fotografos/ana/portfolios/viajes', cookie);
    assert.deepEqual(
      portfolio.colecciones.map((c: { nombreNormalizado: string; visible: boolean }) => [c.nombreNormalizado, c.visible]),
      [['mar', false], ['monte', true]],
    );
    assert.equal((await json('/api/fotografos', cookie))[0].collectionCount, 3);
    assert.deepEqual(await json('/api/tags', cookie), ['agua']);
  }

  // Volver a mostrarla.
  assert.equal((await peticion('PUT', `${MAR}/visibilidad`, admin, { visible: true })).status, 204);
  assert.equal(await estado(MAR), 200);
  assert.equal(await estado(FOTO_MAR), 200);
});

test('un portfolio oculto oculta también sus colecciones y sus fotos', async () => {
  assert.equal((await peticion('PUT', '/api/fotografos/ana/portfolios/bodas/visibilidad', ana, { visible: false })).status, 204);

  assert.equal(await estado('/api/fotografos/ana/portfolios/bodas'), 404);
  assert.equal(await estado('/api/fotografos/ana/portfolios/bodas/colecciones/playa', bea), 404);
  assert.equal(await estado('/photos/ana/bodas/playa/01.jpg'), 404);
  assert.deepEqual((await json('/api/fotografos/ana')).portfolios.map((p: { nombreNormalizado: string }) => p.nombreNormalizado), ['viajes']);
  const [resumen] = await json('/api/fotografos', bea);
  assert.deepEqual([resumen.portfolioCount, resumen.collectionCount], [1, 2]);

  assert.deepEqual(
    (await json('/api/fotografos/ana', ana)).portfolios.map((p: { nombreNormalizado: string; visible: boolean }) => [p.nombreNormalizado, p.visible]),
    [['viajes', true], ['bodas', false]],
  );
  assert.equal((await json('/api/fotografos/ana/portfolios/bodas', ana)).visible, false);
  assert.equal(await estado('/photos/ana/bodas/playa/01.jpg', ana), 200);
  // El dueño puede seguir gestionándolo aunque esté oculto.
  assert.equal((await peticion('PUT', '/api/fotografos/ana/portfolios/bodas', ana, { nombre: 'Bodas', descripcion: 'x' })).status, 200);
});

test('/photos solo sirve fotos de colecciones del catálogo, se escriba la ruta como se escriba', async () => {
  assert.equal(await estado('/photos/ana/bodas%2Fplaya/01.jpg'), 404);
  assert.equal(await estado('/photos/ANA/Bodas/PLAYA/01.jpg'), 404);
  assert.equal(await estado('/photos/ana/bodas./playa/01.jpg'), 404);
  assert.equal(await estado('/photos/ana/viajes/no-existe/01.jpg'), 404);
  assert.equal(await estado('/photos/ana/viajes'), 404);
});

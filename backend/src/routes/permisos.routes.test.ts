import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import express from 'express';

// Permisos (routes/autorizacion.ts): el administrador puede modificarlo todo; cualquier otro
// usuario, solo lo suyo; sin sesión, nada (401). Modificar lo de otro da 403.
const datos = mkdtempSync(path.join(tmpdir(), 'portfolio-datos-'));
process.env.DATOS_DIR = datos;

const { catalogoRouter } = await import('./catalogo.routes.js');
const { gestionarErrores } = await import('../gestionar-errores.js');
const { abrirBaseDatos } = await import('../db/conexion.js');
const { registrarFotografo } = await import('../services/fotografo.service.js');
const { crearPortfolio } = await import('../services/portfolio.service.js');

const db = abrirBaseDatos();
const app = express();
app.use('/api', catalogoRouter);
app.use(gestionarErrores);
const servidor = app.listen(0);
const api = `http://localhost:${(servidor.address() as AddressInfo).port}/api`;

after(() => {
  servidor.close();
  db.close();
  try {
    rmSync(datos, { recursive: true, force: true });
  } catch {
    // se limpiará con el resto de temporales del sistema
  }
});

// Dos fotógrafos, cada uno con un portfolio.
const alta = (usuario: string, nombreInformal: string) =>
  registrarFotografo({ usuario, email: `${usuario}@x.com`, contrasenya: 'secreta123', nombreInformal, nombre: nombreInformal, primerApellido: 'Prueba' });
alta('ana', 'Ana');
alta('bea', 'Bea');
crearPortfolio('ana', { nombre: 'Viajes' });
crearPortfolio('bea', { nombre: 'Retratos' });

const entrar = async (usuario: string, contrasenya: string) =>
  (
    await fetch(`${api}/sesion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, contrasenya }),
    })
  ).headers
    .get('set-cookie')!
    .split(';')[0];

const ana = await entrar('ana', 'secreta123');
const admin = await entrar('admin', 'admin');

const peticion = (method: string, ruta: string, cookie?: string, cuerpo?: unknown) =>
  fetch(`${api}${ruta}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
    ...(cuerpo !== undefined && { body: JSON.stringify(cuerpo) }),
  });

test('sin sesión no se puede modificar nada (401), pero sí consultar y registrarse', async () => {
  assert.equal((await peticion('PUT', '/fotografos/ana', undefined, { nombreInformal: 'Ana', nombre: 'A', primerApellido: 'P' })).status, 401);
  assert.equal((await peticion('POST', '/fotografos/ana/portfolios', undefined, { nombre: 'X' })).status, 401);
  assert.equal((await peticion('DELETE', '/fotografos/ana/portfolios/viajes')).status, 401);
  assert.equal((await peticion('GET', '/fotografos/ana/edicion')).status, 401);
  assert.equal((await peticion('GET', '/fotografos/ana')).status, 200);
});

test('un usuario puede modificar lo suyo', async () => {
  assert.equal((await peticion('GET', '/fotografos/ana/edicion', ana)).status, 200);
  assert.equal((await peticion('POST', '/fotografos/ana/portfolios', ana, { nombre: 'Montaña' })).status, 201);
  assert.equal((await peticion('PUT', '/fotografos/ana/portfolios/montanya', ana, { nombre: 'Montañas' })).status, 200);
  assert.equal((await peticion('POST', '/fotografos/ana/portfolios/montanyas/colecciones', ana, { nombre: 'Picos' })).status, 201);
  assert.equal((await peticion('DELETE', '/fotografos/ana/portfolios/montanyas?confirmar=true', ana)).status, 204);
  // Aunque escriba su dirección con mayúsculas o tildes.
  assert.equal((await peticion('GET', '/fotografos/ANA/edicion', ana)).status, 200);
});

test('un usuario no puede modificar lo de otro (403) ni ver sus datos de edición', async () => {
  assert.equal((await peticion('GET', '/fotografos/bea/edicion', ana)).status, 403);
  assert.equal((await peticion('PUT', '/fotografos/bea', ana, { nombreInformal: 'Bea', nombre: 'B', primerApellido: 'P' })).status, 403);
  assert.equal((await peticion('DELETE', '/fotografos/bea', ana)).status, 403);
  assert.equal((await peticion('DELETE', '/fotografos/bea/foto', ana)).status, 403);
  assert.equal((await peticion('POST', '/fotografos/bea/portfolios', ana, { nombre: 'X' })).status, 403);
  assert.equal((await peticion('PUT', '/fotografos/bea/portfolios/retratos', ana, { nombre: 'X' })).status, 403);
  assert.equal((await peticion('DELETE', '/fotografos/bea/portfolios/retratos', ana)).status, 403);
  assert.equal((await peticion('POST', '/fotografos/bea/portfolios/retratos/colecciones', ana, { nombre: 'X' })).status, 403);
  // Nada ha cambiado.
  assert.equal((await (await peticion('GET', '/fotografos/bea')).json()).portfolios.length, 1);
});

test('solo el administrador da de alta fotógrafos y cambia su contraseña; y puede modificar lo de cualquiera', async () => {
  const nuevo = { nombreInformal: 'Carla', nombre: 'Carla', primerApellido: 'Tres' };
  assert.equal((await peticion('POST', '/fotografos', ana, nuevo)).status, 403);
  assert.equal((await peticion('PUT', '/admin/contrasenya', ana, { contrasenyaActual: 'x', contrasenyaNueva: 'y' })).status, 403);
  assert.equal((await peticion('POST', '/fotografos', admin, nuevo)).status, 201);

  assert.equal((await peticion('GET', '/fotografos/bea/edicion', admin)).status, 200);
  assert.equal((await peticion('PUT', '/fotografos/bea/portfolios/retratos', admin, { nombre: 'Retratos de estudio' })).status, 200);
});

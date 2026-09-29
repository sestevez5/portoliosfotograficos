import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import express from 'express';

// El repositorio abre la BD al importarse: se apunta antes a una carpeta de datos temporal
// (cada fichero de test se ejecuta en su propio proceso). La BD nueva ya trae al administrador.
const datos = mkdtempSync(path.join(tmpdir(), 'portfolio-datos-'));
process.env.DATOS_DIR = datos;

const { cambiarContrasenyaAdministrador, completarPrimerUso, esPrimerUso } = await import('./administrador.service.js');
const { ReglaNegocioIncumplida } = await import('../reglas/index.js');
const { verificarContrasenya } = await import('../utils/contrasenya.js');
const { abrirBaseDatos } = await import('../db/conexion.js');
const { catalogoRouter } = await import('../routes/catalogo.routes.js');
const { gestionarErrores } = await import('../gestionar-errores.js');

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

const hashAdministrador = () =>
  (db.prepare("SELECT passwordHash FROM usuarios WHERE rol = 'administrador'").get() as { passwordHash: string }).passwordHash;

const esRegla = (codigo: string) => (error: unknown) =>
  error instanceof ReglaNegocioIncumplida && error.codigo === codigo && error.operacion !== undefined;

test('en una BD nueva la aplicación está en su primer uso', async () => {
  assert.equal(esPrimerUso(), true);
  assert.deepEqual(await (await fetch(`${api}/estado`)).json(), { primerUso: true });
});

test('el primer uso rechaza credenciales incorrectas o una contraseña nueva que no vale, sin cambiar nada', () => {
  assert.throws(() => completarPrimerUso({ usuario: 'admin', contrasenya: 'otra' }), esRegla('USUARIO_CREDENCIALES_INCORRECTAS'));
  assert.throws(() => completarPrimerUso({ usuario: 'root', contrasenya: 'admin' }), esRegla('USUARIO_CREDENCIALES_INCORRECTAS'));
  assert.throws(
    () => completarPrimerUso({ usuario: 'admin', contrasenya: 'admin', contrasenyaNueva: 'corta' }),
    esRegla('USUARIO_CONTRASENYA_CORTA'),
  );
  assert.equal(esPrimerUso(), true);
  assert.ok(verificarContrasenya('admin', hashAdministrador()));
});

test('el primer uso se completa (por la API) con las credenciales iniciales y la contraseña nueva', async () => {
  const respuesta = await fetch(`${api}/admin/primer-uso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: ' Admin ', contrasenya: 'admin', contrasenyaNueva: 'nueva-clave-1' }),
  });
  assert.equal(respuesta.status, 204);
  assert.equal(esPrimerUso(), false);
  assert.ok(verificarContrasenya('nueva-clave-1', hashAdministrador()));

  // Solo una vez.
  assert.throws(() => completarPrimerUso({ usuario: 'admin', contrasenya: 'nueva-clave-1' }), esRegla('PRIMER_USO_COMPLETADO'));
});

test('cambiar la contraseña exige la actual y una nueva válida y distinta', async () => {
  assert.throws(
    () => cambiarContrasenyaAdministrador({ contrasenyaActual: 'admin', contrasenyaNueva: 'otra-clave-2' }),
    esRegla('USUARIO_CREDENCIALES_INCORRECTAS'),
  );
  assert.throws(
    () => cambiarContrasenyaAdministrador({ contrasenyaActual: 'nueva-clave-1', contrasenyaNueva: 'nueva-clave-1' }),
    esRegla('USUARIO_CONTRASENYA_REPETIDA'),
  );

  // Por la API hace falta la sesión del administrador.
  const cambio = { contrasenyaActual: 'nueva-clave-1', contrasenyaNueva: 'otra-clave-2' };
  const sinSesion = await fetch(`${api}/admin/contrasenya`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cambio),
  });
  assert.equal(sinSesion.status, 401);
  const cookie = (
    await fetch(`${api}/sesion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'admin', contrasenya: 'nueva-clave-1' }),
    })
  ).headers
    .get('set-cookie')!
    .split(';')[0];
  const conSesion = { 'Content-Type': 'application/json', Cookie: cookie };

  const incorrecta = await fetch(`${api}/admin/contrasenya`, {
    method: 'PUT',
    headers: conSesion,
    body: JSON.stringify({ contrasenyaActual: 'mal', contrasenyaNueva: 'otra-clave-2' }),
  });
  assert.equal(incorrecta.status, 422);
  assert.equal((await incorrecta.json()).regla.codigo, 'USUARIO_CREDENCIALES_INCORRECTAS');

  const correcta = await fetch(`${api}/admin/contrasenya`, {
    method: 'PUT',
    headers: conSesion,
    body: JSON.stringify(cambio),
  });
  assert.equal(correcta.status, 204);
  assert.ok(verificarContrasenya('otra-clave-2', hashAdministrador()));
});

test('el nombre de usuario "admin" no se puede usar para otro usuario', async () => {
  const { importarOrganizacion } = await import('../db/importar.js');
  assert.throws(
    () =>
      importarOrganizacion(db, [
        { fotografo: { nombreInformal: 'Ana Uno', usuario: 'admin', nombre: 'Ana', primerApellido: 'Uno', descripcion: '' }, portfolios: [] },
      ]),
    (error: unknown) => error instanceof ReglaNegocioIncumplida && error.codigo === 'USUARIO_DUPLICADO',
  );
});

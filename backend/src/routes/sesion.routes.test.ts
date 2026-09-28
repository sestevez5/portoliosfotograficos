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

const { albumsRouter } = await import('./albums.routes.js');
const { gestionarErrores } = await import('../gestionar-errores.js');
const { abrirBaseDatos } = await import('../db/conexion.js');

const db = abrirBaseDatos();
const app = express();
app.use('/api', albumsRouter);
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

const json = (method: string, url: string, cuerpo: unknown, cookie?: string) =>
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify(cuerpo),
  });

// La cookie de sesión de una respuesta, lista para enviarla en la siguiente petición.
const cookieDe = (respuesta: Response) => respuesta.headers.get('set-cookie')?.split(';')[0];

const sesion = async (cookie?: string) =>
  (await (await fetch(`${api}/sesion`, { headers: cookie ? { Cookie: cookie } : {} })).json()).usuario;

const REGISTRO = {
  usuario: ' Ana.Uno ',
  email: 'ana@example.com',
  contrasenya: 'secreta123',
  nombreInformal: 'Ana Uno',
  nombre: 'Ana',
  primerApellido: 'Uno',
};

test('sin sesión no hay usuario', async () => {
  assert.equal(await sesion(), null);
});

test('el registro crea usuario, fotógrafo y carpeta, y deja la sesión iniciada', async () => {
  const respuesta = await json('POST', `${api}/registro`, REGISTRO);
  assert.equal(respuesta.status, 201);
  const cookie = cookieDe(respuesta)!;
  assert.match(respuesta.headers.get('set-cookie')!, /HttpOnly/i);

  const esperado = {
    usuario: 'ana.uno',
    rol: 'usuario',
    fotografo: { nombreInformal: 'Ana Uno', nombreInformalNormalizado: 'ana-uno', logoUrl: '/api/fotografos/ana-uno/logo' },
  };
  assert.deepEqual((await respuesta.json()).usuario, esperado);
  assert.deepEqual(await sesion(cookie), esperado);
  assert.ok(existsSync(path.join(datos, 'fotos', 'ana-uno')));

  // La BD guarda el hash del token, no el token.
  const token = cookie.split('=')[1];
  assert.equal(db.prepare('SELECT 1 FROM sesiones WHERE tokenHash = ?').get(token), undefined);
});

test('reglas del registro: usuario, correo y contraseña obligatorios y usuario válido y no repetido', async () => {
  const regla = async (cambios: object) => (await (await json('POST', `${api}/registro`, { ...REGISTRO, nombreInformal: 'Bea', ...cambios })).json()).regla?.codigo;
  assert.equal(await regla({ usuario: '' }), 'USUARIO_OBLIGATORIO');
  assert.equal(await regla({ usuario: 'bea', email: '' }), 'USUARIO_EMAIL_OBLIGATORIO');
  assert.equal(await regla({ usuario: 'bea', email: 'bea@x.com', contrasenya: '' }), 'USUARIO_CONTRASENYA_OBLIGATORIA');
  assert.equal(await regla({ usuario: 'no vale', email: 'bea@x.com' }), 'USUARIO_NO_VALIDO');
  assert.equal(await regla({ usuario: 'ANA.UNO', email: 'bea@x.com' }), 'USUARIO_DUPLICADO');
  assert.equal(await regla({ usuario: 'admin', email: 'bea@x.com' }), 'USUARIO_DUPLICADO');
  assert.equal(await regla({ usuario: 'bea', email: 'ANA@example.com' }), 'USUARIO_EMAIL_DUPLICADO');
  assert.equal(await regla({ usuario: 'bea', email: 'bea@x.com', nombreInformal: 'Registro' }), 'FOTOGRAFO_NOMBRE_INFORMAL_RESERVADO');
  assert.equal((db.prepare("SELECT count(*) AS n FROM usuarios WHERE usuario = 'bea'").get() as { n: number }).n, 0);
});

test('iniciar sesión con el usuario o con el correo; credenciales incorrectas dan 422', async () => {
  const porUsuario = await json('POST', `${api}/sesion`, { usuario: 'ANA.UNO', contrasenya: 'secreta123' });
  assert.equal(porUsuario.status, 200);
  assert.equal((await sesion(cookieDe(porUsuario)))?.usuario, 'ana.uno');

  const porCorreo = await json('POST', `${api}/sesion`, { usuario: 'Ana@Example.com', contrasenya: 'secreta123' });
  assert.equal((await porCorreo.json()).usuario.usuario, 'ana.uno');

  const mal = await json('POST', `${api}/sesion`, { usuario: 'ana.uno', contrasenya: 'otra' });
  assert.equal(mal.status, 422);
  assert.equal((await mal.json()).regla.codigo, 'USUARIO_CREDENCIALES_INCORRECTAS');
  assert.equal(cookieDe(mal), undefined);
});

test('el administrador inicia sesión igual y no tiene fotógrafo', async () => {
  const respuesta = await json('POST', `${api}/sesion`, { usuario: 'admin', contrasenya: 'admin' });
  assert.deepEqual(await sesion(cookieDe(respuesta)), { usuario: 'admin', rol: 'administrador' });
});

test('cerrar sesión la invalida', async () => {
  const cookie = cookieDe(await json('POST', `${api}/sesion`, { usuario: 'ana.uno', contrasenya: 'secreta123' }))!;
  const cierre = await fetch(`${api}/sesion`, { method: 'DELETE', headers: { Cookie: cookie } });
  assert.equal(cierre.status, 204);
  assert.equal(await sesion(cookie), null);
});

test('una sesión caducada no vale', async () => {
  const cookie = cookieDe(await json('POST', `${api}/sesion`, { usuario: 'ana.uno', contrasenya: 'secreta123' }))!;
  db.prepare("UPDATE sesiones SET fechaExpiracion = '2000-01-01T00:00:00.000Z'").run();
  assert.equal(await sesion(cookie), null);
});

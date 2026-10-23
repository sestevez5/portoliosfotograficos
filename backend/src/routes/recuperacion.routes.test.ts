import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, beforeEach, test } from 'node:test';
import express from 'express';

// Recuperación de la contraseña por correo (services/recuperacion.service.ts). Los correos no se
// envían: se guardan en "enviados".
const datos = mkdtempSync(path.join(tmpdir(), 'portfolio-datos-'));
process.env.DATOS_DIR = datos;
process.env.PUBLIC_URL = 'https://fotos.example.com/';

const { catalogoRouter } = await import('./catalogo.routes.js');
const { gestionarErrores } = await import('../gestionar-errores.js');
const { abrirBaseDatos } = await import('../db/conexion.js');
const { cambiarEnvioCorreo } = await import('../utils/correo.js');

const enviados: { para: string; asunto: string; texto: string }[] = [];
cambiarEnvioCorreo(async (correo) => {
  enviados.push(correo);
});

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

const json = (method: string, url: string, cuerpo: unknown, cookie?: string) =>
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify(cuerpo),
  });
const cookieDe = (respuesta: Response) => respuesta.headers.get('set-cookie')?.split(';')[0];
const sesion = async (cookie: string) => (await (await fetch(`${api}/sesion`, { headers: { Cookie: cookie } })).json()).usuario;
const iniciar = (contrasenya: string) => json('POST', `${api}/sesion`, { usuario: 'ana@example.com', contrasenya });
// El token del enlace del último correo enviado.
const tokenDelCorreo = () => /token=([\w-]+)/.exec(enviados.at(-1)!.texto)![1];

const registro = await json('POST', `${api}/registro`, {
  usuario: 'ana.uno',
  email: 'ana@example.com',
  contrasenya: 'secreta123',
  nombreInformal: 'Ana Uno',
  nombre: 'Ana',
  primerApellido: 'Uno',
});
const cookieRegistro = cookieDe(registro)!;

beforeEach(() => {
  enviados.length = 0;
  db.prepare('DELETE FROM recuperacionesContrasenya').run();
});

test('pedir el enlace envía un correo con un enlace a la web pública, y la BD guarda solo el hash del token', async () => {
  const respuesta = await json('POST', `${api}/recuperar-contrasenya`, { email: ' ANA@example.com ' });
  assert.equal(respuesta.status, 204);
  await new Promise((r) => setImmediate(r));
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].para, 'ana@example.com');
  assert.match(enviados[0].texto, /^Hola, Ana:/);
  assert.match(enviados[0].texto, /https:\/\/fotos\.example\.com\/recuperar-contrasenya\/nueva\?token=/);
  const token = tokenDelCorreo();
  assert.equal(db.prepare('SELECT 1 FROM recuperacionesContrasenya WHERE tokenHash = ?').get(token), undefined);
  assert.equal((db.prepare('SELECT count(*) AS n FROM recuperacionesContrasenya').get() as { n: number }).n, 1);
});

test('con un correo que no es de nadie responde igual, pero no envía nada', async () => {
  const respuesta = await json('POST', `${api}/recuperar-contrasenya`, { email: 'nadie@example.com' });
  assert.equal(respuesta.status, 204);
  await new Promise((r) => setImmediate(r));
  assert.equal(enviados.length, 0);
});

test('un correo vacío o sin formato válido se rechaza', async () => {
  for (const [email, regla] of [
    ['', 'USUARIO_EMAIL_OBLIGATORIO'],
    ['ana', 'USUARIO_EMAIL_NO_VALIDO'],
  ]) {
    const respuesta = await json('POST', `${api}/recuperar-contrasenya`, { email });
    assert.equal(respuesta.status, 422);
    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.regla.codigo, regla);
    assert.equal(cuerpo.operacion.codigo, 'SOLICITAR_RECUPERACION');
  }
});

test('pedirlo dos veces seguidas no envía un segundo correo', async () => {
  await json('POST', `${api}/recuperar-contrasenya`, { email: 'ana@example.com' });
  await json('POST', `${api}/recuperar-contrasenya`, { email: 'ana@example.com' });
  await new Promise((r) => setImmediate(r));
  assert.equal(enviados.length, 1);
});

test('con el enlace se cambia la contraseña: cierra las demás sesiones, inicia una y el enlace deja de servir', async () => {
  await json('POST', `${api}/recuperar-contrasenya`, { email: 'ana@example.com' });
  await new Promise((r) => setImmediate(r));
  const token = tokenDelCorreo();
  const otraSesion = cookieDe(await iniciar('secreta123'))!;

  assert.equal((await json('POST', `${api}/recuperar-contrasenya/comprobar`, { token })).status, 204);
  const respuesta = await json('POST', `${api}/recuperar-contrasenya/nueva`, { token, contrasenya: 'nueva-clave' });
  assert.equal(respuesta.status, 200);
  assert.equal((await respuesta.json()).usuario.usuario, 'ana.uno');
  assert.equal((await sesion(cookieDe(respuesta)!)).usuario, 'ana.uno');

  // Las sesiones abiertas antes se cierran.
  assert.equal(await sesion(otraSesion), null);
  assert.equal(await sesion(cookieRegistro), null);
  // Vale la nueva, no la anterior.
  assert.equal((await iniciar('secreta123')).status, 422);
  assert.equal((await iniciar('nueva-clave')).status, 200);
  // El enlace ya no sirve.
  const otraVez = await json('POST', `${api}/recuperar-contrasenya/nueva`, { token, contrasenya: 'otra-clave-mas' });
  assert.equal(otraVez.status, 422);
  assert.equal((await otraVez.json()).regla.codigo, 'RECUPERACION_ENLACE_NO_VALIDO');
});

test('un enlace inventado o caducado no sirve', async () => {
  const inventado = await json('POST', `${api}/recuperar-contrasenya/comprobar`, { token: 'inventado' });
  assert.equal(inventado.status, 422);
  assert.equal((await inventado.json()).regla.codigo, 'RECUPERACION_ENLACE_NO_VALIDO');

  await json('POST', `${api}/recuperar-contrasenya`, { email: 'ana@example.com' });
  await new Promise((r) => setImmediate(r));
  db.prepare("UPDATE recuperacionesContrasenya SET fechaExpiracion = '2000-01-01T00:00:00.000Z'").run();
  const caducado = await json('POST', `${api}/recuperar-contrasenya/comprobar`, { token: tokenDelCorreo() });
  assert.equal(caducado.status, 422);
});

test('la contraseña nueva debe ser válida, y si no lo es el enlace sigue sirviendo', async () => {
  await json('POST', `${api}/recuperar-contrasenya`, { email: 'ana@example.com' });
  await new Promise((r) => setImmediate(r));
  const token = tokenDelCorreo();
  for (const [contrasenya, regla] of [
    ['', 'USUARIO_CONTRASENYA_OBLIGATORIA'],
    ['corta', 'USUARIO_CONTRASENYA_CORTA'],
  ]) {
    const respuesta = await json('POST', `${api}/recuperar-contrasenya/nueva`, { token, contrasenya });
    assert.equal(respuesta.status, 422);
    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.regla.codigo, regla);
    assert.equal(cuerpo.operacion.codigo, 'RESTABLECER_CONTRASENYA');
  }
  assert.equal((await json('POST', `${api}/recuperar-contrasenya/comprobar`, { token })).status, 204);
});

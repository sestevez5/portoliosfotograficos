import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
    email: 'ana@example.com',
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

test('"Mi perfil" devuelve los datos del usuario y de su fotógrafo; sin sesión, 401', async () => {
  assert.equal((await fetch(`${api}/perfil`)).status, 401);

  const cookie = cookieDe(await json('POST', `${api}/sesion`, { usuario: 'ana.uno', contrasenya: 'secreta123' }))!;
  const perfil = await (await fetch(`${api}/perfil`, { headers: { Cookie: cookie } })).json();
  assert.equal(perfil.usuario, 'ana.uno');
  assert.equal(perfil.email, 'ana@example.com');
  assert.equal(perfil.rol, 'usuario');
  assert.equal(perfil.tieneContrasenya, true);
  assert.ok(perfil.fechaCreacion && perfil.fechaUltimoAcceso);
  assert.equal(perfil.passwordHash, undefined);
  assert.deepEqual(perfil.fotografo, {
    nombreInformal: 'Ana Uno',
    nombreInformalNormalizado: 'ana-uno',
    nombre: 'Ana',
    primerApellido: 'Uno',
    descripcion: '',
    logoUrl: '/api/fotografos/ana-uno/logo',
    portfolioCount: 0,
    collectionCount: 0,
  });

  // El administrador no tiene fotógrafo.
  const admin = cookieDe(await json('POST', `${api}/sesion`, { usuario: 'admin', contrasenya: 'admin' }))!;
  assert.equal((await (await fetch(`${api}/perfil`, { headers: { Cookie: admin } })).json()).fotografo, undefined);
});

test('"Configuración": el tema preferido se guarda en el usuario y sale en la sesión', async () => {
  assert.equal((await json('PUT', `${api}/perfil/preferencias`, { temaPreferido: 'claro' })).status, 401);

  const cookie = cookieDe(await json('POST', `${api}/sesion`, { usuario: 'ana.uno', contrasenya: 'secreta123' }))!;
  assert.equal((await json('PUT', `${api}/perfil/preferencias`, { temaPreferido: 'azul' }, cookie)).status, 400);
  assert.equal((await json('PUT', `${api}/perfil/preferencias`, { temaPreferido: 'claro' }, cookie)).status, 204);
  assert.equal((await sesion(cookie)).temaPreferido, 'claro');

  // null = sin preferencia.
  assert.equal((await json('PUT', `${api}/perfil/preferencias`, { temaPreferido: null }, cookie)).status, 204);
  assert.equal((await sesion(cookie)).temaPreferido, undefined);
});

test('"Acerca de" da la versión de la aplicación y la del esquema de la BD, con sus fechas, y el autor, sin sesión', async () => {
  const paquete = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const respuesta = await fetch(`${api}/acerca-de`);
  assert.equal(respuesta.status, 200);
  const acercaDe = await respuesta.json();
  assert.deepEqual(acercaDe, {
    aplicacion: { version: paquete.version, fecha: paquete.fechaVersion },
    baseDatos: { version: db.pragma('user_version', { simple: true }), fecha: acercaDe.baseDatos.fecha },
    autor: 'Santi Estévez',
  });
  assert.match(acercaDe.aplicacion.fecha, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(acercaDe.baseDatos.fecha, /^\d{4}-\d{2}-\d{2}$/);
});

// Registra un usuario para los tests de "Editar cuenta" y devuelve su cookie de sesión.
const registrar = async (usuario: string, email: string, nombreInformal: string) =>
  cookieDe(
    await json('POST', `${api}/registro`, { usuario, email, contrasenya: 'secreta123', nombreInformal, nombre: 'Bea', primerApellido: 'Dos' }),
  )!;

test('"Editar cuenta" cambia el nombre de usuario (en minúsculas) y el tema preferido; sin sesión, 401', async () => {
  assert.equal((await json('PUT', `${api}/perfil/cuenta`, { usuario: 'x', temaPreferido: null })).status, 401);
  const cookie = await registrar('bea.dos', 'bea@example.com', 'Bea Dos');

  assert.equal((await json('PUT', `${api}/perfil/cuenta`, { temaPreferido: 'claro' }, cookie)).status, 400);
  assert.equal((await json('PUT', `${api}/perfil/cuenta`, { usuario: ' Bea.Nueva ', temaPreferido: 'claro' }, cookie)).status, 204);
  const ahora = await sesion(cookie);
  assert.equal(ahora.usuario, 'bea.nueva');
  assert.equal(ahora.temaPreferido, 'claro');
  // Se inicia sesión con el nombre nuevo.
  assert.equal((await json('POST', `${api}/sesion`, { usuario: 'bea.nueva', contrasenya: 'secreta123' })).status, 200);

  // Reglas: obligatorio, válido y no repetido.
  const regla = async (usuario: string) => (await (await json('PUT', `${api}/perfil/cuenta`, { usuario, temaPreferido: null }, cookie)).json()).regla.codigo;
  assert.equal(await regla('  '), 'USUARIO_OBLIGATORIO');
  assert.equal(await regla('b'), 'USUARIO_NO_VALIDO');
  assert.equal(await regla('ana.uno'), 'USUARIO_DUPLICADO');
  // Su propio nombre no choca consigo mismo.
  assert.equal((await json('PUT', `${api}/perfil/cuenta`, { usuario: 'bea.nueva', temaPreferido: null }, cookie)).status, 204);
});

test('el administrador puede editar sus preferencias, pero no su nombre de usuario', async () => {
  const admin = cookieDe(await json('POST', `${api}/sesion`, { usuario: 'admin', contrasenya: 'admin' }))!;
  const renombrar = await json('PUT', `${api}/perfil/cuenta`, { usuario: 'jefe', temaPreferido: null }, admin);
  assert.equal(renombrar.status, 422);
  assert.equal((await renombrar.json()).regla.codigo, 'USUARIO_ADMINISTRADOR_NO_RENOMBRABLE');
  assert.equal((await json('PUT', `${api}/perfil/cuenta`, { usuario: 'admin', temaPreferido: 'oscuro' }, admin)).status, 204);
  assert.equal((await sesion(admin)).temaPreferido, 'oscuro');
});

test('cambiar la contraseña (en "Editar cuenta") exige la actual y una nueva válida y distinta, y cierra las demás sesiones', async () => {
  const cookie = await registrar('cris.tres', 'cris@example.com', 'Cris Tres');
  const otra = cookieDe(await json('POST', `${api}/sesion`, { usuario: 'cris.tres', contrasenya: 'secreta123' }))!;

  const cambiar = (contrasenyaActual: string, contrasenyaNueva: string) =>
    json('PUT', `${api}/perfil/cuenta`, { usuario: 'cris.tres', temaPreferido: null, contrasenya: { contrasenyaActual, contrasenyaNueva } }, cookie);
  const regla = async (actual: string, nueva: string) => (await (await cambiar(actual, nueva)).json()).regla.codigo;
  assert.equal(await regla('incorrecta', 'nueva12345'), 'USUARIO_CONTRASENYA_ACTUAL_INCORRECTA');
  assert.equal(await regla('secreta123', ''), 'USUARIO_CONTRASENYA_OBLIGATORIA');
  assert.equal(await regla('secreta123', 'corta'), 'USUARIO_CONTRASENYA_CORTA');
  assert.equal(await regla('secreta123', 'secreta123'), 'USUARIO_CONTRASENYA_REPETIDA');

  assert.equal((await cambiar('secreta123', 'nueva12345')).status, 204);
  assert.equal((await json('POST', `${api}/sesion`, { usuario: 'cris.tres', contrasenya: 'secreta123' })).status, 422);
  assert.equal((await json('POST', `${api}/sesion`, { usuario: 'cris.tres', contrasenya: 'nueva12345' })).status, 200);
  // La sesión de quien la cambia sigue abierta; la del otro navegador, no.
  assert.equal((await sesion(cookie))?.usuario, 'cris.tres');
  assert.equal(await sesion(otra), null);
});

test('el usuario y la contraseña se cambian juntos: o todo o nada', async () => {
  const cookie = await registrar('dani.cuatro', 'dani@example.com', 'Dani Cuatro');
  const cuenta = (contrasenyaActual: string) =>
    json('PUT', `${api}/perfil/cuenta`, { usuario: 'demo', temaPreferido: null, contrasenya: { contrasenyaActual, contrasenyaNueva: 'nueva12345' } }, cookie);

  // Con la contraseña actual mal no cambia nada, tampoco el usuario.
  assert.equal((await cuenta('incorrecta')).status, 422);
  assert.equal((await sesion(cookie)).usuario, 'dani.cuatro');

  // Bien: se entra con el usuario y la contraseña nuevos.
  assert.equal((await cuenta('secreta123')).status, 204);
  assert.equal((await json('POST', `${api}/sesion`, { usuario: 'demo', contrasenya: 'nueva12345' })).status, 200);
  assert.equal((await json('POST', `${api}/sesion`, { usuario: 'dani.cuatro', contrasenya: 'nueva12345' })).status, 422);
});

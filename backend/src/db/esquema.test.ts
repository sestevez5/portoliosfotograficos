import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import Database from 'better-sqlite3';

// Creación de la base de datos (db/conexion.ts): cada prueba abre su propia BD en una carpeta
// temporal.
const datos = mkdtempSync(path.join(tmpdir(), 'portfolio-esquema-'));
process.env.DATOS_DIR = datos;
const { abrirBaseDatos } = await import('./conexion.js');
const { verificarContrasenya } = await import('../utils/contrasenya.js');

after(() => {
  try {
    rmSync(datos, { recursive: true, force: true });
  } catch {
    // se limpiará con el resto de temporales del sistema
  }
});

const nueva = (nombre: string) => abrirBaseDatos(path.join(datos, `${nombre}.db`));
const cuenta = (db: Database.Database, tabla: string) => (db.prepare(`SELECT count(*) AS n FROM ${tabla}`).get() as { n: number }).n;

test('una BD nueva se crea con el esquema actual, solo con el administrador y en su primer uso', () => {
  const db = nueva('nueva');
  assert.equal(db.pragma('user_version', { simple: true }), 17);
  const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((t) => t.name);
  assert.deepEqual(tablas, ['coleccionTags', 'colecciones', 'fotografos', 'fotos', 'portfolios', 'sesiones', 'usuarios']);

  const administrador = db.prepare('SELECT idUsuario, usuario, passwordHash, rol, fechaUltimoAcceso FROM usuarios').get() as {
    idUsuario: number;
    usuario: string;
    passwordHash: string;
    rol: string;
    fechaUltimoAcceso: string | null;
  };
  assert.equal(cuenta(db, 'usuarios'), 1);
  assert.equal(administrador.usuario, 'admin');
  assert.equal(administrador.rol, 'administrador');
  assert.ok(verificarContrasenya('admin', administrador.passwordHash));
  assert.equal(administrador.fechaUltimoAcceso, null);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  db.close();
});

test('volver a abrirla no la recrea ni duplica al administrador', () => {
  nueva('reabrir').close();
  const db = nueva('reabrir');
  assert.equal(cuenta(db, 'usuarios'), 1);
  db.close();
});

test('una BD de otra versión del esquema no se abre (para no perder datos)', () => {
  const ruta = path.join(datos, 'otra-version.db');
  const otra = new Database(ruta);
  otra.exec('CREATE TABLE cualquiera (x); PRAGMA user_version = 14;');
  otra.close();
  assert.throws(() => abrirBaseDatos(ruta), /versión 14 del esquema y la aplicación espera la 17/);
});

test('una BD de la versión 15 se migra a la actual conservando sus datos', () => {
  const ruta = path.join(datos, 'version-15.db');
  // Una BD de la versión 15 es la actual sin la columna portfolios.idColeccionPortada.
  const v15 = new Database(ruta);
  v15.exec(`CREATE TABLE portfolios (idPortfolio INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
    CREATE TABLE colecciones (idColeccion INTEGER PRIMARY KEY);
    INSERT INTO portfolios (nombre) VALUES ('Viajes');
    PRAGMA user_version = 15;`);
  v15.close();

  const db = abrirBaseDatos(ruta);
  assert.equal(db.pragma('user_version', { simple: true }), 17);
  // Lo que ya había sigue visible para todos.
  assert.deepEqual(db.prepare('SELECT nombre, idColeccionPortada, visible FROM portfolios').all(), [
    { nombre: 'Viajes', idColeccionPortada: null, visible: 1 },
  ]);
  db.close();
});

test('solo puede haber un administrador y el rol solo admite sus dos valores', () => {
  const db = nueva('roles');
  assert.throws(() => db.prepare("INSERT INTO usuarios (usuario, rol) VALUES ('otro', 'administrador')").run(), /UNIQUE constraint failed/);
  assert.throws(() => db.prepare("INSERT INTO usuarios (usuario, rol) VALUES ('otro', 'jefe')").run(), /CHECK constraint failed/);
  db.close();
});

test('borrar un usuario borra en cascada su fotógrafo, portfolios, colecciones, fotos y sesiones', () => {
  const db = nueva('cascada');
  const idUsuario = Number(db.prepare("INSERT INTO usuarios (usuario) VALUES ('anun')").run().lastInsertRowid);
  const idFotografo = db
    .prepare(
      "INSERT INTO fotografos (idUsuario, nombreInformal, nombreInformalNormalizado, nombre, primerApellido, descripcion) VALUES (?, 'Ana Uno', 'ana-uno', 'Ana', 'Uno', '')",
    )
    .run(idUsuario).lastInsertRowid;
  const idPortfolio = db.prepare("INSERT INTO portfolios (idFotografo, nombreNormalizado, nombre, orden) VALUES (?, 'viajes', 'Viajes', 0)").run(idFotografo).lastInsertRowid;
  const idColeccion = db.prepare("INSERT INTO colecciones (idPortfolio, nombreNormalizado, nombre, orden) VALUES (?, 'mar', 'Mar', 0)").run(idPortfolio).lastInsertRowid;
  db.prepare("INSERT INTO fotos (idColeccion, nombreFichero, orden) VALUES (?, '01.jpg', 1)").run(idColeccion);
  db.prepare("INSERT INTO coleccionTags (idColeccion, tag, orden) VALUES (?, 'agua', 0)").run(idColeccion);
  db.prepare("INSERT INTO sesiones (idUsuario, tokenHash, fechaExpiracion) VALUES (?, 'x', '2999-01-01')").run(idUsuario);

  db.prepare('DELETE FROM usuarios WHERE idUsuario = ?').run(idUsuario);
  for (const tabla of ['fotografos', 'portfolios', 'colecciones', 'fotos', 'coleccionTags', 'sesiones']) {
    assert.equal(cuenta(db, tabla), 0, tabla);
  }
  db.close();
});

test('el trigger mantiene fechaModificacion', () => {
  const db = nueva('fechas');
  db.prepare("UPDATE usuarios SET fechaModificacion = '2000-01-01T00:00:00.000Z'").run();
  db.prepare("UPDATE usuarios SET email = 'admin@x.com'").run();
  const { fechaModificacion } = db.prepare('SELECT fechaModificacion FROM usuarios').get() as { fechaModificacion: string };
  assert.ok(fechaModificacion > '2000-01-01T00:00:00.000Z');
  db.close();
});

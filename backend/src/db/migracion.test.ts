import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import Database from 'better-sqlite3';

// Las migraciones se prueban sobre una BD real con un esquema anterior: se crea con SQL a mano y
// se abre con abrirBaseDatos(), que la migra a la versión actual.
const datos = mkdtempSync(path.join(tmpdir(), 'portfolio-migracion-'));
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

// Esquema de la versión 9 (usuario, email y passwordHash en fotografos), con lo imprescindible.
const ESQUEMA_9 = `
CREATE TABLE fotografos (
  idFotografo INTEGER PRIMARY KEY, usuario TEXT NOT NULL UNIQUE, nombreInformal TEXT NOT NULL,
  nombreInformalNormalizado TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL, primerApellido TEXT NOT NULL,
  segundoApellido TEXT, email TEXT UNIQUE COLLATE NOCASE, passwordHash TEXT, descripcion TEXT NOT NULL,
  fechaCreacion TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fechaModificacion TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE portfolios (
  idPortfolio INTEGER PRIMARY KEY,
  idFotografo INTEGER NOT NULL REFERENCES fotografos(idFotografo) ON DELETE CASCADE,
  nombreNormalizado TEXT NOT NULL, nombre TEXT NOT NULL, descripcion TEXT, orden INTEGER NOT NULL,
  fechaCreacion TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fechaModificacion TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TRIGGER fotografosFechaModificacion AFTER UPDATE ON fotografos
WHEN NEW.fechaModificacion = OLD.fechaModificacion
BEGIN
  UPDATE fotografos SET fechaModificacion = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE idFotografo = NEW.idFotografo;
END;
INSERT INTO fotografos (idFotografo, usuario, nombreInformal, nombreInformalNormalizado, nombre, primerApellido,
    email, passwordHash, descripcion, fechaCreacion)
  VALUES (3, 'anun', 'Ana Uno', 'ana-uno', 'Ana', 'Uno', 'ana@x.com', 'scrypt$hash', 'Paisaje', '2026-01-01T00:00:00.000Z'),
         (7, 'bdos', 'Bea Dos', 'bea-dos', 'Bea', 'Dos', NULL, NULL, '', '2026-02-01T00:00:00.000Z');
INSERT INTO portfolios (idFotografo, nombreNormalizado, nombre, orden) VALUES (3, 'viajes', 'Viajes', 0);
PRAGMA user_version = 9;
`;

test('desde la versión 9: usuario, email y contraseña pasan a usuarios conservando los datos, y se crea el administrador', () => {
  const ruta = path.join(datos, 'v9.db');
  const antigua = new Database(ruta);
  antigua.exec(ESQUEMA_9);
  antigua.close();

  const db = abrirBaseDatos(ruta);
  assert.equal(db.pragma('user_version', { simple: true }), 12);

  // Un usuario por fotógrafo, con el mismo id y sus datos de cuenta.
  assert.deepEqual(
    db
      .prepare(
        `SELECT f.idFotografo, f.idUsuario, f.nombreInformal, f.fechaCreacion, u.usuario, u.email, u.passwordHash
         FROM fotografos f JOIN usuarios u ON u.idUsuario = f.idUsuario ORDER BY f.idFotografo`,
      )
      .all(),
    [
      { idFotografo: 3, idUsuario: 3, nombreInformal: 'Ana Uno', fechaCreacion: '2026-01-01T00:00:00.000Z', usuario: 'anun', email: 'ana@x.com', passwordHash: 'scrypt$hash' },
      { idFotografo: 7, idUsuario: 7, nombreInformal: 'Bea Dos', fechaCreacion: '2026-02-01T00:00:00.000Z', usuario: 'bdos', email: null, passwordHash: null },
    ],
  );

  // fotografos ya no tiene las columnas de la cuenta.
  const columnas = (db.prepare('PRAGMA table_info(fotografos)').all() as { name: string }[]).map((c) => c.name);
  assert.ok(!columnas.includes('usuario') && !columnas.includes('email') && !columnas.includes('passwordHash'));

  // portfolios sigue apuntando a fotografos (no a la tabla anterior) y las claves foráneas son coherentes.
  const referencia = db.prepare('PRAGMA foreign_key_list(portfolios)').all() as { table: string }[];
  assert.deepEqual(referencia.map((r) => r.table), ['fotografos']);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);

  // Versión 11: los usuarios existentes son usuarios normales y se añade el administrador.
  assert.deepEqual(db.prepare("SELECT idUsuario FROM usuarios WHERE rol = 'usuario' ORDER BY idUsuario").all(), [
    { idUsuario: 3 },
    { idUsuario: 7 },
  ]);
  compruebaAdministrador(db);

  // Borrar el usuario borra en cascada su fotógrafo y sus portfolios.
  db.prepare('DELETE FROM usuarios WHERE idUsuario = 3').run();
  assert.equal((db.prepare('SELECT count(*) AS n FROM fotografos').get() as { n: number }).n, 1);
  assert.equal((db.prepare('SELECT count(*) AS n FROM portfolios').get() as { n: number }).n, 0);

  // El trigger de fechaModificacion de fotografos sigue funcionando.
  db.prepare("UPDATE fotografos SET descripcion = 'x' WHERE idFotografo = 7").run();
  const { fechaModificacion } = db.prepare('SELECT fechaModificacion FROM fotografos WHERE idFotografo = 7').get() as {
    fechaModificacion: string;
  };
  assert.ok(fechaModificacion > '2026-02-01');
  db.close();
});

test('una BD nueva se crea en la versión actual, solo con el administrador y en su primer uso', () => {
  const db = abrirBaseDatos(path.join(datos, 'nueva.db'));
  assert.equal(db.pragma('user_version', { simple: true }), 12);
  assert.equal((db.prepare('SELECT count(*) AS n FROM usuarios').get() as { n: number }).n, 1);
  compruebaAdministrador(db);
  db.close();
});

test('solo puede haber un administrador', () => {
  const db = abrirBaseDatos(path.join(datos, 'un-administrador.db'));
  assert.throws(
    () => db.prepare("INSERT INTO usuarios (usuario, rol) VALUES ('otro', 'administrador')").run(),
    /UNIQUE constraint failed/,
  );
  assert.throws(() => db.prepare("INSERT INTO usuarios (usuario, rol) VALUES ('otro', 'jefe')").run(), /CHECK constraint failed/);
  db.close();
});

// El administrador "admin", con la contraseña inicial "admin", sin fotógrafo y sin haber entrado
// nunca (primer uso pendiente).
function compruebaAdministrador(db: Database.Database): void {
  const administrador = db
    .prepare("SELECT idUsuario, usuario, passwordHash, fechaUltimoAcceso FROM usuarios WHERE rol = 'administrador'")
    .get() as { idUsuario: number; usuario: string; passwordHash: string; fechaUltimoAcceso: string | null };
  assert.equal(administrador.usuario, 'admin');
  assert.ok(verificarContrasenya('admin', administrador.passwordHash));
  assert.equal(administrador.fechaUltimoAcceso, null);
  assert.equal(db.prepare('SELECT 1 FROM fotografos WHERE idUsuario = ?').get(administrador.idUsuario), undefined);
}

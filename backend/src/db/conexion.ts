import { existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { dbPath, fotosDir } from '../config/rutas.js';
import { carpetaOcupada } from '../utils/carpetas.js';
import { normalizarNombre } from '../utils/normalizar-nombre.js';

// Notación lowerCamelCase para tablas y columnas. Cada tabla tiene una clave primaria entera
// id<Entidad>; las claves foráneas se llaman igual que la clave primaria a la que apuntan.
//
// fotografos.nombreInformal ("Santi Estévez") es el texto del logo.
//
// Columnas normalizadas (ver utils/normalizar-nombre.ts): fotografos.nombreInformalNormalizado
// (de nombreInformal, "Santi Estévez" -> "santi-estevez"), portfolios.nombreNormalizado y
// albumes.nombreNormalizado (de nombre, "Montaña" -> "montanya"). Son únicas (el fotógrafo en
// todo el catálogo, el portfolio dentro de su fotógrafo y el álbum dentro de su portfolio) y son
// a la vez el identificador en las URL y el nombre de la carpeta: las fotos están en
// datos/fotos/<nombreInformalNormalizado>/<portfolio.nombreNormalizado>/<album.nombreNormalizado>/.
// El nombreInformalNormalizado es además el nombre del logo en datos/logos. Las calcula la
// aplicación al guardar el nombre y nunca se editan a mano: si cambiaran sin renombrar la
// carpeta, las fotos dejarían de encontrarse.
// fotografos.usuario es interno (no se muestra ni sale en la API).
//
// Los ids son internos: no aparecen en la API ni en las URL.
//
// "orden" conserva el orden en que se muestran portfolios, álbumes y fotos. Los fotógrafos
// se listan por idFotografo (orden de alta).
//
// fechaCreacion y fechaModificacion (texto ISO 8601 en UTC) las mantiene la propia base de
// datos: la primera con un DEFAULT y la segunda con un trigger AFTER UPDATE por tabla.
//
// fotografos.email es opcional pero único (varios NULL están permitidos) y sin distinguir
// mayúsculas. fotografos.passwordHash guardará el hash de la contraseña (nunca el texto
// plano) cuando exista el alta/login; por ahora queda vacío.
// Índices únicos de los nombres normalizados de portfolios y álbumes (desde la versión 9).
const INDICES_NOMBRE_NORMALIZADO = `
CREATE UNIQUE INDEX portfoliosNombreNormalizado ON portfolios(idFotografo, nombreNormalizado);
CREATE UNIQUE INDEX albumesNombreNormalizado ON albumes(idPortfolio, nombreNormalizado);`;

const ESQUEMA = `
CREATE TABLE fotografos (
  idFotografo                INTEGER PRIMARY KEY,
  usuario                    TEXT NOT NULL UNIQUE,
  nombreInformal             TEXT NOT NULL,
  nombreInformalNormalizado  TEXT NOT NULL UNIQUE,
  nombre                     TEXT NOT NULL,
  primerApellido             TEXT NOT NULL,
  segundoApellido            TEXT,
  email                      TEXT UNIQUE COLLATE NOCASE,
  passwordHash               TEXT,
  descripcion                TEXT NOT NULL,
  fechaCreacion      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fechaModificacion  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE portfolios (
  idPortfolio    INTEGER PRIMARY KEY,
  idFotografo    INTEGER NOT NULL REFERENCES fotografos(idFotografo) ON DELETE CASCADE,
  nombreNormalizado  TEXT NOT NULL,
  nombre         TEXT NOT NULL,
  descripcion    TEXT,
  orden          INTEGER NOT NULL,
  fechaCreacion      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fechaModificacion  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (idFotografo, nombre)
);
CREATE INDEX portfoliosPorFotografo ON portfolios(idFotografo, orden);

CREATE TABLE albumes (
  idAlbum        INTEGER PRIMARY KEY,
  idPortfolio    INTEGER NOT NULL REFERENCES portfolios(idPortfolio) ON DELETE CASCADE,
  nombreNormalizado  TEXT NOT NULL,
  nombre         TEXT NOT NULL,
  descripcion    TEXT,
  idFotoPortada  INTEGER REFERENCES fotos(idFoto) ON DELETE SET NULL,
  orden          INTEGER NOT NULL,
  fechaCreacion      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fechaModificacion  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (idPortfolio, nombre)
);
CREATE INDEX albumesPorPortfolio ON albumes(idPortfolio, orden);
${INDICES_NOMBRE_NORMALIZADO}

CREATE TABLE fotos (
  idFoto    INTEGER PRIMARY KEY,
  idAlbum   INTEGER NOT NULL REFERENCES albumes(idAlbum) ON DELETE CASCADE,
  nombreFichero  TEXT NOT NULL,
  titulo         TEXT,
  orden          INTEGER NOT NULL,
  ancho          INTEGER,
  alto           INTEGER,
  fechaCreacion      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fechaModificacion  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (idAlbum, nombreFichero)
);
CREATE INDEX fotosPorAlbum ON fotos(idAlbum, orden);

CREATE TABLE albumTags (
  idAlbum  INTEGER NOT NULL REFERENCES albumes(idAlbum) ON DELETE CASCADE,
  tag      TEXT NOT NULL,
  orden    INTEGER NOT NULL,
  PRIMARY KEY (idAlbum, tag)
);
CREATE INDEX albumTagsPorTag ON albumTags(tag);
${['fotografos:idFotografo', 'portfolios:idPortfolio', 'albumes:idAlbum', 'fotos:idFoto']
  .map((par) => {
    const [tabla, pk] = par.split(':');
    // El WHEN evita pisar una fechaModificacion puesta a mano en el propio UPDATE.
    return `
CREATE TRIGGER ${tabla}FechaModificacion AFTER UPDATE ON ${tabla}
WHEN NEW.fechaModificacion = OLD.fechaModificacion
BEGIN
  UPDATE ${tabla} SET fechaModificacion = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE ${pk} = NEW.${pk};
END;`;
  })
  .join('\n')}
`;

// Versión del esquema, guardada en PRAGMA user_version. Cada cambio de esquema posterior
// debe subirla y añadir su migración en migrar(), conservando los datos existentes.
const VERSION_ESQUEMA = 9;

// Versión 8 -> 9: portfolios.nombreCarpeta y albumes.nombreCarpeta pasan a ser nombreNormalizado,
// calculado a partir de nombre, y las carpetas de datos/fotos que no se llamaban así se renombran.
// Si algo falla, la transacción deshace la BD y aquí se deshacen los renombrados ya hechos.
function migrarA9(db: Database.Database): void {
  db.exec(`
    ALTER TABLE portfolios RENAME COLUMN nombreCarpeta TO nombreNormalizado;
    ALTER TABLE albumes RENAME COLUMN nombreCarpeta TO nombreNormalizado;
  `);

  const portfolios = db
    .prepare(
      `SELECT p.idPortfolio AS id, f.nombreInformalNormalizado AS carpetaFotografo, p.nombreNormalizado AS carpeta, p.nombre
       FROM portfolios p JOIN fotografos f ON f.idFotografo = p.idFotografo`,
    )
    .all() as { id: number; carpetaFotografo: string; carpeta: string; nombre: string }[];
  const albumes = db
    .prepare(
      `SELECT a.idAlbum AS id, f.nombreInformalNormalizado AS carpetaFotografo, p.nombre AS nombrePortfolio,
         a.nombreNormalizado AS carpeta, a.nombre
       FROM albumes a JOIN portfolios p ON p.idPortfolio = a.idPortfolio JOIN fotografos f ON f.idFotografo = p.idFotografo`,
    )
    .all() as { id: number; carpetaFotografo: string; nombrePortfolio: string; carpeta: string; nombre: string }[];

  const actualizarPortfolio = db.prepare('UPDATE portfolios SET nombreNormalizado = ? WHERE idPortfolio = ?');
  const actualizarAlbum = db.prepare('UPDATE albumes SET nombreNormalizado = ? WHERE idAlbum = ?');

  const renombrados: [string, string][] = [];
  const renombrar = (actual: string, destino: string) => {
    if (actual === destino || !existsSync(actual)) {
      return;
    }
    if (carpetaOcupada(actual, destino)) {
      throw new Error(`No se puede renombrar ${actual} a ${destino}: la carpeta de destino ya existe`);
    }
    renameSync(actual, destino);
    renombrados.push([actual, destino]);
  };

  try {
    // Primero los portfolios: los álbumes se renombran ya dentro de la carpeta nueva del suyo.
    for (const p of portfolios) {
      const normalizado = normalizarNombre(p.nombre);
      actualizarPortfolio.run(normalizado, p.id);
      renombrar(path.join(fotosDir, p.carpetaFotografo, p.carpeta), path.join(fotosDir, p.carpetaFotografo, normalizado));
    }
    for (const a of albumes) {
      const normalizado = normalizarNombre(a.nombre);
      const carpetaPortfolio = path.join(fotosDir, a.carpetaFotografo, normalizarNombre(a.nombrePortfolio));
      actualizarAlbum.run(normalizado, a.id);
      renombrar(path.join(carpetaPortfolio, a.carpeta), path.join(carpetaPortfolio, normalizado));
    }
    db.exec(INDICES_NOMBRE_NORMALIZADO);
  } catch (error) {
    for (const [actual, destino] of renombrados.reverse()) {
      renameSync(destino, actual);
    }
    throw error;
  }
  if (renombrados.length > 0) {
    console.log(`Esquema migrado a la versión 9: ${renombrados.length} carpetas renombradas a su nombre normalizado`);
  }
}

function migrar(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version >= VERSION_ESQUEMA) {
    return;
  }

  db.transaction(() => {
    if (version === 8) {
      migrarA9(db);
    } else if (version < 8) {
      // Esquemas anteriores a la versión 8 (solo existieron en desarrollo, antes de publicar
      // la base de datos): se descartan y el catálogo se vuelve a importar desde el JSON.
      db.exec(`
        DROP TABLE IF EXISTS album_tags;
        DROP TABLE IF EXISTS albumTags;
        DROP TABLE IF EXISTS fotos;
        DROP TABLE IF EXISTS albumes;
        DROP TABLE IF EXISTS portfolios;
        DROP TABLE IF EXISTS fotografos;
      `);
      db.exec(ESQUEMA);
    }
    db.pragma(`user_version = ${VERSION_ESQUEMA}`);
  })();
}

export function abrirBaseDatos(ruta = dbPath): Database.Database {
  mkdirSync(path.dirname(ruta), { recursive: true });
  const db = new Database(ruta);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Para buscar por un segmento de URL tal como llega, normalizándolo igual que al guardar. En
  // JavaScript y no con lower() de SQLite, que solo pasa a minúsculas letras ASCII ("Á" no).
  db.function('normalizarNombre', { deterministic: true }, (nombre: unknown) =>
    typeof nombre === 'string' ? normalizarNombre(nombre) : null,
  );
  migrar(db);
  return db;
}

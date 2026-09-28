import { existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { dbPath, fotosDir } from '../config/rutas.js';
import { carpetaOcupada } from '../utils/carpetas.js';
import { hashContrasenya } from '../utils/contrasenya.js';
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
//
// Usuarios: la cuenta con la que se entra en la aplicación (usuario, email y hash de la contraseña)
// está en usuarios, separada de los datos del fotógrafo. Cada fotógrafo tiene su usuario
// (fotografos.idUsuario, obligatorio y único). Así podrá haber usuarios que no sean fotógrafos
// (empresas, academias…) con sus propios portfolios: tendrán su propia tabla con otra referencia a
// usuarios. Borrar un usuario borra en cascada su fotógrafo (y con él sus portfolios).
// usuarios.usuario es interno (no se muestra ni sale en la API).
//
// Administrador (desde la versión 11): usuario especial "admin", gestor de la aplicación
// (usuarios.rol = 'administrador'; solo puede haber uno y no tiene fotógrafo). Se crea con la
// contraseña "admin", que se puede cambiar. Mientras su fechaUltimoAcceso esté vacía la aplicación
// está en su primer uso: la web pide sus credenciales y ofrece cambiar la contraseña.
//
// Sesiones (desde la versión 12): al iniciar sesión se crea una fila en sesiones con el hash de un
// token aleatorio, que el navegador guarda en una cookie HttpOnly (ver services/sesion.service.ts).
//
// Los ids son internos: no aparecen en la API ni en las URL.
//
// "orden" conserva el orden en que se muestran portfolios, álbumes y fotos. Los fotógrafos
// se listan por idFotografo (orden de alta).
//
// fechaCreacion y fechaModificacion (texto ISO 8601 en UTC) las mantiene la propia base de
// datos: la primera con un DEFAULT y la segunda con un trigger AFTER UPDATE por tabla.
//
// usuarios.email es opcional pero único (varios NULL están permitidos) y sin distinguir
// mayúsculas. usuarios.passwordHash guarda solo el hash de la contraseña (nunca el texto plano).
// Índices únicos de los nombres normalizados de portfolios y álbumes (desde la versión 9).
const INDICES_NOMBRE_NORMALIZADO = `
CREATE UNIQUE INDEX portfoliosNombreNormalizado ON portfolios(idFotografo, nombreNormalizado);
CREATE UNIQUE INDEX albumesNombreNormalizado ON albumes(idPortfolio, nombreNormalizado);`;

// Trigger que mantiene fechaModificacion. El WHEN evita pisar una fechaModificacion puesta a mano
// en el propio UPDATE.
const triggerFechaModificacion = (tabla: string, pk: string) => `
CREATE TRIGGER ${tabla}FechaModificacion AFTER UPDATE ON ${tabla}
WHEN NEW.fechaModificacion = OLD.fechaModificacion
BEGIN
  UPDATE ${tabla} SET fechaModificacion = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE ${pk} = NEW.${pk};
END;`;

// Usuarios y fotógrafos (desde la versión 10). Se reutilizan en la migración.
const TABLA_USUARIOS = `
CREATE TABLE usuarios (
  idUsuario     INTEGER PRIMARY KEY,
  usuario       TEXT NOT NULL UNIQUE,
  email         TEXT UNIQUE COLLATE NOCASE,
  passwordHash  TEXT,
  fechaCreacion      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fechaModificacion  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
${triggerFechaModificacion('usuarios', 'idUsuario')}`;

const TABLA_FOTOGRAFOS = `
CREATE TABLE fotografos (
  idFotografo                INTEGER PRIMARY KEY,
  idUsuario                  INTEGER NOT NULL UNIQUE REFERENCES usuarios(idUsuario) ON DELETE CASCADE,
  nombreInformal             TEXT NOT NULL,
  nombreInformalNormalizado  TEXT NOT NULL UNIQUE,
  nombre                     TEXT NOT NULL,
  primerApellido             TEXT NOT NULL,
  segundoApellido            TEXT,
  descripcion                TEXT NOT NULL,
  fechaCreacion      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fechaModificacion  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
${triggerFechaModificacion('fotografos', 'idFotografo')}`;

// Esquema de la versión 10. Una BD nueva se crea con él y después pasa por las mismas migraciones
// que una existente (ver migrar()), así el esquema completo no se mantiene escrito dos veces.
const ESQUEMA_10 = `
${TABLA_USUARIOS}
${TABLA_FOTOGRAFOS}

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
${triggerFechaModificacion('portfolios', 'idPortfolio')}
${triggerFechaModificacion('albumes', 'idAlbum')}
${triggerFechaModificacion('fotos', 'idFoto')}
`;

// Versión del esquema, guardada en PRAGMA user_version. Cada cambio de esquema posterior
// debe subirla y añadir su migración en migrar(), conservando los datos existentes.
const VERSION_ESQUEMA = 12;

// Credenciales iniciales del administrador (se pueden cambiar; ver services/usuario.service.ts).
export const ADMINISTRADOR = { usuario: 'admin', contrasenyaInicial: 'admin' } as const;

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

// Versión 9 -> 10: usuario, email y passwordHash salen de fotografos a la tabla nueva usuarios, y
// cada fotógrafo pasa a referenciar a su usuario (fotografos.idUsuario). Cada fotógrafo existente
// recibe un usuario con el mismo id. SQLite no permite quitar columnas UNIQUE, así que fotografos
// se reconstruye (con las claves foráneas desactivadas, ver migrar()) conservando ids y fechas.
function migrarA10(db: Database.Database): void {
  db.exec(`
    ${TABLA_USUARIOS}
    INSERT INTO usuarios (idUsuario, usuario, email, passwordHash, fechaCreacion, fechaModificacion)
      SELECT idFotografo, usuario, email, passwordHash, fechaCreacion, fechaModificacion FROM fotografos;

    ALTER TABLE fotografos RENAME TO fotografosAnterior;
    DROP TRIGGER fotografosFechaModificacion;
    ${TABLA_FOTOGRAFOS}
    INSERT INTO fotografos (idFotografo, idUsuario, nombreInformal, nombreInformalNormalizado, nombre,
        primerApellido, segundoApellido, descripcion, fechaCreacion, fechaModificacion)
      SELECT idFotografo, idFotografo, nombreInformal, nombreInformalNormalizado, nombre,
        primerApellido, segundoApellido, descripcion, fechaCreacion, fechaModificacion
      FROM fotografosAnterior;
    DROP TABLE fotografosAnterior;
  `);
}

// Versión 10 -> 11: usuarios gana rol ('usuario' o 'administrador', con un único administrador) y
// fechaUltimoAcceso, y se crea el administrador "admin" con su contraseña inicial y sin último
// acceso (primer uso pendiente). También se aplica a las BD nuevas.
function migrarA11(db: Database.Database): void {
  db.exec(`
    ALTER TABLE usuarios ADD COLUMN rol TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('usuario', 'administrador'));
    ALTER TABLE usuarios ADD COLUMN fechaUltimoAcceso TEXT;
    CREATE UNIQUE INDEX usuariosUnAdministrador ON usuarios(rol) WHERE rol = 'administrador';
  `);
  if (db.prepare('SELECT 1 FROM usuarios WHERE usuario = ?').get(ADMINISTRADOR.usuario)) {
    throw new Error(`No se puede crear el administrador: ya existe un usuario "${ADMINISTRADOR.usuario}"`);
  }
  db.prepare("INSERT INTO usuarios (usuario, passwordHash, rol) VALUES (?, ?, 'administrador')").run(
    ADMINISTRADOR.usuario,
    hashContrasenya(ADMINISTRADOR.contrasenyaInicial),
  );
}

// Versión 11 -> 12: sesiones iniciadas. Solo se guarda el hash del token (el token va en una cookie
// HttpOnly del navegador); borrar el usuario borra sus sesiones.
function migrarA12(db: Database.Database): void {
  db.exec(`
    CREATE TABLE sesiones (
      idSesion         INTEGER PRIMARY KEY,
      idUsuario        INTEGER NOT NULL REFERENCES usuarios(idUsuario) ON DELETE CASCADE,
      tokenHash        TEXT NOT NULL UNIQUE,
      fechaCreacion    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      fechaExpiracion  TEXT NOT NULL
    );
    CREATE INDEX sesionesPorUsuario ON sesiones(idUsuario);
  `);
}

function migrar(db: Database.Database): void {
  const inicial = db.pragma('user_version', { simple: true }) as number;
  if (inicial >= VERSION_ESQUEMA) {
    return;
  }

  // Reconstruir una tabla referenciada por otras (migrarA10) exige desactivar las claves foráneas,
  // y eso solo se puede hacer fuera de una transacción. Se comprueban antes de confirmar.
  // legacy_alter_table evita que renombrar fotografos a fotografosAnterior reescriba también las
  // referencias de portfolios (deben seguir apuntando a "fotografos", la tabla nueva).
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  try {
    db.transaction(() => {
      // Cada paso lleva la BD a la versión siguiente, en orden, hasta la actual.
      let version = inicial;
      if (version < 8) {
        // BD nueva, o de un esquema anterior a la versión 8 (solo existieron en desarrollo, antes
        // de publicar la base de datos, y se descartan): se crea con el esquema de la versión 10.
        db.exec(`
          DROP TABLE IF EXISTS album_tags;
          DROP TABLE IF EXISTS albumTags;
          DROP TABLE IF EXISTS fotos;
          DROP TABLE IF EXISTS albumes;
          DROP TABLE IF EXISTS portfolios;
          DROP TABLE IF EXISTS fotografos;
          DROP TABLE IF EXISTS usuarios;
        `);
        db.exec(ESQUEMA_10);
        version = 10;
      }
      if (version === 8) {
        migrarA9(db);
        version = 9;
      }
      if (version === 9) {
        migrarA10(db);
        version = 10;
      }
      if (version === 10) {
        migrarA11(db);
        version = 11;
      }
      if (version === 11) {
        migrarA12(db);
        version = 12;
      }
      if (version !== VERSION_ESQUEMA) {
        throw new Error(`No hay migración de la versión ${version} del esquema a la ${VERSION_ESQUEMA}`);
      }
      const incoherencias = db.pragma('foreign_key_check') as unknown[];
      if (incoherencias.length > 0) {
        throw new Error(`La migración deja ${incoherencias.length} claves foráneas incoherentes`);
      }
      db.pragma(`user_version = ${VERSION_ESQUEMA}`);
    })();
  } finally {
    db.pragma('legacy_alter_table = OFF');
    db.pragma('foreign_keys = ON');
  }
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

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { dbPath } from '../config/rutas.js';
import { hashContrasenya } from '../utils/contrasenya.js';
import { normalizarNombre } from '../utils/normalizar-nombre.js';

// Notación lowerCamelCase para tablas y columnas. Cada tabla tiene una clave primaria entera
// id<Entidad>; las claves foráneas se llaman igual que la clave primaria a la que apuntan.
//
// fotografos.nombreInformal ("Santi Estévez") es el texto del logo.
//
// Columnas normalizadas (ver utils/normalizar-nombre.ts): fotografos.nombreInformalNormalizado
// (de nombreInformal, "Santi Estévez" -> "santi-estevez"), portfolios.nombreNormalizado y
// colecciones.nombreNormalizado (de nombre, "Montaña" -> "montanya"). Son únicas (el fotógrafo en
// todo el catálogo, el portfolio dentro de su fotógrafo y la colección dentro de su portfolio) y
// son a la vez el identificador en las URL y el nombre de la carpeta: las fotos están en
// datos/fotos/<nombreInformalNormalizado>/<portfolio.nombreNormalizado>/<coleccion.nombreNormalizado>/.
// El nombreInformalNormalizado es además el nombre del logo en datos/logos. Las calcula la
// aplicación al guardar el nombre y nunca se editan a mano: si cambiaran sin renombrar la
// carpeta, las fotos dejarían de encontrarse.
//
// Usuarios: la cuenta con la que se entra en la aplicación (usuario, email y hash de la contraseña)
// está en usuarios, separada de los datos del fotógrafo. Cada fotógrafo tiene su usuario
// (fotografos.idUsuario, obligatorio y único). Así podrá haber usuarios que no sean fotógrafos
// (empresas, academias…) con sus propios portfolios: tendrán su propia tabla con otra referencia a
// usuarios. Borrar un usuario borra en cascada su fotógrafo (y con él sus portfolios) y sus
// sesiones. El nombre de usuario de los demás nunca sale en la API.
//
// Administrador: usuario especial "admin", gestor de la aplicación (usuarios.rol = 'administrador';
// solo puede haber uno y no tiene fotógrafo). Se crea con la BD, con la contraseña "admin", que se
// puede cambiar. Mientras su fechaUltimoAcceso esté vacía la aplicación está en su primer uso: la
// web pide sus credenciales y ofrece cambiar la contraseña.
//
// Sesiones: al iniciar sesión se crea una fila en sesiones con el hash de un token aleatorio, que
// el navegador guarda en una cookie HttpOnly (ver services/sesion.service.ts).
//
// Los ids son internos: no aparecen en la API ni en las URL.
//
// "orden" conserva el orden en que se muestran portfolios, colecciones y fotos. Los fotógrafos
// se listan por idFotografo (orden de alta).
//
// fechaCreacion y fechaModificacion (texto ISO 8601 en UTC) las mantiene la propia base de
// datos: la primera con un DEFAULT y la segunda con un trigger AFTER UPDATE por tabla.
//
// usuarios.email es opcional pero único (varios NULL están permitidos) y sin distinguir
// mayúsculas. usuarios.passwordHash guarda solo el hash de la contraseña (nunca el texto plano).

// Trigger que mantiene fechaModificacion. El WHEN evita pisar una fechaModificacion puesta a mano
// en el propio UPDATE.
const triggerFechaModificacion = (tabla: string, pk: string) => `
CREATE TRIGGER ${tabla}FechaModificacion AFTER UPDATE ON ${tabla}
WHEN NEW.fechaModificacion = OLD.fechaModificacion
BEGIN
  UPDATE ${tabla} SET fechaModificacion = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE ${pk} = NEW.${pk};
END;`;

const ESQUEMA = `
CREATE TABLE usuarios (
  idUsuario          INTEGER PRIMARY KEY,
  usuario            TEXT NOT NULL UNIQUE,
  email              TEXT UNIQUE COLLATE NOCASE,
  passwordHash       TEXT,
  rol                TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('usuario', 'administrador')),
  fechaUltimoAcceso  TEXT,
  -- Tema de la web que prefiere (Configuración); NULL = sin preferencia (el del navegador).
  temaPreferido      TEXT CHECK (temaPreferido IN ('oscuro', 'claro')),
  -- Cuándo se puso su foto de perfil (datos/avatares/u<idUsuario>.jpg); NULL = sin foto. Sirve
  -- también para que el navegador no muestre una versión antigua (va en la URL de la foto).
  fotoActualizada    TEXT,
  fechaCreacion      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fechaModificacion  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX usuariosUnAdministrador ON usuarios(rol) WHERE rol = 'administrador';

CREATE TABLE sesiones (
  idSesion         INTEGER PRIMARY KEY,
  idUsuario        INTEGER NOT NULL REFERENCES usuarios(idUsuario) ON DELETE CASCADE,
  tokenHash        TEXT NOT NULL UNIQUE,
  fechaCreacion    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fechaExpiracion  TEXT NOT NULL
);
CREATE INDEX sesionesPorUsuario ON sesiones(idUsuario);

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

CREATE TABLE portfolios (
  idPortfolio        INTEGER PRIMARY KEY,
  idFotografo        INTEGER NOT NULL REFERENCES fotografos(idFotografo) ON DELETE CASCADE,
  nombreNormalizado  TEXT NOT NULL,
  nombre             TEXT NOT NULL,
  descripcion        TEXT,
  -- Colección cuya portada es la del portfolio; NULL = la primera colección.
  idColeccionPortada INTEGER REFERENCES colecciones(idColeccion) ON DELETE SET NULL,
  orden              INTEGER NOT NULL,
  fechaCreacion      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fechaModificacion  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (idFotografo, nombre)
);
CREATE INDEX portfoliosPorFotografo ON portfolios(idFotografo, orden);
CREATE UNIQUE INDEX portfoliosNombreNormalizado ON portfolios(idFotografo, nombreNormalizado);

CREATE TABLE colecciones (
  idColeccion        INTEGER PRIMARY KEY,
  idPortfolio        INTEGER NOT NULL REFERENCES portfolios(idPortfolio) ON DELETE CASCADE,
  nombreNormalizado  TEXT NOT NULL,
  nombre             TEXT NOT NULL,
  descripcion        TEXT,
  idFotoPortada      INTEGER REFERENCES fotos(idFoto) ON DELETE SET NULL,
  orden              INTEGER NOT NULL,
  fechaCreacion      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fechaModificacion  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (idPortfolio, nombre)
);
CREATE INDEX coleccionesPorPortfolio ON colecciones(idPortfolio, orden);
CREATE UNIQUE INDEX coleccionesNombreNormalizado ON colecciones(idPortfolio, nombreNormalizado);

CREATE TABLE fotos (
  idFoto             INTEGER PRIMARY KEY,
  idColeccion        INTEGER NOT NULL REFERENCES colecciones(idColeccion) ON DELETE CASCADE,
  nombreFichero      TEXT NOT NULL,
  titulo             TEXT,
  orden              INTEGER NOT NULL,
  ancho              INTEGER,
  alto               INTEGER,
  fechaCreacion      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fechaModificacion  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (idColeccion, nombreFichero)
);
CREATE INDEX fotosPorColeccion ON fotos(idColeccion, orden);

CREATE TABLE coleccionTags (
  idColeccion  INTEGER NOT NULL REFERENCES colecciones(idColeccion) ON DELETE CASCADE,
  tag          TEXT NOT NULL,
  orden        INTEGER NOT NULL,
  PRIMARY KEY (idColeccion, tag)
);
CREATE INDEX coleccionTagsPorTag ON coleccionTags(tag);

${triggerFechaModificacion('usuarios', 'idUsuario')}
${triggerFechaModificacion('fotografos', 'idFotografo')}
${triggerFechaModificacion('portfolios', 'idPortfolio')}
${triggerFechaModificacion('colecciones', 'idColeccion')}
${triggerFechaModificacion('fotos', 'idFoto')}
`;

// Versión del esquema, guardada en PRAGMA user_version. Cada cambio de esquema sube esta versión y
// añade en MIGRACIONES la migración desde la anterior, que conserva los datos.
const VERSION_ESQUEMA = 16;

// Migraciones: la de la clave N lleva una BD de la versión N a la N + 1. Las BD anteriores a la 15
// (cuando la aplicación aún no se había publicado y el esquema se redefinía) no se pueden abrir.
const MIGRACIONES: Record<number, string> = {
  // 16: colección de portada de cada portfolio.
  15: 'ALTER TABLE portfolios ADD COLUMN idColeccionPortada INTEGER REFERENCES colecciones(idColeccion) ON DELETE SET NULL;',
};

// Credenciales iniciales del administrador (se pueden cambiar; ver services/administrador.service.ts).
export const ADMINISTRADOR = { usuario: 'admin', contrasenyaInicial: 'admin' } as const;

// Una BD nueva (vacía, versión 0) se crea con el esquema y el administrador, en su primer uso. Una
// BD de una versión anterior con migraciones se migra, en una transacción, hasta la actual. Otra BD
// no se toca: el backend no arranca, para no perder datos.
function crearOAbrir(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version === VERSION_ESQUEMA) {
    return;
  }
  if (version !== 0 && version < VERSION_ESQUEMA && MIGRACIONES[version] !== undefined) {
    db.transaction(() => {
      for (let v = version; v < VERSION_ESQUEMA; v++) {
        db.exec(MIGRACIONES[v]);
      }
      db.pragma(`user_version = ${VERSION_ESQUEMA}`);
    })();
    return;
  }
  if (version !== 0) {
    throw new Error(
      `La base de datos tiene la versión ${version} del esquema y la aplicación espera la ${VERSION_ESQUEMA}: no se puede abrir.`,
    );
  }
  db.transaction(() => {
    db.exec(ESQUEMA);
    db.prepare("INSERT INTO usuarios (usuario, passwordHash, rol) VALUES (?, ?, 'administrador')").run(
      ADMINISTRADOR.usuario,
      hashContrasenya(ADMINISTRADOR.contrasenyaInicial),
    );
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
  crearOAbrir(db);
  return db;
}

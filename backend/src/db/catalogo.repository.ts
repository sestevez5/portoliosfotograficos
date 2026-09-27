import { existsSync } from 'node:fs';
import path from 'node:path';
import { fotosDir, organizacionJsonPath } from '../config/rutas.js';
import { ReglaNegocioIncumplida, validadorCatalogo } from '../reglas/index.js';
import { abrirBaseDatos } from './conexion.js';
import { estaVacia, importarOrganizacion, leerOrganizacionJson } from './importar.js';

const db = abrirBaseDatos();

// Validador de reglas de negocio sobre esta conexión (ver reglas/validaciones.ts).
export const validar = validadorCatalogo(db);

// Primera ejecución (p. ej. al desplegar en el NAS): si la base de datos está vacía y existe
// el JSON del catálogo, se importa automáticamente.
// Si el JSON incumple alguna regla de negocio no se importa nada y el backend no arranca.
if (estaVacia(db) && existsSync(organizacionJsonPath)) {
  try {
    const totales = importarOrganizacion(db, leerOrganizacionJson(organizacionJsonPath));
    console.log(
      `Base de datos vacía: importado ${organizacionJsonPath} ` +
        `(${totales.fotografos} fotógrafos, ${totales.portfolios} portfolios, ${totales.albumes} álbumes, ${totales.fotos} fotos)`,
    );
  } catch (error) {
    if (error instanceof ReglaNegocioIncumplida) {
      console.error(`No se ha podido importar ${organizacionJsonPath}; no se ha importado nada.\n${error.aTexto()}`);
      process.exit(1);
    }
    throw error;
  }
}

// Nunca incluye email ni passwordHash: las consultas públicas no los leen.
export interface FotografoFila {
  idFotografo: number;
  usuario: string;
  nombreInformal: string;
  nombreInformalNormalizado: string;
  nombre: string;
  primerApellido: string;
  segundoApellido: string | null;
  descripcion: string;
}

export interface FotografoConTotales extends FotografoFila {
  portfolioCount: number;
  albumCount: number;
}

export interface PortfolioFila {
  idPortfolio: number;
  nombreNormalizado: string;
  nombre: string;
  descripcion: string | null;
}

export interface PortfolioConPortada extends PortfolioFila {
  albumCount: number;
  // Portada del primer álbum del portfolio (nombreNormalizado del álbum, que es su carpeta, + archivo)
  coverCarpetaAlbum: string | null;
  coverFilename: string | null;
}

// carpetaFotografo, carpetaPortfolio y nombreNormalizado (las carpetas) sirven para construir la
// ruta de las fotos.
export interface AlbumResumenFila {
  idAlbum: number;
  carpetaFotografo: string;
  nombreInformal: string;
  nombrePortfolio: string;
  carpetaPortfolio: string;
  nombreNormalizado: string;
  nombre: string;
  descripcion: string | null;
  tags: string[];
  coverFilename: string | null;
  photoCount: number;
}

export interface AlbumFila {
  idAlbum: number;
  carpetaFotografo: string;
  idPortfolio: number;
  nombrePortfolio: string;
  carpetaPortfolio: string;
  nombreNormalizado: string;
  nombre: string;
  descripcion: string | null;
  idFotoPortada: number | null;
  tags: string[];
}

export interface FotoFila {
  idFoto: number;
  nombreFichero: string;
  titulo: string | null;
  orden: number;
  ancho: number | null;
  alto: number | null;
}

// Nombre de archivo de la portada de un álbum: la foto idFotoPortada o, si no hay, la
// primera por orden. "a" es el alias de la tabla albumes en la consulta que lo usa.
const PORTADA_ALBUM = `COALESCE(
  (SELECT nombreFichero FROM fotos WHERE idFoto = a.idFotoPortada),
  (SELECT nombreFichero FROM fotos WHERE idAlbum = a.idAlbum ORDER BY orden LIMIT 1)
)`;

const TAGS_ALBUM = `(SELECT json_group_array(tag) FROM (SELECT tag FROM albumTags WHERE idAlbum = a.idAlbum ORDER BY orden))`;

const FOTOGRAFO_COLUMNAS = `f.idFotografo, f.usuario, f.nombreInformal, f.nombreInformalNormalizado, f.nombre,
  f.primerApellido, f.segundoApellido, f.descripcion`;

// En las URL, fotógrafos, portfolios y álbumes se identifican por su nombre normalizado
// ("Proyectos personales" -> "proyectos-personales"). El segmento que llega se normaliza con la
// función SQL normalizarNombre registrada en la conexión antes de compararlo con la columna, así
// que también se aceptan el nombre con espacios, tildes o mayúsculas.
const COMO_SEGMENTO = (expr: string) => `normalizarNombre(${expr})`;

// Álbum con su portfolio y fotógrafo (para construir rutas de fotos y filtrar).
const ALBUM_FROM = `
  FROM albumes a
  JOIN portfolios p ON p.idPortfolio = a.idPortfolio
  JOIN fotografos f ON f.idFotografo = p.idFotografo`;

const consultas = {
  fotografos: db.prepare(`
    SELECT ${FOTOGRAFO_COLUMNAS},
      (SELECT count(*) FROM portfolios p WHERE p.idFotografo = f.idFotografo) AS portfolioCount,
      (SELECT count(*) FROM albumes a JOIN portfolios p ON p.idPortfolio = a.idPortfolio
        WHERE p.idFotografo = f.idFotografo) AS albumCount
    FROM fotografos f
    ORDER BY f.idFotografo`),

  fotografo: db.prepare(
    `SELECT ${FOTOGRAFO_COLUMNAS} FROM fotografos f WHERE f.nombreInformalNormalizado = ${COMO_SEGMENTO('?')}`,
  ),

  portfoliosDeFotografo: db.prepare(`
    SELECT p.idPortfolio, p.nombreNormalizado, p.nombre, p.descripcion,
      (SELECT count(*) FROM albumes a WHERE a.idPortfolio = p.idPortfolio) AS albumCount,
      primero.nombreNormalizado AS coverCarpetaAlbum,
      (SELECT ${PORTADA_ALBUM} FROM albumes a WHERE a.idAlbum = primero.idAlbum) AS coverFilename
    FROM portfolios p
    JOIN fotografos f ON f.idFotografo = p.idFotografo
    LEFT JOIN albumes primero ON primero.idAlbum = (
      SELECT idAlbum FROM albumes WHERE idPortfolio = p.idPortfolio ORDER BY orden LIMIT 1
    )
    WHERE p.idFotografo = ?
    ORDER BY p.orden`),

  portfolio: db.prepare(`
    SELECT p.idPortfolio, p.nombreNormalizado, p.nombre, p.descripcion
    FROM portfolios p
    WHERE p.idFotografo = ? AND p.nombreNormalizado = ${COMO_SEGMENTO('?')}`),

  // Filtros opcionales: NULL en un parámetro desactiva ese filtro.
  albumes: db.prepare(`
    SELECT a.idAlbum, f.nombreInformalNormalizado AS carpetaFotografo, f.nombreInformal, p.nombre AS nombrePortfolio, p.nombreNormalizado AS carpetaPortfolio,
      a.nombreNormalizado, a.nombre, a.descripcion,
      ${TAGS_ALBUM} AS tags,
      ${PORTADA_ALBUM} AS coverFilename,
      (SELECT count(*) FROM fotos WHERE idAlbum = a.idAlbum) AS photoCount
    ${ALBUM_FROM}
    WHERE (@idPortfolio IS NULL OR a.idPortfolio = @idPortfolio)
      AND (@tag IS NULL OR EXISTS (SELECT 1 FROM albumTags t WHERE t.idAlbum = a.idAlbum AND t.tag = @tag))
    ORDER BY f.idFotografo, p.orden, a.orden`),

  album: db.prepare(`
    SELECT a.idAlbum, f.nombreInformalNormalizado AS carpetaFotografo, p.idPortfolio, p.nombre AS nombrePortfolio,
      p.nombreNormalizado AS carpetaPortfolio, a.nombreNormalizado, a.nombre, a.descripcion, a.idFotoPortada,
      ${TAGS_ALBUM} AS tags
    ${ALBUM_FROM}
    WHERE f.idFotografo = @idFotografo
      AND p.nombreNormalizado = ${COMO_SEGMENTO('@portfolio')}
      AND a.nombreNormalizado = ${COMO_SEGMENTO('@album')}`),

  fotosDeAlbum: db.prepare(`
    SELECT idFoto, nombreFichero, titulo, orden, ancho, alto
    FROM fotos WHERE idAlbum = ? ORDER BY orden`),

  tags: db.prepare(`SELECT DISTINCT tag FROM albumTags`),

  insertarFotografo: db.prepare(
    `INSERT INTO fotografos (usuario, nombreInformal, nombreInformalNormalizado, nombre, primerApellido,
       segundoApellido, email, passwordHash, descripcion)
     VALUES (@usuario, @nombreInformal, @nombreInformalNormalizado, @nombre, @primerApellido,
       @segundoApellido, @email, @passwordHash, @descripcion)`,
  ),

  usuarioExiste: db.prepare('SELECT 1 FROM fotografos WHERE usuario = ?'),

  // Para el formulario de edición: incluye el email, pero de la contraseña solo si existe.
  fotografoEdicion: db.prepare(
    `SELECT idFotografo, nombreInformal, nombreInformalNormalizado, nombre, primerApellido, segundoApellido,
       email, descripcion, passwordHash IS NOT NULL AS tieneContrasenya
     FROM fotografos WHERE nombreInformalNormalizado = ${COMO_SEGMENTO('?')}`,
  ),

  // passwordHash NULL = conservar la contraseña actual.
  actualizarFotografo: db.prepare(
    `UPDATE fotografos SET nombreInformal = @nombreInformal, nombreInformalNormalizado = @nombreInformalNormalizado,
       nombre = @nombre, primerApellido = @primerApellido, segundoApellido = @segundoApellido, email = @email,
       descripcion = @descripcion, passwordHash = COALESCE(@passwordHash, passwordHash)
     WHERE idFotografo = @idFotografo`,
  ),

  eliminarFotografo: db.prepare('DELETE FROM fotografos WHERE idFotografo = ?'),

  // Los portfolios nuevos van al final de los del fotógrafo.
  insertarPortfolio: db.prepare(
    `INSERT INTO portfolios (idFotografo, nombreNormalizado, nombre, descripcion, orden)
     VALUES (@idFotografo, @nombreNormalizado, @nombre, @descripcion,
       (SELECT COALESCE(max(orden) + 1, 0) FROM portfolios WHERE idFotografo = @idFotografo))`,
  ),

  actualizarPortfolio: db.prepare(
    `UPDATE portfolios SET nombre = @nombre, nombreNormalizado = @nombreNormalizado, descripcion = @descripcion
     WHERE idPortfolio = @id`,
  ),

  eliminarPortfolio: db.prepare('DELETE FROM portfolios WHERE idPortfolio = ?'),

  numeroAlbumes: db.prepare('SELECT count(*) AS n FROM albumes WHERE idPortfolio = ?'),

  // Los álbumes nuevos van al final de los del portfolio.
  insertarAlbum: db.prepare(
    `INSERT INTO albumes (idPortfolio, nombreNormalizado, nombre, descripcion, orden)
     VALUES (@idPortfolio, @nombreNormalizado, @nombre, @descripcion,
       (SELECT COALESCE(max(orden) + 1, 0) FROM albumes WHERE idPortfolio = @idPortfolio))`,
  ),

  actualizarAlbum: db.prepare(
    `UPDATE albumes SET nombre = @nombre, nombreNormalizado = @nombreNormalizado, descripcion = @descripcion
     WHERE idAlbum = @id`,
  ),

  borrarTagsAlbum: db.prepare('DELETE FROM albumTags WHERE idAlbum = ?'),

  insertarTagAlbum: db.prepare('INSERT INTO albumTags (idAlbum, tag, orden) VALUES (?, ?, ?)'),

  eliminarAlbum: db.prepare('DELETE FROM albumes WHERE idAlbum = ?'),

  numeroFotos: db.prepare('SELECT count(*) AS n FROM fotos WHERE idAlbum = ?'),

  numeroPortfolios: db.prepare('SELECT count(*) AS n FROM portfolios WHERE idFotografo = ?'),
};

function conTags<T extends { tags: string }>(fila: T): Omit<T, 'tags'> & { tags: string[] } {
  return { ...fila, tags: JSON.parse(fila.tags) as string[] };
}

export function listarFotografos(): FotografoConTotales[] {
  return consultas.fotografos.all() as FotografoConTotales[];
}

// segmento: el fotógrafo tal como viene en la URL; se normaliza y se compara con
// nombreInformalNormalizado (así también se acepta "Santi Estévez").
export function obtenerFotografo(segmento: string): FotografoFila | undefined {
  return consultas.fotografo.get(segmento) as FotografoFila | undefined;
}

export function listarPortfolios(idFotografo: number): PortfolioConPortada[] {
  return consultas.portfoliosDeFotografo.all(idFotografo) as PortfolioConPortada[];
}

// portfolio/album: el segmento tal como viene en la URL; se compara con su nombreNormalizado.
export function obtenerPortfolio(idFotografo: number, portfolio: string): PortfolioFila | undefined {
  return consultas.portfolio.get(idFotografo, portfolio) as PortfolioFila | undefined;
}

export function listarAlbumes(filtro: { idPortfolio?: number; tag?: string } = {}): AlbumResumenFila[] {
  const filas = consultas.albumes.all({
    idPortfolio: filtro.idPortfolio ?? null,
    tag: filtro.tag ?? null,
  }) as (Omit<AlbumResumenFila, 'tags'> & { tags: string })[];
  return filas.map(conTags);
}

// Un álbum se identifica por su nombreNormalizado dentro de su portfolio, y el portfolio por el
// suyo dentro del fotógrafo, ambos como vienen en la URL.
export function obtenerAlbum(idFotografo: number, portfolio: string, album: string): AlbumFila | undefined {
  const fila = consultas.album.get({ idFotografo, portfolio, album }) as
    | (Omit<AlbumFila, 'tags'> & { tags: string })
    | undefined;
  return fila && conTags(fila);
}

export function listarFotos(idAlbum: number): FotoFila[] {
  return consultas.fotosDeAlbum.all(idAlbum) as FotoFila[];
}

export function listarTags(): string[] {
  return (consultas.tags.all() as { tag: string }[]).map((f) => f.tag);
}

// La carpeta de fotos de cada fotógrafo debe llamarse como su nombreInformalNormalizado. Al
// arrancar solo se avisa (no se corrige nada automáticamente).
for (const { nombreInformal, nombreInformalNormalizado } of listarFotografos()) {
  if (!existsSync(path.join(fotosDir, nombreInformalNormalizado))) {
    console.warn(`Aviso: falta la carpeta datos/fotos/${nombreInformalNormalizado} de '${nombreInformal}'`);
  }
}

// Ejecuta fn en una transacción: si lanza una excepción, se deshacen sus cambios en la BD.
export function enTransaccion<T>(fn: () => T): T {
  return db.transaction(fn)();
}

export interface NuevoFotografo {
  usuario: string;
  nombreInformal: string;
  nombreInformalNormalizado: string;
  nombre: string;
  primerApellido: string;
  segundoApellido: string | null;
  email: string | null;
  passwordHash: string | null;
  descripcion: string;
}

// Solo para crearFotografo() (services/fotografo.service.ts), que valida antes las reglas de
// negocio y crea la carpeta del fotógrafo en la misma transacción.
export function insertarFotografo(fotografo: NuevoFotografo): number {
  return Number(consultas.insertarFotografo.run(fotografo).lastInsertRowid);
}

export function usuarioExiste(usuario: string): boolean {
  return consultas.usuarioExiste.get(usuario) !== undefined;
}

export interface FotografoEdicion {
  idFotografo: number;
  nombreInformal: string;
  nombreInformalNormalizado: string;
  nombre: string;
  primerApellido: string;
  segundoApellido: string | null;
  email: string | null;
  descripcion: string;
  tieneContrasenya: boolean;
}

export function obtenerFotografoEdicion(segmento: string): FotografoEdicion | undefined {
  const fila = consultas.fotografoEdicion.get(segmento) as (Omit<FotografoEdicion, 'tieneContrasenya'> & { tieneContrasenya: number }) | undefined;
  return fila && { ...fila, tieneContrasenya: fila.tieneContrasenya === 1 };
}

export interface DatosActualizacionFotografo {
  nombreInformal: string;
  nombreInformalNormalizado: string;
  nombre: string;
  primerApellido: string;
  segundoApellido: string | null;
  email: string | null;
  descripcion: string;
  // null = conservar la contraseña actual
  passwordHash: string | null;
}

// Solo para editarFotografo()/eliminarFotografo() (services/fotografo.service.ts), que validan
// las reglas de negocio y mantienen la carpeta del fotógrafo en la misma transacción.
export function actualizarFotografo(idFotografo: number, datos: DatosActualizacionFotografo): void {
  consultas.actualizarFotografo.run({ ...datos, idFotografo });
}

export function eliminarFotografo(idFotografo: number): void {
  consultas.eliminarFotografo.run(idFotografo);
}

export function numeroPortfolios(idFotografo: number): number {
  return (consultas.numeroPortfolios.get(idFotografo) as { n: number }).n;
}

export interface DatosPortfolio {
  nombre: string;
  nombreNormalizado: string;
  descripcion: string | null;
}

// Solo para services/portfolio.service.ts, que valida las reglas de negocio y crea, renombra o
// elimina la carpeta del portfolio en la misma transacción.
export function insertarPortfolio(idFotografo: number, datos: DatosPortfolio): number {
  return Number(consultas.insertarPortfolio.run({ ...datos, idFotografo }).lastInsertRowid);
}

export function actualizarPortfolio(idPortfolio: number, datos: DatosPortfolio): void {
  consultas.actualizarPortfolio.run({ ...datos, id: idPortfolio });
}

export function eliminarPortfolio(idPortfolio: number): void {
  consultas.eliminarPortfolio.run(idPortfolio);
}

export function numeroAlbumes(idPortfolio: number): number {
  return (consultas.numeroAlbumes.get(idPortfolio) as { n: number }).n;
}

export interface DatosAlbum {
  nombre: string;
  nombreNormalizado: string;
  descripcion: string | null;
  tags: string[];
}

function guardarTags(idAlbum: number, tags: string[]): void {
  consultas.borrarTagsAlbum.run(idAlbum);
  tags.forEach((tag, i) => consultas.insertarTagAlbum.run(idAlbum, tag, i));
}

// Solo para services/album.service.ts, que valida las reglas de negocio y crea, renombra o elimina
// la carpeta del álbum en la misma transacción. Deben llamarse dentro de enTransaccion (los tags
// se guardan aparte del álbum).
export function insertarAlbum(idPortfolio: number, { tags, ...datos }: DatosAlbum): number {
  const idAlbum = Number(consultas.insertarAlbum.run({ ...datos, idPortfolio }).lastInsertRowid);
  guardarTags(idAlbum, tags);
  return idAlbum;
}

export function actualizarAlbum(idAlbum: number, { tags, ...datos }: DatosAlbum): void {
  consultas.actualizarAlbum.run({ ...datos, id: idAlbum });
  guardarTags(idAlbum, tags);
}

export function eliminarAlbum(idAlbum: number): void {
  consultas.eliminarAlbum.run(idAlbum);
}

export function numeroFotos(idAlbum: number): number {
  return (consultas.numeroFotos.get(idAlbum) as { n: number }).n;
}

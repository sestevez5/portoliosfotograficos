import { existsSync } from 'node:fs';
import path from 'node:path';
import { fotosDir } from '../config/rutas.js';
import { validadorCatalogo } from '../reglas/index.js';
import { abrirBaseDatos } from './conexion.js';

const db = abrirBaseDatos();

// Validador de reglas de negocio sobre esta conexión (ver reglas/validaciones.ts).
export const validar = validadorCatalogo(db);

// Datos del fotógrafo. Su cuenta (usuario, email, passwordHash) está en usuarios y las consultas
// públicas no la leen.
export interface FotografoFila {
  idFotografo: number;
  idUsuario: number;
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

const FOTOGRAFO_COLUMNAS = `f.idFotografo, f.idUsuario, f.nombreInformal, f.nombreInformalNormalizado, f.nombre,
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

  insertarUsuario: db.prepare(
    'INSERT INTO usuarios (usuario, email, passwordHash) VALUES (@usuario, @email, @passwordHash)',
  ),

  // passwordHash NULL = conservar la contraseña actual.
  actualizarUsuario: db.prepare(
    `UPDATE usuarios SET email = @email, passwordHash = COALESCE(@passwordHash, passwordHash)
     WHERE idUsuario = @idUsuario`,
  ),

  // Borra también su fotógrafo (y con él sus portfolios, álbumes y fotos) en cascada.
  eliminarUsuario: db.prepare('DELETE FROM usuarios WHERE idUsuario = ?'),

  usuarioExiste: db.prepare('SELECT 1 FROM usuarios WHERE usuario = ?'),

  administrador: db.prepare(
    "SELECT idUsuario, usuario, passwordHash, fechaUltimoAcceso FROM usuarios WHERE rol = 'administrador'",
  ),

  cambiarContrasenya: db.prepare('UPDATE usuarios SET passwordHash = @passwordHash WHERE idUsuario = @idUsuario'),

  // Para iniciar sesión con el nombre de usuario o con el correo (sin distinguir mayúsculas).
  usuarioPorUsuario: db.prepare('SELECT idUsuario, passwordHash FROM usuarios WHERE usuario = ?'),
  usuarioPorEmail: db.prepare('SELECT idUsuario, passwordHash FROM usuarios WHERE email = ?'),

  // Lo que se muestra del usuario con la sesión iniciada (con su fotógrafo, si lo tiene).
  usuarioSesion: db.prepare(
    `SELECT u.idUsuario, u.usuario, u.rol, f.nombreInformal, f.nombreInformalNormalizado
     FROM usuarios u LEFT JOIN fotografos f ON f.idUsuario = u.idUsuario
     WHERE u.idUsuario = ?`,
  ),

  insertarSesion: db.prepare(
    'INSERT INTO sesiones (idUsuario, tokenHash, fechaExpiracion) VALUES (@idUsuario, @tokenHash, @fechaExpiracion)',
  ),
  sesionVigente: db.prepare(
    "SELECT idUsuario FROM sesiones WHERE tokenHash = ? AND fechaExpiracion > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
  ),
  eliminarSesion: db.prepare('DELETE FROM sesiones WHERE tokenHash = ?'),
  eliminarSesionesCaducadas: db.prepare(
    "DELETE FROM sesiones WHERE fechaExpiracion <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
  ),

  registrarAcceso: db.prepare(
    "UPDATE usuarios SET fechaUltimoAcceso = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE idUsuario = ?",
  ),

  insertarFotografo: db.prepare(
    `INSERT INTO fotografos (idUsuario, nombreInformal, nombreInformalNormalizado, nombre, primerApellido,
       segundoApellido, descripcion)
     VALUES (@idUsuario, @nombreInformal, @nombreInformalNormalizado, @nombre, @primerApellido,
       @segundoApellido, @descripcion)`,
  ),

  // Para el formulario de edición: datos del fotógrafo y, de su usuario, el email y si tiene
  // contraseña (nunca el hash).
  fotografoEdicion: db.prepare(
    `SELECT f.idFotografo, f.idUsuario, f.nombreInformal, f.nombreInformalNormalizado, f.nombre, f.primerApellido,
       f.segundoApellido, u.email, f.descripcion, u.passwordHash IS NOT NULL AS tieneContrasenya
     FROM fotografos f JOIN usuarios u ON u.idUsuario = f.idUsuario
     WHERE f.nombreInformalNormalizado = ${COMO_SEGMENTO('?')}`,
  ),

  actualizarFotografo: db.prepare(
    `UPDATE fotografos SET nombreInformal = @nombreInformal, nombreInformalNormalizado = @nombreInformalNormalizado,
       nombre = @nombre, primerApellido = @primerApellido, segundoApellido = @segundoApellido,
       descripcion = @descripcion
     WHERE idFotografo = @idFotografo`,
  ),

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

// ---------------- Usuarios ----------------
// Solo para services/fotografo.service.ts, que valida antes las reglas de negocio y crea o elimina
// el usuario junto con su fotógrafo en la misma transacción.

export interface NuevoUsuario {
  usuario: string;
  email: string | null;
  passwordHash: string | null;
}

export function insertarUsuario(usuario: NuevoUsuario): number {
  return Number(consultas.insertarUsuario.run(usuario).lastInsertRowid);
}

// passwordHash null = conservar la contraseña actual.
export function actualizarUsuario(idUsuario: number, datos: { email: string | null; passwordHash: string | null }): void {
  consultas.actualizarUsuario.run({ ...datos, idUsuario });
}

// Borra en cascada su fotógrafo, con sus portfolios, álbumes y fotos.
export function eliminarUsuario(idUsuario: number): void {
  consultas.eliminarUsuario.run(idUsuario);
}

export function usuarioExiste(usuario: string): boolean {
  return consultas.usuarioExiste.get(usuario) !== undefined;
}

// El administrador de la aplicación (siempre existe: lo crea la migración a la versión 11). Solo
// para services/administrador.service.ts, que nunca devuelve el hash.
export interface AdministradorFila {
  idUsuario: number;
  usuario: string;
  passwordHash: string;
  // null = todavía no ha entrado nunca (primer uso pendiente)
  fechaUltimoAcceso: string | null;
}

export function obtenerAdministrador(): AdministradorFila {
  return consultas.administrador.get() as AdministradorFila;
}

export function cambiarContrasenya(idUsuario: number, passwordHash: string): void {
  consultas.cambiarContrasenya.run({ idUsuario, passwordHash });
}

export function registrarAcceso(idUsuario: number): void {
  consultas.registrarAcceso.run(idUsuario);
}

// ---------------- Sesiones ----------------
// Solo para services/sesion.service.ts. Se guarda el hash del token, nunca el token.

// identificador: nombre de usuario o correo (si contiene "@").
export function usuarioParaIniciarSesion(identificador: string): { idUsuario: number; passwordHash: string | null } | undefined {
  const consulta = identificador.includes('@') ? consultas.usuarioPorEmail : consultas.usuarioPorUsuario;
  return consulta.get(identificador) as { idUsuario: number; passwordHash: string | null } | undefined;
}

export interface UsuarioSesionFila {
  idUsuario: number;
  usuario: string;
  rol: 'usuario' | 'administrador';
  // null si el usuario no es fotógrafo (p. ej. el administrador)
  nombreInformal: string | null;
  nombreInformalNormalizado: string | null;
}

export function obtenerUsuarioSesion(idUsuario: number): UsuarioSesionFila | undefined {
  return consultas.usuarioSesion.get(idUsuario) as UsuarioSesionFila | undefined;
}

export function insertarSesion(idUsuario: number, tokenHash: string, fechaExpiracion: string): void {
  consultas.eliminarSesionesCaducadas.run();
  consultas.insertarSesion.run({ idUsuario, tokenHash, fechaExpiracion });
}

export function idUsuarioDeSesion(tokenHash: string): number | undefined {
  return (consultas.sesionVigente.get(tokenHash) as { idUsuario: number } | undefined)?.idUsuario;
}

export function eliminarSesion(tokenHash: string): void {
  consultas.eliminarSesion.run(tokenHash);
}

// ---------------- Fotógrafos ----------------

export interface NuevoFotografo {
  idUsuario: number;
  nombreInformal: string;
  nombreInformalNormalizado: string;
  nombre: string;
  primerApellido: string;
  segundoApellido: string | null;
  descripcion: string;
}

// Solo para crearFotografo() (services/fotografo.service.ts), que valida antes las reglas de
// negocio y crea el usuario y la carpeta del fotógrafo en la misma transacción.
export function insertarFotografo(fotografo: NuevoFotografo): number {
  return Number(consultas.insertarFotografo.run(fotografo).lastInsertRowid);
}

// Incluye, de su usuario, el email y si tiene contraseña.
export interface FotografoEdicion {
  idFotografo: number;
  idUsuario: number;
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
  descripcion: string;
}

// Solo para editarFotografo() (services/fotografo.service.ts), que valida las reglas de negocio y
// mantiene la carpeta del fotógrafo en la misma transacción. Los datos de su cuenta se guardan con
// actualizarUsuario(). Para eliminar un fotógrafo se elimina su usuario (eliminarUsuario).
export function actualizarFotografo(idFotografo: number, datos: DatosActualizacionFotografo): void {
  consultas.actualizarFotografo.run({ ...datos, idFotografo });
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

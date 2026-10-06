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
  collectionCount: number;
}

export interface PortfolioFila {
  idPortfolio: number;
  nombreNormalizado: string;
  nombre: string;
  descripcion: string | null;
  idColeccionPortada: number | null;
  // 0 = oculto a los demás usuarios
  visible: number;
  // nombreNormalizado de la colección de portada (idColeccionPortada), o null si no hay.
  coleccionPortada: string | null;
}

export interface PortfolioConPortada extends PortfolioFila {
  collectionCount: number;
  // Portada de la colección de portada del portfolio o, si no hay, de la primera (nombreNormalizado
  // de la colección, que es su carpeta, + archivo).
  coverCarpetaColeccion: string | null;
  coverFilename: string | null;
}

// carpetaFotografo, carpetaPortfolio y nombreNormalizado (las carpetas) sirven para construir la
// ruta de las fotos.
export interface ColeccionResumenFila {
  idColeccion: number;
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
  visible: number;
}

export interface ColeccionFila {
  idColeccion: number;
  carpetaFotografo: string;
  idPortfolio: number;
  nombrePortfolio: string;
  carpetaPortfolio: string;
  nombreNormalizado: string;
  nombre: string;
  descripcion: string | null;
  idFotoPortada: number | null;
  // 0 = oculta a los demás usuarios (la colección; si lo está su portfolio, portfolioVisible = 0)
  visible: number;
  portfolioVisible: number;
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

// Nombre de archivo de la portada de una colección: la foto idFotoPortada o, si no hay, la
// primera por orden. "a" es el alias de la tabla colecciones en la consulta que lo usa.
const PORTADA_COLECCION = `COALESCE(
  (SELECT nombreFichero FROM fotos WHERE idFoto = a.idFotoPortada),
  (SELECT nombreFichero FROM fotos WHERE idColeccion = a.idColeccion ORDER BY orden LIMIT 1)
)`;

// nombreNormalizado de la colección de portada de un portfolio ("p"), si la tiene elegida.
const COLECCION_PORTADA = `(SELECT nombreNormalizado FROM colecciones WHERE idColeccion = p.idColeccionPortada)`;

const TAGS_COLECCION = `(SELECT json_group_array(tag) FROM (SELECT tag FROM coleccionTags WHERE idColeccion = a.idColeccion ORDER BY orden))`;

const FOTOGRAFO_COLUMNAS = `f.idFotografo, f.idUsuario, f.nombreInformal, f.nombreInformalNormalizado, f.nombre,
  f.primerApellido, f.segundoApellido, f.descripcion`;

// En las URL, fotógrafos, portfolios y colecciones se identifican por su nombre normalizado
// ("Proyectos personales" -> "proyectos-personales"). El segmento que llega se normaliza con la
// función SQL normalizarNombre registrada en la conexión antes de compararlo con la columna, así
// que también se aceptan el nombre con espacios, tildes o mayúsculas.
const COMO_SEGMENTO = (expr: string) => `normalizarNombre(${expr})`;

// Colección con su portfolio y fotógrafo (para construir rutas de fotos y filtrar).
const COLECCION_FROM = `
  FROM colecciones a
  JOIN portfolios p ON p.idPortfolio = a.idPortfolio
  JOIN fotografos f ON f.idFotografo = p.idFotografo`;

// Visibilidad: un portfolio o una colección ocultos (visible = 0) solo los ven su fotógrafo y el
// administrador; para los demás es como si no existieran (ni en los listados, ni en los totales, ni
// como portada). Un portfolio oculto oculta todas sus colecciones. Las consultas de lectura reciben
// en @ve quién mira: VER_TODO (el administrador, y los servicios, que ya han comprobado el
// permiso), el nombreInformalNormalizado de un fotógrafo (ve también lo oculto suyo) o null (solo
// lo visible). "f", "p" y "a" son los alias de fotografos, portfolios y colecciones.
export type Vista = string | null;
export const VER_TODO = '';
const VE_LO_OCULTO = `(@ve = '' OR f.nombreInformalNormalizado = @ve)`;
const PORTFOLIO_VISIBLE = `(p.visible = 1 OR ${VE_LO_OCULTO})`;
const COLECCION_VISIBLE = `(a.visible = 1 OR ${VE_LO_OCULTO})`;

const consultas = {
  fotografos: db.prepare(`
    SELECT ${FOTOGRAFO_COLUMNAS},
      (SELECT count(*) FROM portfolios p WHERE p.idFotografo = f.idFotografo AND ${PORTFOLIO_VISIBLE}) AS portfolioCount,
      (SELECT count(*) FROM colecciones a JOIN portfolios p ON p.idPortfolio = a.idPortfolio
        WHERE p.idFotografo = f.idFotografo AND ${PORTFOLIO_VISIBLE} AND ${COLECCION_VISIBLE}) AS collectionCount
    FROM fotografos f
    ORDER BY f.idFotografo`),

  fotografo: db.prepare(
    `SELECT ${FOTOGRAFO_COLUMNAS} FROM fotografos f WHERE f.nombreInformalNormalizado = ${COMO_SEGMENTO('?')}`,
  ),

  // La portada es la de la colección de portada o, si no hay (o quien mira no la ve), la de la
  // primera colección que ve.
  portfoliosDeFotografo: db.prepare(`
    SELECT p.idPortfolio, p.nombreNormalizado, p.nombre, p.descripcion, p.idColeccionPortada, p.visible, ${COLECCION_PORTADA} AS coleccionPortada,
      (SELECT count(*) FROM colecciones a WHERE a.idPortfolio = p.idPortfolio AND ${COLECCION_VISIBLE}) AS collectionCount,
      primero.nombreNormalizado AS coverCarpetaColeccion,
      (SELECT ${PORTADA_COLECCION} FROM colecciones a WHERE a.idColeccion = primero.idColeccion) AS coverFilename
    FROM portfolios p
    JOIN fotografos f ON f.idFotografo = p.idFotografo
    LEFT JOIN colecciones primero ON primero.idColeccion = COALESCE(
      (SELECT a.idColeccion FROM colecciones a WHERE a.idColeccion = p.idColeccionPortada AND ${COLECCION_VISIBLE}),
      (SELECT a.idColeccion FROM colecciones a WHERE a.idPortfolio = p.idPortfolio AND ${COLECCION_VISIBLE} ORDER BY a.orden LIMIT 1)
    )
    WHERE p.idFotografo = @idFotografo AND ${PORTFOLIO_VISIBLE}
    ORDER BY p.orden`),

  portfolio: db.prepare(`
    SELECT p.idPortfolio, p.nombreNormalizado, p.nombre, p.descripcion, p.idColeccionPortada, p.visible, ${COLECCION_PORTADA} AS coleccionPortada
    FROM portfolios p
    JOIN fotografos f ON f.idFotografo = p.idFotografo
    WHERE p.idFotografo = @idFotografo AND p.nombreNormalizado = ${COMO_SEGMENTO('@portfolio')} AND ${PORTFOLIO_VISIBLE}`),

  // Filtros opcionales: NULL en un parámetro desactiva ese filtro.
  colecciones: db.prepare(`
    SELECT a.idColeccion, f.nombreInformalNormalizado AS carpetaFotografo, f.nombreInformal, p.nombre AS nombrePortfolio, p.nombreNormalizado AS carpetaPortfolio,
      a.nombreNormalizado, a.nombre, a.descripcion, a.visible,
      ${TAGS_COLECCION} AS tags,
      ${PORTADA_COLECCION} AS coverFilename,
      (SELECT count(*) FROM fotos WHERE idColeccion = a.idColeccion) AS photoCount
    ${COLECCION_FROM}
    WHERE (@idPortfolio IS NULL OR a.idPortfolio = @idPortfolio)
      AND (@tag IS NULL OR EXISTS (SELECT 1 FROM coleccionTags t WHERE t.idColeccion = a.idColeccion AND t.tag = @tag))
      AND ${PORTFOLIO_VISIBLE} AND ${COLECCION_VISIBLE}
    ORDER BY f.idFotografo, p.orden, a.orden`),

  coleccion: db.prepare(`
    SELECT a.idColeccion, f.nombreInformalNormalizado AS carpetaFotografo, p.idPortfolio, p.nombre AS nombrePortfolio,
      p.nombreNormalizado AS carpetaPortfolio, a.nombreNormalizado, a.nombre, a.descripcion, a.idFotoPortada,
      a.visible, p.visible AS portfolioVisible,
      ${TAGS_COLECCION} AS tags
    ${COLECCION_FROM}
    WHERE f.idFotografo = @idFotografo
      AND p.nombreNormalizado = ${COMO_SEGMENTO('@portfolio')}
      AND a.nombreNormalizado = ${COMO_SEGMENTO('@coleccion')}
      AND ${PORTFOLIO_VISIBLE} AND ${COLECCION_VISIBLE}`),

  fotosDeColeccion: db.prepare(`
    SELECT idFoto, nombreFichero, titulo, orden, ancho, alto
    FROM fotos WHERE idColeccion = ? ORDER BY orden`),

  tags: db.prepare(`
    SELECT DISTINCT t.tag FROM coleccionTags t JOIN colecciones a ON a.idColeccion = t.idColeccion
      JOIN portfolios p ON p.idPortfolio = a.idPortfolio
      JOIN fotografos f ON f.idFotografo = p.idFotografo
    WHERE ${PORTFOLIO_VISIBLE} AND ${COLECCION_VISIBLE}`),

  cambiarVisibilidadPortfolio: db.prepare('UPDATE portfolios SET visible = @visible WHERE idPortfolio = @idPortfolio'),

  cambiarVisibilidadColeccion: db.prepare('UPDATE colecciones SET visible = @visible WHERE idColeccion = @idColeccion'),

  insertarUsuario: db.prepare(
    'INSERT INTO usuarios (usuario, email, passwordHash) VALUES (@usuario, @email, @passwordHash)',
  ),

  // passwordHash NULL = conservar la contraseña actual.
  actualizarUsuario: db.prepare(
    `UPDATE usuarios SET email = @email, passwordHash = COALESCE(@passwordHash, passwordHash)
     WHERE idUsuario = @idUsuario`,
  ),

  // Borra también su fotógrafo (y con él sus portfolios, colecciones y fotos) en cascada.
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
    `SELECT u.idUsuario, u.usuario, u.email, u.rol, u.temaPreferido, u.fotoActualizada, f.nombreInformal, f.nombreInformalNormalizado
     FROM usuarios u LEFT JOIN fotografos f ON f.idUsuario = u.idUsuario
     WHERE u.idUsuario = ?`,
  ),

  // "Mi perfil": todo lo del usuario y, si lo es, de su fotógrafo (con sus totales). Nunca el hash.
  perfil: db.prepare(
    `SELECT u.idUsuario, u.usuario, u.email, u.rol, u.temaPreferido, u.fotoActualizada, u.fechaCreacion, u.fechaUltimoAcceso,
       u.passwordHash IS NOT NULL AS tieneContrasenya,
       f.idFotografo, f.nombreInformal, f.nombreInformalNormalizado, f.nombre, f.primerApellido,
       f.segundoApellido, f.descripcion,
       (SELECT count(*) FROM portfolios p WHERE p.idFotografo = f.idFotografo) AS portfolioCount,
       (SELECT count(*) FROM colecciones c JOIN portfolios p ON p.idPortfolio = c.idPortfolio
         WHERE p.idFotografo = f.idFotografo) AS collectionCount
     FROM usuarios u LEFT JOIN fotografos f ON f.idUsuario = u.idUsuario
     WHERE u.idUsuario = ?`,
  ),

  guardarTemaPreferido: db.prepare('UPDATE usuarios SET temaPreferido = @tema WHERE idUsuario = @idUsuario'),

  // fecha null = sin foto de perfil.
  guardarFotoActualizada: db.prepare('UPDATE usuarios SET fotoActualizada = @fecha WHERE idUsuario = @idUsuario'),

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
       f.segundoApellido, u.email, f.descripcion, u.passwordHash IS NOT NULL AS tieneContrasenya, u.fotoActualizada
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

  cambiarOrdenPortfolio: db.prepare('UPDATE portfolios SET orden = @orden WHERE idPortfolio = @idPortfolio'),

  numeroColecciones: db.prepare('SELECT count(*) AS n FROM colecciones WHERE idPortfolio = ?'),

  // Las colecciones nuevas van al final de las del portfolio.
  insertarColeccion: db.prepare(
    `INSERT INTO colecciones (idPortfolio, nombreNormalizado, nombre, descripcion, orden)
     VALUES (@idPortfolio, @nombreNormalizado, @nombre, @descripcion,
       (SELECT COALESCE(max(orden) + 1, 0) FROM colecciones WHERE idPortfolio = @idPortfolio))`,
  ),

  actualizarColeccion: db.prepare(
    `UPDATE colecciones SET nombre = @nombre, nombreNormalizado = @nombreNormalizado, descripcion = @descripcion
     WHERE idColeccion = @id`,
  ),

  cambiarFotoPortada: db.prepare('UPDATE colecciones SET idFotoPortada = @idFoto WHERE idColeccion = @idColeccion'),

  cambiarColeccionPortada: db.prepare('UPDATE portfolios SET idColeccionPortada = @idColeccion WHERE idPortfolio = @idPortfolio'),

  cambiarOrdenColeccion: db.prepare('UPDATE colecciones SET orden = @orden WHERE idColeccion = @idColeccion'),

  borrarTagsColeccion: db.prepare('DELETE FROM coleccionTags WHERE idColeccion = ?'),

  insertarTagColeccion: db.prepare('INSERT INTO coleccionTags (idColeccion, tag, orden) VALUES (?, ?, ?)'),

  eliminarColeccion: db.prepare('DELETE FROM colecciones WHERE idColeccion = ?'),

  numeroFotos: db.prepare('SELECT count(*) AS n FROM fotos WHERE idColeccion = ?'),

  // Las fotos nuevas van al final de las dla colección.
  insertarFoto: db.prepare(
    `INSERT INTO fotos (idColeccion, nombreFichero, orden, ancho, alto)
     VALUES (@idColeccion, @nombreFichero,
       (SELECT COALESCE(max(orden) + 1, 0) FROM fotos WHERE idColeccion = @idColeccion), @ancho, @alto)`,
  ),

  foto: db.prepare(
    'SELECT idFoto, nombreFichero, titulo, orden, ancho, alto FROM fotos WHERE idColeccion = ? AND nombreFichero = ?',
  ),

  cambiarOrdenFoto: db.prepare('UPDATE fotos SET orden = @orden WHERE idFoto = @idFoto'),

  cambiarTituloFoto: db.prepare('UPDATE fotos SET titulo = @titulo WHERE idFoto = @idFoto'),

  // Si era la portada dla colección, idFotoPortada queda a NULL (ON DELETE SET NULL).
  eliminarFoto: db.prepare('DELETE FROM fotos WHERE idFoto = ?'),

  numeroPortfolios: db.prepare('SELECT count(*) AS n FROM portfolios WHERE idFotografo = ?'),
};

function conTags<T extends { tags: string }>(fila: T): Omit<T, 'tags'> & { tags: string[] } {
  return { ...fila, tags: JSON.parse(fila.tags) as string[] };
}

// ve: quién mira (ver "Visibilidad"). Por defecto, todo: es lo que necesitan los servicios, que
// modifican el catálogo con el permiso ya comprobado. Las rutas de consulta pasan siempre la suya.
export function listarFotografos(ve: Vista = VER_TODO): FotografoConTotales[] {
  return consultas.fotografos.all({ ve }) as FotografoConTotales[];
}

// segmento: el fotógrafo tal como viene en la URL; se normaliza y se compara con
// nombreInformalNormalizado (así también se acepta "Santi Estévez").
export function obtenerFotografo(segmento: string): FotografoFila | undefined {
  return consultas.fotografo.get(segmento) as FotografoFila | undefined;
}

export function listarPortfolios(idFotografo: number, ve: Vista = VER_TODO): PortfolioConPortada[] {
  return consultas.portfoliosDeFotografo.all({ idFotografo, ve }) as PortfolioConPortada[];
}

// portfolio/coleccion: el segmento tal como viene en la URL; se compara con su nombreNormalizado.
export function obtenerPortfolio(idFotografo: number, portfolio: string, ve: Vista = VER_TODO): PortfolioFila | undefined {
  return consultas.portfolio.get({ idFotografo, portfolio, ve }) as PortfolioFila | undefined;
}

export function listarColecciones(filtro: { idPortfolio?: number; tag?: string } = {}, ve: Vista = VER_TODO): ColeccionResumenFila[] {
  const filas = consultas.colecciones.all({
    idPortfolio: filtro.idPortfolio ?? null,
    tag: filtro.tag ?? null,
    ve,
  }) as (Omit<ColeccionResumenFila, 'tags'> & { tags: string })[];
  return filas.map(conTags);
}

// Una colección se identifica por su nombreNormalizado dentro de su portfolio, y el portfolio por el
// suyo dentro del fotógrafo, ambos como vienen en la URL.
export function obtenerColeccion(idFotografo: number, portfolio: string, coleccion: string, ve: Vista = VER_TODO): ColeccionFila | undefined {
  const fila = consultas.coleccion.get({ idFotografo, portfolio, coleccion, ve }) as
    | (Omit<ColeccionFila, 'tags'> & { tags: string })
    | undefined;
  return fila && conTags(fila);
}

export function listarFotos(idColeccion: number): FotoFila[] {
  return consultas.fotosDeColeccion.all(idColeccion) as FotoFila[];
}

export function obtenerFoto(idColeccion: number, nombreFichero: string): FotoFila | undefined {
  return consultas.foto.get(idColeccion, nombreFichero) as FotoFila | undefined;
}

// Solo para services/foto.service.ts, que valida antes las reglas de negocio y guarda o borra el
// fichero en la misma transacción.
export function insertarFoto(idColeccion: number, foto: { nombreFichero: string; ancho: number | null; alto: number | null }): void {
  consultas.insertarFoto.run({ idColeccion, ...foto });
}

export function cambiarOrdenFoto(idFoto: number, orden: number): void {
  consultas.cambiarOrdenFoto.run({ idFoto, orden });
}

export function cambiarTituloFoto(idFoto: number, titulo: string | null): void {
  consultas.cambiarTituloFoto.run({ idFoto, titulo });
}

export function eliminarFoto(idFoto: number): void {
  consultas.eliminarFoto.run(idFoto);
}

export function listarTags(ve: Vista = VER_TODO): string[] {
  return (consultas.tags.all({ ve }) as { tag: string }[]).map((f) => f.tag);
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

// Borra en cascada su fotógrafo, con sus portfolios, colecciones y fotos.
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

export type Tema = 'oscuro' | 'claro';

export interface UsuarioSesionFila {
  idUsuario: number;
  usuario: string;
  email: string | null;
  rol: 'usuario' | 'administrador';
  temaPreferido: Tema | null;
  fotoActualizada: string | null;
  // null si el usuario no es fotógrafo (p. ej. el administrador)
  nombreInformal: string | null;
  nombreInformalNormalizado: string | null;
}

export function obtenerUsuarioSesion(idUsuario: number): UsuarioSesionFila | undefined {
  return consultas.usuarioSesion.get(idUsuario) as UsuarioSesionFila | undefined;
}

// Las columnas del fotógrafo son null si el usuario no es fotógrafo.
export interface PerfilFila {
  idUsuario: number;
  usuario: string;
  email: string | null;
  rol: 'usuario' | 'administrador';
  temaPreferido: Tema | null;
  fotoActualizada: string | null;
  fechaCreacion: string;
  fechaUltimoAcceso: string | null;
  tieneContrasenya: number;
  idFotografo: number | null;
  nombreInformal: string | null;
  nombreInformalNormalizado: string | null;
  nombre: string | null;
  primerApellido: string | null;
  segundoApellido: string | null;
  descripcion: string | null;
  portfolioCount: number;
  collectionCount: number;
}

export function obtenerPerfil(idUsuario: number): PerfilFila | undefined {
  return consultas.perfil.get(idUsuario) as PerfilFila | undefined;
}

// tema null = sin preferencia.
export function guardarTemaPreferido(idUsuario: number, tema: Tema | null): void {
  consultas.guardarTemaPreferido.run({ idUsuario, tema });
}

// Solo para services/foto-perfil.service.ts, que guarda o borra el fichero. fecha null = sin foto.
export function guardarFotoActualizada(idUsuario: number, fecha: string | null): void {
  consultas.guardarFotoActualizada.run({ idUsuario, fecha });
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
  // null = sin foto de perfil
  fotoActualizada: string | null;
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

export function numeroColecciones(idPortfolio: number): number {
  return (consultas.numeroColecciones.get(idPortfolio) as { n: number }).n;
}

export interface DatosColeccion {
  nombre: string;
  nombreNormalizado: string;
  descripcion: string | null;
  tags: string[];
}

function guardarTags(idColeccion: number, tags: string[]): void {
  consultas.borrarTagsColeccion.run(idColeccion);
  tags.forEach((tag, i) => consultas.insertarTagColeccion.run(idColeccion, tag, i));
}

// Solo para services/coleccion.service.ts, que valida las reglas de negocio y crea, renombra o elimina
// la carpeta dla colección en la misma transacción. Deben llamarse dentro de enTransaccion (los tags
// se guardan aparte dla colección).
export function insertarColeccion(idPortfolio: number, { tags, ...datos }: DatosColeccion): number {
  const idColeccion = Number(consultas.insertarColeccion.run({ ...datos, idPortfolio }).lastInsertRowid);
  guardarTags(idColeccion, tags);
  return idColeccion;
}

export function actualizarColeccion(idColeccion: number, { tags, ...datos }: DatosColeccion): void {
  consultas.actualizarColeccion.run({ ...datos, id: idColeccion });
  guardarTags(idColeccion, tags);
}

export function eliminarColeccion(idColeccion: number): void {
  consultas.eliminarColeccion.run(idColeccion);
}

export function cambiarOrdenPortfolio(idPortfolio: number, orden: number): void {
  consultas.cambiarOrdenPortfolio.run({ idPortfolio, orden });
}

// idFoto null: sin portada elegida (la portada es la primera foto).
export function cambiarFotoPortada(idColeccion: number, idFoto: number | null): void {
  consultas.cambiarFotoPortada.run({ idColeccion, idFoto });
}

export function cambiarColeccionPortada(idPortfolio: number, idColeccion: number | null): void {
  consultas.cambiarColeccionPortada.run({ idPortfolio, idColeccion });
}

export function cambiarVisibilidadPortfolio(idPortfolio: number, visible: boolean): void {
  consultas.cambiarVisibilidadPortfolio.run({ idPortfolio, visible: visible ? 1 : 0 });
}

export function cambiarVisibilidadColeccion(idColeccion: number, visible: boolean): void {
  consultas.cambiarVisibilidadColeccion.run({ idColeccion, visible: visible ? 1 : 0 });
}

export function cambiarOrdenColeccion(idColeccion: number, orden: number): void {
  consultas.cambiarOrdenColeccion.run({ idColeccion, orden });
}

export function numeroFotos(idColeccion: number): number {
  return (consultas.numeroFotos.get(idColeccion) as { n: number }).n;
}

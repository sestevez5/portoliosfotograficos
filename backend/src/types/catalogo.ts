// ---------------------------------------------------------------------------------------
// Catálogo en JSON para cargas masivas (npm run db:importar). Mismo vocabulario que la BD.
// ---------------------------------------------------------------------------------------

export interface FotoJson {
  nombreFichero: string;
  titulo?: string;
  orden: number;
  ancho?: number;
  alto?: number;
}

export interface ColeccionJson {
  /** Su forma normalizada es el nombre de su carpeta dentro de la de su portfolio. */
  nombre: string;
  descripcion?: string;
  tags: string[];
  /** nombreFichero de la foto de portada; si no se indica, la primera por orden. */
  fotoPortada?: string;
  fotos: FotoJson[];
}

export interface PortfolioJson {
  /** Su forma normalizada es el nombre de su carpeta dentro de la del fotógrafo. */
  nombre: string;
  descripcion?: string;
  /** Nombre de la colección de portada; si no se indica, la primera por orden. */
  coleccionPortada?: string;
  colecciones: ColeccionJson[];
}

// La contraseña no se importa: su hash se establecerá con el alta/login, nunca en texto
// plano en un fichero. El logo no se guarda: se genera a partir de nombreInformal.
export interface FotografoJson {
  /**
   * Opcional: si no se indica se calcula al importar (inicial del nombre + 3 letras del
   * primer apellido). Es interno: no se muestra ni sale en la API.
   */
  usuario?: string;
  /**
   * Obligatorio. Texto del logo. Su forma normalizada (normalizarNombre) debe ser única y es el
   * identificador en la URL y el nombre de su carpeta en datos/fotos.
   */
  nombreInformal: string;
  nombre: string;
  primerApellido: string;
  segundoApellido?: string;
  email?: string;
  descripcion: string;
}

export interface OrganizacionFotos {
  fotografo: FotografoJson;
  portfolios: PortfolioJson[];
}

// ---------------------------------------------------------------------------------------
// Respuestas de la API. Los campos que existen en la BD se llaman igual que en ella. Los ids
// y el usuario son internos y no se exponen: portfolios y colecciones se identifican por su nombre
// normalizado (único dentro de su padre) y el fotógrafo por su nombreInformalNormalizado, que la
// API devuelve para construir los enlaces.
// ---------------------------------------------------------------------------------------

export interface FotoApi {
  nombreFichero: string;
  titulo?: string;
  orden: number;
  ancho?: number;
  alto?: number;
  url: string;
}

export interface ColeccionResumen {
  nombre: string;
  /** Identificador dla colección en las URL dentro de su portfolio ("montanya"). */
  nombreNormalizado: string;
  descripcion?: string;
  tags: string[];
  coverPhotoUrl: string;
  photoCount: number;
}

// Colección en el listado global (/api/colecciones): lleva su fotógrafo y portfolio para poder enlazarlo.
export interface ColeccionEnCatalogo extends ColeccionResumen {
  fotografo: string;
  portfolio: string;
}

export interface ColeccionDetalle {
  nombre: string;
  nombreNormalizado: string;
  descripcion?: string;
  tags: string[];
  portfolio: { nombre: string; nombreNormalizado: string };
  fotos: FotoApi[];
  /** nombreFichero de la foto elegida como portada; sin ella, la portada es la primera foto. */
  fotoPortada?: string;
}

export interface PortfolioResumen {
  nombre: string;
  /** Identificador del portfolio en las URL dentro de su fotógrafo ("proyectos-personales"). */
  nombreNormalizado: string;
  descripcion?: string;
  coverPhotoUrl: string;
  collectionCount: number;
}

export interface PortfolioDetalle {
  nombre: string;
  nombreNormalizado: string;
  descripcion?: string;
  colecciones: ColeccionResumen[];
  /** nombreNormalizado de la colección de portada; sin ella, la portada es la de la primera colección. */
  coleccionPortada?: string;
}

// Cuerpo de POST /api/fotografos/:fotografo/portfolios y de PUT .../portfolios/:portfolio. El
// nombreNormalizado lo calcula el backend.
export interface PortfolioAlta {
  nombre: string;
  descripcion?: string;
}

// Cuerpo de POST /api/fotografos/:fotografo/portfolios/:portfolio/colecciones y de PUT
// .../colecciones/:coleccion. El nombreNormalizado lo calcula el backend. Sin tags equivale a ninguno.
export interface ColeccionAlta {
  nombre: string;
  descripcion?: string;
  tags?: string[];
}

// Cuerpo de POST /api/fotografos: los campos que el fotógrafo puede rellenar. El usuario y el
// nombreInformalNormalizado los calcula el backend y no se exponen.
export interface FotografoAlta {
  nombreInformal: string;
  nombre: string;
  primerApellido: string;
  segundoApellido?: string;
  email?: string;
  descripcion?: string;
  contrasenya?: string;
}

// Cuerpo de POST /api/registro: el usuario elige su nombre de usuario; correo y contraseña son
// obligatorios (con ellos inicia sesión). El resto, como el alta de un fotógrafo.
export interface RegistroFotografo extends FotografoAlta {
  usuario: string;
}

// Cuerpo de POST /api/sesion: nombre de usuario o correo, y contraseña.
export interface Credenciales {
  usuario: string;
  contrasenya: string;
}

export type Tema = 'oscuro' | 'claro';

// Usuario con la sesión iniciada (GET /api/sesion). Solo se devuelve a él mismo: el nombre de
// usuario y el correo de los demás nunca salen en la API.
export interface UsuarioSesion {
  usuario: string;
  email?: string;
  rol: 'usuario' | 'administrador';
  // Tema de la web que prefiere (Configuración); sin él, el del navegador.
  temaPreferido?: Tema;
  // Su foto de perfil, si la tiene.
  fotoUrl?: string;
  // Su perfil de fotógrafo, si lo tiene (el administrador no).
  fotografo?: { nombreInformal: string; nombreInformalNormalizado: string; logoUrl: string };
}

// "Mi perfil" (GET /api/perfil): todo lo del usuario con la sesión iniciada y, si lo es, de su
// fotógrafo. De la contraseña, solo si la tiene.
export interface Perfil {
  usuario: string;
  email?: string;
  rol: 'usuario' | 'administrador';
  temaPreferido?: Tema;
  fotoUrl?: string;
  fechaCreacion: string;
  fechaUltimoAcceso?: string;
  tieneContrasenya: boolean;
  fotografo?: FotografoPublico & { portfolioCount: number; collectionCount: number };
}

// Cuerpo de PUT /api/perfil/preferencias. null = sin preferencia.
export interface Preferencias {
  temaPreferido: Tema | null;
}

// Respuesta de GET /api/fotografos/:fotografo/edicion: los datos editables para rellenar el
// formulario. Incluye el email; de la contraseña solo si existe (nunca el hash).
export interface FotografoEdicionApi {
  nombreInformal: string;
  nombre: string;
  primerApellido: string;
  segundoApellido?: string;
  email?: string;
  descripcion: string;
  tieneContrasenya: boolean;
  // Su foto de perfil, si la tiene.
  fotoUrl?: string;
}

// Datos públicos de un fotógrafo en la API: nunca incluyen email ni contraseña.
export interface FotografoPublico {
  nombreInformal: string;
  /** Identificador del fotógrafo en las URL ("santi-estevez"). */
  nombreInformalNormalizado: string;
  nombre: string;
  primerApellido: string;
  segundoApellido?: string;
  descripcion: string;
  logoUrl: string;
}

export interface FotografoResumen extends FotografoPublico {
  portfolioCount: number;
  collectionCount: number;
}

export interface FotografoDetalle extends FotografoPublico {
  portfolios: PortfolioResumen[];
}

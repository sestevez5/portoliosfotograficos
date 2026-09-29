// Mismo vocabulario que la API (y que la base de datos del backend). Los ids y el usuario de
// la BD son internos: en las URL el fotógrafo se identifica por su nombreInformalNormalizado y
// portfolios y colecciones por su nombreNormalizado, que calcula el backend y devuelve la API.

export interface Foto {
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
  fotos: Foto[];
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

// Alta y edición de un portfolio (POST /api/fotografos/:fotografo/portfolios y PUT
// .../portfolios/:portfolio). El nombreNormalizado lo calcula el backend.
export interface PortfolioAlta {
  nombre: string;
  descripcion?: string;
}

// Alta y edición de una colección (POST /api/fotografos/:fotografo/portfolios/:portfolio/colecciones y PUT
// .../colecciones/:coleccion). El nombreNormalizado lo calcula el backend.
export interface ColeccionAlta {
  nombre: string;
  descripcion?: string;
  tags: string[];
}

export interface FotografoPublico {
  nombreInformal: string;
  /** Identificador del fotógrafo en las URL ("santi-estevez"); lo calcula el backend. */
  nombreInformalNormalizado: string;
  nombre: string;
  primerApellido: string;
  segundoApellido?: string;
  descripcion: string;
  logoUrl: string;
}

// Alta de un fotógrafo (POST /api/fotografos): solo los campos que puede rellenar. El
// nombreInformalNormalizado y el usuario los calcula el backend.
export interface FotografoAlta {
  nombreInformal: string;
  nombre: string;
  primerApellido: string;
  segundoApellido?: string;
  email?: string;
  descripcion?: string;
  contrasenya?: string;
}

// Datos editables de un fotógrafo (GET /api/fotografos/:fotografo/edicion). De la contraseña solo
// se sabe si existe.
export interface FotografoEdicion {
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

// Registro (POST /api/registro): datos de acceso (usuario, correo y contraseña, obligatorios) y los
// del fotógrafo, como en el alta.
export interface RegistroFotografo extends FotografoAlta {
  usuario: string;
  email: string;
  contrasenya: string;
}

// Inicio de sesión (POST /api/sesion): nombre de usuario o correo, y contraseña.
export interface Credenciales {
  usuario: string;
  contrasenya: string;
}

// Usuario con la sesión iniciada (GET /api/sesion devuelve { usuario: UsuarioSesion | null }).
export interface UsuarioSesion {
  usuario: string;
  email?: string;
  rol: 'usuario' | 'administrador';
  // Tema que prefiere (Configuración); se aplica al iniciar sesión.
  temaPreferido?: 'oscuro' | 'claro';
  // Su foto de perfil, si la tiene.
  fotoUrl?: string;
  // Su perfil de fotógrafo, si lo tiene (el administrador no).
  fotografo?: { nombreInformal: string; nombreInformalNormalizado: string; logoUrl: string };
}

// "Mi perfil" (GET /api/perfil): todo lo del usuario con la sesión iniciada y, si lo es, de su fotógrafo.
export interface Perfil {
  usuario: string;
  email?: string;
  rol: 'usuario' | 'administrador';
  temaPreferido?: 'oscuro' | 'claro';
  fotoUrl?: string;
  fechaCreacion: string;
  fechaUltimoAcceso?: string;
  tieneContrasenya: boolean;
  fotografo?: FotografoPublico & { portfolioCount: number; collectionCount: number };
}

// Estado de la aplicación (GET /api/estado): primerUso mientras el administrador no haya entrado nunca.
export interface EstadoAplicacion {
  primerUso: boolean;
}

// Primer uso (POST /api/admin/primer-uso): credenciales del administrador y, si se quiere cambiar,
// su contraseña nueva.
export interface PrimerUso {
  usuario: string;
  contrasenya: string;
  contrasenyaNueva?: string;
}

// Cambio de la contraseña del administrador (PUT /api/admin/contrasenya).
export interface CambioContrasenya {
  contrasenyaActual: string;
  contrasenyaNueva: string;
}

// Respuesta 422 del backend cuando se incumple una regla de negocio.
export interface ReglaNegocioIncumplida {
  tipo: 'reglaNegocioIncumplida';
  operacion?: { codigo: string; descripcion: string };
  regla: { codigo: string; mensaje: string };
  message: string;
}

export interface FotografoResumen extends FotografoPublico {
  portfolioCount: number;
  collectionCount: number;
}

export interface FotografoDetalle extends FotografoPublico {
  portfolios: PortfolioResumen[];
}

export function nombreCompleto({ nombre, primerApellido, segundoApellido }: FotografoPublico): string {
  return [nombre, primerApellido, segundoApellido].filter(Boolean).join(' ');
}

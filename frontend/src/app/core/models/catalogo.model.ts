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
  // Resumen de su EXIF, si lo tenía al subirla (sin la ubicación GPS).
  metadatos?: MetadatosFoto;
}

// Visibilidad de un portfolio o una colección para los demás usuarios (su fotógrafo y el administrador
// lo ven y entran siempre): 'visible', cualquiera lo ve y entra; 'bloqueado', se ve que existe (con un
// candado) pero no se puede entrar; 'oculto', no lo ven.
export type Visibilidad = 'visible' | 'bloqueado' | 'oculto';

// "Acerca de" (GET /api/acerca-de). Fechas en AAAA-MM-DD.
export interface AcercaDe {
  aplicacion: { version: string; fecha: string };
  baseDatos: { version: number; fecha: string };
  autor: string;
  colaboradores: string[];
}

// Datos EXIF de una foto, en forma legible (backend: utils/metadatos-foto.ts). Solo los que tenga.
export interface MetadatosFoto {
  camara?: string; // "FUJIFILM X-T5"
  objetivo?: string; // "XF23mmF1.4 R"
  distanciaFocal?: number; // mm
  distanciaFocal35mm?: number; // mm, equivalente en formato completo
  apertura?: number; // número f (2.8 = f/2,8)
  exposicion?: string; // "1/250 s"
  iso?: number;
  compensacionExposicion?: number; // pasos (EV)
  fechaToma?: string; // "2026-05-01T10:20:30", hora local de la cámara (sin zona horaria)
  autor?: string;
  copyright?: string;
  software?: string;
}

export interface ColeccionResumen {
  nombre: string;
  /** Identificador dla colección en las URL dentro de su portfolio ("montanya"). */
  nombreNormalizado: string;
  descripcion?: string;
  tags: string[];
  coverPhotoUrl: string;
  photoCount: number;
  /** false = oculta a los demás usuarios: solo la reciben su fotógrafo y el administrador. */
  visible: boolean; // = visibilidad distinta de 'oculto'
  visibilidad: Visibilidad;
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
  visible: boolean; // = visibilidad distinta de 'oculto'
  visibilidad: Visibilidad;
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
  /** false = oculto a los demás usuarios: solo lo reciben su fotógrafo y el administrador. */
  visible: boolean; // = visibilidad distinta de 'oculto'
  visibilidad: Visibilidad;
}

export interface PortfolioDetalle {
  nombre: string;
  nombreNormalizado: string;
  descripcion?: string;
  visible: boolean; // = visibilidad distinta de 'oculto'
  visibilidad: Visibilidad;
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
  // Tema que prefiere ("Editar cuenta"); se aplica al iniciar sesión.
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

// "Editar cuenta" (PUT /api/perfil/cuenta): nombre de usuario, preferencias de la cuenta y, si se
// cambia, la contraseña (con la actual). Se guarda todo junto.
export interface CuentaEdicion {
  usuario: string;
  temaPreferido: 'oscuro' | 'claro' | null;
  contrasenya?: CambioContrasenya;
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

// Mismo vocabulario que la API (y que la base de datos del backend). Los ids y el usuario de
// la BD son internos: en las URL el fotógrafo se identifica por su nombreInformalNormalizado y
// portfolios y álbumes por su nombreNormalizado, que calcula el backend y devuelve la API.

export interface Foto {
  nombreFichero: string;
  titulo?: string;
  orden: number;
  ancho?: number;
  alto?: number;
  url: string;
}

export interface AlbumResumen {
  nombre: string;
  /** Identificador del álbum en las URL dentro de su portfolio ("montanya"). */
  nombreNormalizado: string;
  descripcion?: string;
  tags: string[];
  coverPhotoUrl: string;
  photoCount: number;
}

// Álbum en el listado global (/api/albums): lleva su fotógrafo y portfolio para poder enlazarlo.
export interface AlbumEnCatalogo extends AlbumResumen {
  fotografo: string;
  portfolio: string;
}

export interface AlbumDetalle {
  nombre: string;
  nombreNormalizado: string;
  descripcion?: string;
  tags: string[];
  portfolio: { nombre: string; nombreNormalizado: string };
  fotos: Foto[];
}

export interface PortfolioResumen {
  nombre: string;
  /** Identificador del portfolio en las URL dentro de su fotógrafo ("proyectos-personales"). */
  nombreNormalizado: string;
  descripcion?: string;
  coverPhotoUrl: string;
  albumCount: number;
}

export interface PortfolioDetalle {
  nombre: string;
  nombreNormalizado: string;
  descripcion?: string;
  albumes: AlbumResumen[];
}

// Alta y edición de un portfolio (POST /api/fotografos/:fotografo/portfolios y PUT
// .../portfolios/:portfolio). El nombreNormalizado lo calcula el backend.
export interface PortfolioAlta {
  nombre: string;
  descripcion?: string;
}

// Alta y edición de un álbum (POST /api/fotografos/:fotografo/portfolios/:portfolio/albums y PUT
// .../albums/:album). El nombreNormalizado lo calcula el backend.
export interface AlbumAlta {
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
  albumCount: number;
}

export interface FotografoDetalle extends FotografoPublico {
  portfolios: PortfolioResumen[];
}

export function nombreCompleto({ nombre, primerApellido, segundoApellido }: FotografoPublico): string {
  return [nombre, primerApellido, segundoApellido].filter(Boolean).join(' ');
}

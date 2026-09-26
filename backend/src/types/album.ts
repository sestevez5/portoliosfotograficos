export interface Photo {
  id: string;
  filename: string;
  title?: string;
  order: number;
  width?: number;
  height?: number;
}

export interface Album {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  coverPhotoId: string;
  photos: Photo[];
}

export interface Fotografo {
  nombre: string;
  descripcion: string;
  /**
   * Archivo del logo dentro de datos/logos (p. ej. "santi.svg"). No lo rellena el usuario:
   * el backend genera el logo la primera vez que se pide y escribe aquí la referencia.
   */
  logo?: string;
  /** Subtítulo opcional del logo generado (p. ej. "Paisaje · Naturaleza"). */
  logoSubtitulo?: string;
}

export interface OrganizacionFotos {
  fotografo: Fotografo;
  albumes: Album[];
}

export interface AlbumSummary {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  coverPhotoUrl: string;
  photoCount: number;
}

// En las respuestas de la API los datos del logo se sustituyen por la URL que lo sirve
// (propio o generado, eso es un detalle interno del backend).
export interface FotografoPublico extends Omit<Fotografo, 'logo' | 'logoSubtitulo'> {
  logoUrl: string;
}

export interface FotografoSummary extends FotografoPublico {
  slug: string;
  albumCount: number;
}

export interface FotografoDetail extends FotografoPublico {
  slug: string;
  albumes: AlbumSummary[];
}

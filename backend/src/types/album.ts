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

// Un portfolio agrupa álbumes de un fotógrafo. Su id es único dentro del fotógrafo y
// es también el nombre de su carpeta en datos/fotos/<fotografoSlug>/.
export interface Portfolio {
  id: string;
  title: string;
  description?: string;
  albumes: Album[];
}

export interface OrganizacionFotos {
  fotografo: Fotografo;
  portfolios: Portfolio[];
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
export interface PortfolioSummary {
  id: string;
  title: string;
  description?: string;
  coverPhotoUrl: string;
  albumCount: number;
}

export interface PortfolioDetail {
  id: string;
  title: string;
  description?: string;
  albumes: AlbumSummary[];
}

export interface FotografoPublico extends Omit<Fotografo, 'logo' | 'logoSubtitulo'> {
  logoUrl: string;
}

export interface FotografoSummary extends FotografoPublico {
  slug: string;
  portfolioCount: number;
  albumCount: number;
}

export interface FotografoDetail extends FotografoPublico {
  slug: string;
  portfolios: PortfolioSummary[];
}

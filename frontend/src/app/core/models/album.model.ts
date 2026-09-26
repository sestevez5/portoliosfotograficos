export interface Photo {
  id: string;
  filename: string;
  title?: string;
  order: number;
  url: string;
}

export interface Album {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  coverPhotoId: string;
  portfolio: PortfolioRef;
  photos: Photo[];
}

export interface AlbumSummary {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  coverPhotoUrl: string;
  photoCount: number;
}

export interface PortfolioRef {
  id: string;
  title: string;
}

export interface PortfolioSummary extends PortfolioRef {
  description?: string;
  coverPhotoUrl: string;
  albumCount: number;
}

export interface PortfolioDetail extends PortfolioRef {
  description?: string;
  albumes: AlbumSummary[];
}

export interface Fotografo {
  slug: string;
  nombre: string;
  descripcion: string;
  logoUrl: string;
}

export interface FotografoSummary extends Fotografo {
  portfolioCount: number;
  albumCount: number;
}

export interface FotografoDetail extends Fotografo {
  portfolios: PortfolioSummary[];
}

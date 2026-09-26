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

export interface Fotografo {
  slug: string;
  nombre: string;
  descripcion: string;
  logoUrl: string;
}

export interface FotografoSummary extends Fotografo {
  albumCount: number;
}

export interface FotografoDetail extends Fotografo {
  albumes: AlbumSummary[];
}

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

export interface FotografoSummary extends Fotografo {
  slug: string;
  albumCount: number;
}

export interface FotografoDetail extends Fotografo {
  slug: string;
  albumes: AlbumSummary[];
}

import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { Album, AlbumSummary, FotografoDetail, FotografoSummary } from '../models/album.model';

function toAbsoluteUrl(path: string): string {
  return path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
}

@Service()
export class AlbumService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/api`;

  getAlbums(tag?: string): Observable<AlbumSummary[]> {
    const url = tag ? `${this.baseUrl}/albums?tag=${encodeURIComponent(tag)}` : `${this.baseUrl}/albums`;
    return this.http.get<AlbumSummary[]>(url).pipe(
      map((albums) => albums.map((album) => ({ ...album, coverPhotoUrl: toAbsoluteUrl(album.coverPhotoUrl) }))),
    );
  }

  getAlbum(id: string): Observable<Album> {
    return this.http.get<Album>(`${this.baseUrl}/albums/${id}`).pipe(
      map((album) => ({
        ...album,
        photos: album.photos.map((photo) => ({ ...photo, url: toAbsoluteUrl(photo.url) })),
      })),
    );
  }

  getFotografos(): Observable<FotografoSummary[]> {
    return this.http.get<FotografoSummary[]>(`${this.baseUrl}/fotografos`);
  }

  getFotografo(slug: string): Observable<FotografoDetail> {
    return this.http.get<FotografoDetail>(`${this.baseUrl}/fotografos/${encodeURIComponent(slug)}`).pipe(
      map((fotografo) => ({
        ...fotografo,
        albumes: fotografo.albumes.map((album) => ({ ...album, coverPhotoUrl: toAbsoluteUrl(album.coverPhotoUrl) })),
      })),
    );
  }

  getAlbumDeFotografo(slug: string, id: string): Observable<Album> {
    return this.http.get<Album>(`${this.baseUrl}/fotografos/${encodeURIComponent(slug)}/albums/${id}`).pipe(
      map((album) => ({
        ...album,
        photos: album.photos.map((photo) => ({ ...photo, url: toAbsoluteUrl(photo.url) })),
      })),
    );
  }

  getTags(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/tags`);
  }
}

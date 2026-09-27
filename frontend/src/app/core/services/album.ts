import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import {
  AlbumAlta,
  AlbumDetalle,
  AlbumEnCatalogo,
  FotografoAlta,
  FotografoDetalle,
  FotografoEdicion,
  FotografoPublico,
  FotografoResumen,
  PortfolioAlta,
  PortfolioDetalle,
} from '../models/album.model';

// Una URL vacía (p. ej. la portada de un portfolio o álbum sin fotos) se deja vacía.
function toAbsoluteUrl(path: string): string {
  return !path || path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
}

function conUrlsAbsolutas(album: AlbumDetalle): AlbumDetalle {
  return { ...album, fotos: album.fotos.map((foto) => ({ ...foto, url: toAbsoluteUrl(foto.url) })) };
}

@Service()
export class AlbumService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/api`;

  getAlbums(tag?: string): Observable<AlbumEnCatalogo[]> {
    const url = tag ? `${this.baseUrl}/albums?tag=${encodeURIComponent(tag)}` : `${this.baseUrl}/albums`;
    return this.http.get<AlbumEnCatalogo[]>(url).pipe(
      map((albumes) => albumes.map((album) => ({ ...album, coverPhotoUrl: toAbsoluteUrl(album.coverPhotoUrl) }))),
    );
  }

  getFotografos(): Observable<FotografoResumen[]> {
    return this.http.get<FotografoResumen[]>(`${this.baseUrl}/fotografos`).pipe(
      map((fotografos) =>
        fotografos.map((fotografo) => ({ ...fotografo, logoUrl: toAbsoluteUrl(fotografo.logoUrl) })),
      ),
    );
  }

  getFotografo(fotografo: string): Observable<FotografoDetalle> {
    return this.http.get<FotografoDetalle>(`${this.baseUrl}/fotografos/${encodeURIComponent(fotografo)}`).pipe(
      map((fotografo) => ({
        ...fotografo,
        logoUrl: toAbsoluteUrl(fotografo.logoUrl),
        portfolios: fotografo.portfolios.map((portfolio) => ({
          ...portfolio,
          coverPhotoUrl: toAbsoluteUrl(portfolio.coverPhotoUrl),
        })),
      })),
    );
  }

  getPortfolio(fotografo: string, portfolio: string): Observable<PortfolioDetalle> {
    return this.http.get<PortfolioDetalle>(this.portfolioUrl(fotografo, portfolio)).pipe(
      map((portfolio) => ({
        ...portfolio,
        albumes: portfolio.albumes.map((album) => ({ ...album, coverPhotoUrl: toAbsoluteUrl(album.coverPhotoUrl) })),
      })),
    );
  }

  getAlbumDePortfolio(fotografo: string, portfolio: string, album: string): Observable<AlbumDetalle> {
    return this.http.get<AlbumDetalle>(this.albumUrl(fotografo, portfolio, album)).pipe(map(conUrlsAbsolutas));
  }

  // Alta de un fotógrafo. Si se incumple una regla de negocio el backend responde 422 con un
  // ReglaNegocioIncumplida en el cuerpo del error.
  crearFotografo(alta: FotografoAlta): Observable<FotografoPublico> {
    return this.http.post<FotografoPublico>(`${this.baseUrl}/fotografos`, alta);
  }

  getFotografoEdicion(fotografo: string): Observable<FotografoEdicion> {
    return this.http.get<FotografoEdicion>(`${this.baseUrl}/fotografos/${encodeURIComponent(fotografo)}/edicion`);
  }

  // Una contraseña vacía conserva la actual.
  editarFotografo(fotografo: string, cambios: FotografoAlta): Observable<FotografoPublico> {
    return this.http.put<FotografoPublico>(`${this.baseUrl}/fotografos/${encodeURIComponent(fotografo)}`, cambios);
  }

  // Sin confirmar, si el fotógrafo tiene portfolios el backend responde 422 con la regla
  // FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS (su mensaje es la pregunta que hay que hacer al usuario).
  eliminarFotografo(fotografo: string, confirmar = false): Observable<void> {
    const url = `${this.baseUrl}/fotografos/${encodeURIComponent(fotografo)}`;
    return this.http.delete<void>(confirmar ? `${url}?confirmar=true` : url);
  }

  // Mantenimiento de los portfolios de un fotógrafo (lo hace el propio fotógrafo). Devuelven el
  // portfolio guardado, con su nombreNormalizado (que cambia si cambia el nombre).
  crearPortfolio(fotografo: string, alta: PortfolioAlta): Observable<PortfolioDetalle> {
    return this.http.post<PortfolioDetalle>(`${this.baseUrl}/fotografos/${encodeURIComponent(fotografo)}/portfolios`, alta);
  }

  editarPortfolio(fotografo: string, portfolio: string, cambios: PortfolioAlta): Observable<PortfolioDetalle> {
    return this.http.put<PortfolioDetalle>(this.portfolioUrl(fotografo, portfolio), cambios);
  }

  // Sin confirmar, si el portfolio tiene álbumes el backend responde 422 con la regla
  // PORTFOLIO_ELIMINAR_CON_ALBUMES (su mensaje es la pregunta que hay que hacer al usuario).
  eliminarPortfolio(fotografo: string, portfolio: string, confirmar = false): Observable<void> {
    const url = this.portfolioUrl(fotografo, portfolio);
    return this.http.delete<void>(confirmar ? `${url}?confirmar=true` : url);
  }

  // Mantenimiento de los álbumes de un portfolio (también lo hace el propio fotógrafo). Devuelven el
  // álbum guardado, con su nombreNormalizado (que cambia si cambia el nombre).
  crearAlbum(fotografo: string, portfolio: string, alta: AlbumAlta): Observable<AlbumDetalle> {
    return this.http.post<AlbumDetalle>(`${this.portfolioUrl(fotografo, portfolio)}/albums`, alta).pipe(map(conUrlsAbsolutas));
  }

  editarAlbum(fotografo: string, portfolio: string, album: string, cambios: AlbumAlta): Observable<AlbumDetalle> {
    return this.http.put<AlbumDetalle>(this.albumUrl(fotografo, portfolio, album), cambios).pipe(map(conUrlsAbsolutas));
  }

  // Sin confirmar, si el álbum tiene fotos el backend responde 422 con la regla
  // ALBUM_ELIMINAR_CON_FOTOS (su mensaje es la pregunta que hay que hacer al usuario).
  eliminarAlbum(fotografo: string, portfolio: string, album: string, confirmar = false): Observable<void> {
    const url = this.albumUrl(fotografo, portfolio, album);
    return this.http.delete<void>(confirmar ? `${url}?confirmar=true` : url);
  }

  getTags(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/tags`);
  }

  // fotografo, portfolio y album son segmentos de URL (normalizarNombre), que pueden llevar tildes.
  private portfolioUrl(fotografo: string, portfolio: string): string {
    return `${this.baseUrl}/fotografos/${encodeURIComponent(fotografo)}/portfolios/${encodeURIComponent(portfolio)}`;
  }

  private albumUrl(fotografo: string, portfolio: string, album: string): string {
    return `${this.portfolioUrl(fotografo, portfolio)}/albums/${encodeURIComponent(album)}`;
  }
}

import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import {
  Visibilidad,
  AcercaDe,
  ColeccionAlta,
  ColeccionDetalle,
  ColeccionEnCatalogo,
  FotografoAlta,
  FotografoDetalle,
  FotografoEdicion,
  FotografoPublico,
  FotografoResumen,
  Foto,
  PortfolioAlta,
  PortfolioDetalle,
} from '../models/catalogo.model';

// Una URL vacía (p. ej. la portada de un portfolio o colección sin fotos) se deja vacía.
function toAbsoluteUrl(path: string): string {
  return !path || path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
}

function conUrlsAbsolutas(coleccion: ColeccionDetalle): ColeccionDetalle {
  return { ...coleccion, fotos: coleccion.fotos.map((foto) => ({ ...foto, url: toAbsoluteUrl(foto.url) })) };
}

// Si la API ha respondido que un portfolio o una colección están bloqueados para quien mira (403
// "accesoRestringido"): existen, pero no se puede entrar.
export function esAccesoRestringido(error: unknown): boolean {
  const respuesta = error as { status?: number; error?: { tipo?: string } } | null;
  return respuesta?.status === 403 && respuesta.error?.tipo === 'accesoRestringido';
}

@Service()
export class CatalogoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/api`;

  getColecciones(tag?: string): Observable<ColeccionEnCatalogo[]> {
    const url = tag ? `${this.baseUrl}/colecciones?tag=${encodeURIComponent(tag)}` : `${this.baseUrl}/colecciones`;
    return this.http.get<ColeccionEnCatalogo[]>(url).pipe(
      map((colecciones) => colecciones.map((coleccion) => ({ ...coleccion, coverPhotoUrl: toAbsoluteUrl(coleccion.coverPhotoUrl) }))),
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
        colecciones: portfolio.colecciones.map((coleccion) => ({ ...coleccion, coverPhotoUrl: toAbsoluteUrl(coleccion.coverPhotoUrl) })),
      })),
    );
  }

  getColeccionDePortfolio(fotografo: string, portfolio: string, coleccion: string): Observable<ColeccionDetalle> {
    return this.http.get<ColeccionDetalle>(this.coleccionUrl(fotografo, portfolio, coleccion)).pipe(map(conUrlsAbsolutas));
  }

  // Alta de un fotógrafo. Si se incumple una regla de negocio el backend responde 422 con un
  // ReglaNegocioIncumplida en el cuerpo del error.
  crearFotografo(alta: FotografoAlta): Observable<FotografoPublico> {
    return this.http.post<FotografoPublico>(`${this.baseUrl}/fotografos`, alta);
  }

  getFotografoEdicion(fotografo: string): Observable<FotografoEdicion> {
    return this.http
      .get<FotografoEdicion>(`${this.baseUrl}/fotografos/${encodeURIComponent(fotografo)}/edicion`)
      .pipe(map((datos) => ({ ...datos, ...(datos.fotoUrl && { fotoUrl: toAbsoluteUrl(datos.fotoUrl) }) })));
  }

  // Foto de perfil: la imagen ya recortada (JPEG). Devuelve la URL de la foto nueva. Si no es
  // válida el backend responde 422 con la regla incumplida.
  subirFotoPerfil(fotografo: string, foto: Blob): Observable<string> {
    return this.http
      .put<{ fotoUrl: string }>(`${this.baseUrl}/fotografos/${encodeURIComponent(fotografo)}/foto`, foto, {
        headers: { 'Content-Type': 'image/jpeg' },
      })
      .pipe(map(({ fotoUrl }) => toAbsoluteUrl(fotoUrl)));
  }

  quitarFotoPerfil(fotografo: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/fotografos/${encodeURIComponent(fotografo)}/foto`);
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

  // orden: los nombreNormalizado de todos los portfolios del fotógrafo, en el orden en que deben
  // quedar. Si no son exactamente sus portfolios, el backend responde 422 (PORTFOLIO_ORDEN_NO_VALIDO).
  ordenarPortfolios(fotografo: string, orden: string[]): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/fotografos/${encodeURIComponent(fotografo)}/orden-portfolios`, { orden });
  }

  // Sin confirmar, si el portfolio tiene colecciones el backend responde 422 con la regla
  // PORTFOLIO_ELIMINAR_CON_COLECCIONES (su mensaje es la pregunta que hay que hacer al usuario).
  eliminarPortfolio(fotografo: string, portfolio: string, confirmar = false): Observable<void> {
    const url = this.portfolioUrl(fotografo, portfolio);
    return this.http.delete<void>(confirmar ? `${url}?confirmar=true` : url);
  }

  // Mantenimiento de las colecciones de un portfolio (también lo hace el propio fotógrafo). Devuelven el
  // colección guardada, con su nombreNormalizado (que cambia si cambia el nombre).
  crearColeccion(fotografo: string, portfolio: string, alta: ColeccionAlta): Observable<ColeccionDetalle> {
    return this.http.post<ColeccionDetalle>(`${this.portfolioUrl(fotografo, portfolio)}/colecciones`, alta).pipe(map(conUrlsAbsolutas));
  }

  editarColeccion(fotografo: string, portfolio: string, coleccion: string, cambios: ColeccionAlta): Observable<ColeccionDetalle> {
    return this.http.put<ColeccionDetalle>(this.coleccionUrl(fotografo, portfolio, coleccion), cambios).pipe(map(conUrlsAbsolutas));
  }

  // orden: los nombreNormalizado de todas las colecciones del portfolio, en el orden en que deben
  // quedar. Si no son exactamente sus colecciones, el backend responde 422 (COLECCION_ORDEN_NO_VALIDO).
  ordenarColecciones(fotografo: string, portfolio: string, orden: string[]): Observable<void> {
    return this.http.put<void>(`${this.portfolioUrl(fotografo, portfolio)}/orden-colecciones`, { orden });
  }

  // Colección cuya portada es la del portfolio (su nombreNormalizado), o null para no tener ninguna
  // elegida (entonces es la de la primera colección).
  cambiarPortadaPortfolio(fotografo: string, portfolio: string, coleccionPortada: string | null): Observable<void> {
    return this.http.put<void>(`${this.portfolioUrl(fotografo, portfolio)}/portada`, { coleccionPortada });
  }

  // Visibilidad de un portfolio (con todas sus colecciones) o de una colección para los demás usuarios.
  cambiarVisibilidadPortfolio(fotografo: string, portfolio: string, visibilidad: Visibilidad): Observable<void> {
    return this.http.put<void>(`${this.portfolioUrl(fotografo, portfolio)}/visibilidad`, { visibilidad });
  }

  cambiarVisibilidadColeccion(fotografo: string, portfolio: string, coleccion: string, visibilidad: Visibilidad): Observable<void> {
    return this.http.put<void>(`${this.coleccionUrl(fotografo, portfolio, coleccion)}/visibilidad`, { visibilidad });
  }

  // Sin confirmar, si la colección tiene fotos el backend responde 422 con la regla
  // COLECCION_ELIMINAR_CON_FOTOS (su mensaje es la pregunta que hay que hacer al usuario).
  eliminarColeccion(fotografo: string, portfolio: string, coleccion: string, confirmar = false): Observable<void> {
    const url = this.coleccionUrl(fotografo, portfolio, coleccion);
    return this.http.delete<void>(confirmar ? `${url}?confirmar=true` : url);
  }

  // Fotos de una colección ("Gestionar fotos"). Una petición por foto: el cuerpo es el archivo tal
  // cual y su nombre va en ?nombreFichero=. Devuelve la foto guardada (al final de las dla colección).
  // Si incumple una regla (no es una imagen, nombre repetido…) el backend responde 422.
  anyadirFoto(fotografo: string, portfolio: string, coleccion: string, archivo: File): Observable<Foto> {
    const url = `${this.coleccionUrl(fotografo, portfolio, coleccion)}/fotos?nombreFichero=${encodeURIComponent(archivo.name)}`;
    return this.http
      .post<Foto>(url, archivo, { headers: { 'Content-Type': archivo.type || 'application/octet-stream' } })
      .pipe(map((foto) => ({ ...foto, url: toAbsoluteUrl(foto.url) })));
  }

  // orden: los nombres de fichero de todas las fotos dla colección, en el orden en que deben quedar. Si
  // no son exactamente sus fotos, el backend responde 422 (FOTO_ORDEN_NO_VALIDO) y no cambia nada.
  ordenarFotos(fotografo: string, portfolio: string, coleccion: string, orden: string[]): Observable<void> {
    return this.http.put<void>(`${this.coleccionUrl(fotografo, portfolio, coleccion)}/fotos/orden`, { orden });
  }

  // Foto de portada dla colección (su nombreFichero), o null para no tener ninguna elegida (entonces
  // la portada es la primera foto).
  cambiarPortada(fotografo: string, portfolio: string, coleccion: string, fotoPortada: string | null): Observable<void> {
    return this.http.put<void>(`${this.coleccionUrl(fotografo, portfolio, coleccion)}/portada`, { fotoPortada });
  }

  // Título de una foto; null (o vacío) la deja sin título. Devuelve la foto con el título guardado.
  cambiarTituloFoto(fotografo: string, portfolio: string, coleccion: string, nombreFichero: string, titulo: string | null): Observable<Foto> {
    return this.http.put<Foto>(
      `${this.coleccionUrl(fotografo, portfolio, coleccion)}/fotos/${encodeURIComponent(nombreFichero)}/titulo`,
      { titulo },
    );
  }

  eliminarFoto(fotografo: string, portfolio: string, coleccion: string, nombreFichero: string): Observable<void> {
    return this.http.delete<void>(`${this.coleccionUrl(fotografo, portfolio, coleccion)}/fotos/${encodeURIComponent(nombreFichero)}`);
  }

  getTags(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/tags`);
  }

  // Versión de la aplicación y de la base de datos, con sus fechas, y el autor ("Acerca de").
  getAcercaDe(): Observable<AcercaDe> {
    return this.http.get<AcercaDe>(`${this.baseUrl}/acerca-de`);
  }

  // fotografo, portfolio y coleccion son segmentos de URL (normalizarNombre), que pueden llevar tildes.
  private portfolioUrl(fotografo: string, portfolio: string): string {
    return `${this.baseUrl}/fotografos/${encodeURIComponent(fotografo)}/portfolios/${encodeURIComponent(portfolio)}`;
  }

  private coleccionUrl(fotografo: string, portfolio: string, coleccion: string): string {
    return `${this.portfolioUrl(fotografo, portfolio)}/colecciones/${encodeURIComponent(coleccion)}`;
  }
}

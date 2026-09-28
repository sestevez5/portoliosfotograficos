import { Service, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { Credenciales, RegistroFotografo, UsuarioSesion } from '../models/album.model';

// La logoUrl del backend es una ruta relativa a la API.
function conLogoAbsoluto(usuario: UsuarioSesion | null): UsuarioSesion | null {
  if (!usuario?.fotografo) {
    return usuario;
  }
  return { ...usuario, fotografo: { ...usuario.fotografo, logoUrl: `${API_BASE_URL}${usuario.fotografo.logoUrl}` } };
}

// Sesión del usuario. El token va en una cookie HttpOnly que gestiona el navegador (la página no
// lo ve); aquí solo se sabe quién tiene la sesión iniciada. Todavía no se restringe nada con ella.
@Service()
export class SesionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/api`;

  // null = sin sesión (también mientras no se ha consultado).
  readonly usuario = signal<UsuarioSesion | null>(null);

  // Consulta al backend quién tiene la sesión iniciada (al arrancar la aplicación y tras el primer uso).
  cargar(): void {
    this.http
      .get<{ usuario: UsuarioSesion | null }>(`${this.baseUrl}/sesion`)
      .subscribe({ next: ({ usuario }) => this.usuario.set(conLogoAbsoluto(usuario)), error: () => this.usuario.set(null) });
  }

  // Si las credenciales no son correctas el backend responde 422 con la regla incumplida.
  iniciar(credenciales: Credenciales): Observable<UsuarioSesion> {
    return this.http.post<{ usuario: UsuarioSesion }>(`${this.baseUrl}/sesion`, credenciales).pipe(
      map(({ usuario }) => conLogoAbsoluto(usuario)!),
      tap((usuario) => this.usuario.set(usuario)),
    );
  }

  cerrar(): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/sesion`).pipe(tap(() => this.usuario.set(null)));
  }

  // Crea el usuario y su fotógrafo, y deja la sesión iniciada.
  registrar(datos: RegistroFotografo): Observable<UsuarioSesion> {
    return this.http.post<{ usuario: UsuarioSesion }>(`${this.baseUrl}/registro`, datos).pipe(
      map(({ usuario }) => conLogoAbsoluto(usuario)!),
      tap((usuario) => this.usuario.set(usuario)),
    );
  }
}

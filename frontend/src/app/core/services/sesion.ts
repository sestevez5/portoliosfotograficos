import { Service, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { Credenciales, Perfil, RegistroFotografo, UsuarioSesion } from '../models/catalogo.model';
import { Tema, TemaService } from './tema';

// La logoUrl y la fotoUrl del backend son rutas relativas a la API.
function conLogoAbsoluto<T extends { fotoUrl?: string; fotografo?: { logoUrl: string } }>(datos: T): T {
  return {
    ...datos,
    ...(datos.fotoUrl && { fotoUrl: `${API_BASE_URL}${datos.fotoUrl}` }),
    ...(datos.fotografo && { fotografo: { ...datos.fotografo, logoUrl: `${API_BASE_URL}${datos.fotografo.logoUrl}` } }),
  };
}

// Sesión del usuario. El token va en una cookie HttpOnly que gestiona el navegador (la página no
// lo ve); aquí solo se sabe quién tiene la sesión iniciada. Al iniciarla se aplica su tema
// preferido (Configuración). Todavía no se restringe nada con ella, salvo sus propias páginas
// ("Mi perfil" y "Configuración", guard conSesion).
@Service()
export class SesionService {
  private readonly http = inject(HttpClient);
  private readonly tema = inject(TemaService);
  private readonly baseUrl = `${API_BASE_URL}/api`;

  // null = sin sesión (también mientras no se ha consultado).
  readonly usuario = signal<UsuarioSesion | null>(null);

  // Consulta de la sesión al arrancar, compartida: el guard conSesion espera a que termine.
  private consulta: Observable<UsuarioSesion | null> | null = null;

  private establecer(usuario: UsuarioSesion | null): void {
    this.usuario.set(usuario && conLogoAbsoluto(usuario));
    if (usuario?.temaPreferido) {
      this.tema.elegir(usuario.temaPreferido);
    }
  }

  // Permisos (el backend los comprueba igualmente: esto solo decide qué se muestra). El
  // administrador puede gestionarlo todo; cualquier otro usuario, solo lo suyo; sin sesión, nada.
  // fotografo es el nombreInformalNormalizado (segmento de la URL) del dueño de lo que se muestra.
  esAdministrador(): boolean {
    return this.usuario()?.rol === 'administrador';
  }

  puedeGestionar(fotografo: string | null | undefined): boolean {
    const usuario = this.usuario();
    return !!usuario && (usuario.rol === 'administrador' || (!!fotografo && usuario.fotografo?.nombreInformalNormalizado === fotografo));
  }

  // Si ese fotógrafo es el del usuario con la sesión iniciada (el administrador no tiene).
  esSuFotografo(fotografo: string | null | undefined): boolean {
    return !!fotografo && this.usuario()?.fotografo?.nombreInformalNormalizado === fotografo;
  }

  // Quién tiene la sesión iniciada (se pregunta al backend una vez; después, lo ya sabido).
  comprobar(): Observable<UsuarioSesion | null> {
    this.consulta ??= this.http.get<{ usuario: UsuarioSesion | null }>(`${this.baseUrl}/sesion`).pipe(
      map(({ usuario }) => usuario),
      catchError(() => of(null)),
      tap((usuario) => this.establecer(usuario)),
      shareReplay(1),
    );
    return this.consulta.pipe(map(() => this.usuario()));
  }

  // Vuelve a consultar la sesión (p. ej. tras el primer uso, que la abre).
  cargar(): void {
    this.consulta = null;
    this.comprobar().subscribe();
  }

  // Si las credenciales no son correctas el backend responde 422 con la regla incumplida.
  iniciar(credenciales: Credenciales): Observable<UsuarioSesion> {
    return this.http.post<{ usuario: UsuarioSesion }>(`${this.baseUrl}/sesion`, credenciales).pipe(
      map(({ usuario }) => usuario),
      tap((usuario) => this.establecer(usuario)),
      map(() => this.usuario()!),
    );
  }

  cerrar(): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/sesion`).pipe(tap(() => this.usuario.set(null)));
  }

  // Crea el usuario y su fotógrafo, y deja la sesión iniciada.
  registrar(datos: RegistroFotografo): Observable<UsuarioSesion> {
    return this.http.post<{ usuario: UsuarioSesion }>(`${this.baseUrl}/registro`, datos).pipe(
      map(({ usuario }) => usuario),
      tap((usuario) => this.establecer(usuario)),
      map(() => this.usuario()!),
    );
  }

  // "Mi perfil": sus datos como usuario y, si lo es, como fotógrafo.
  perfil(): Observable<Perfil> {
    return this.http.get<Perfil>(`${this.baseUrl}/perfil`).pipe(map(conLogoAbsoluto));
  }

  // "Configuración": guarda su tema preferido y lo aplica ya.
  guardarTemaPreferido(tema: Tema): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/perfil/preferencias`, { temaPreferido: tema }).pipe(
      tap(() => {
        const usuario = this.usuario();
        if (usuario) {
          this.usuario.set({ ...usuario, temaPreferido: tema });
        }
        this.tema.elegir(tema);
      }),
    );
  }
}

import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { CambioContrasenya, EstadoAplicacion, PrimerUso } from '../models/album.model';
import { SesionService } from './sesion';

// Administrador de la aplicación ("admin") y primer uso. Mientras el administrador no ha entrado
// nunca, la aplicación está en su primer uso: el guard primerUsoPendiente lleva a la pantalla de
// bienvenida. Todavía no hay sesiones: cada operación envía las credenciales que necesita.
@Service()
export class AdministracionService {
  private readonly http = inject(HttpClient);
  private readonly sesion = inject(SesionService);
  private readonly baseUrl = `${API_BASE_URL}/api`;

  // Se pregunta al backend una sola vez y se recuerda (null = aún no se sabe). Solo puede pasar de
  // pendiente a completado, y eso lo hace completarPrimerUso().
  private primerUso: boolean | null = null;

  // Si no se puede consultar (p. ej. backend caído) no se bloquea la navegación.
  primerUsoPendiente(): Observable<boolean> {
    if (this.primerUso !== null) {
      return of(this.primerUso);
    }
    return this.http.get<EstadoAplicacion>(`${this.baseUrl}/estado`).pipe(
      map((estado) => estado.primerUso),
      tap((pendiente) => (this.primerUso = pendiente)),
      catchError(() => of(false)),
    );
  }

  // Si las credenciales no son correctas o la contraseña nueva no vale, el backend responde 422
  // con la regla incumplida. Si va bien, el administrador queda con la sesión iniciada.
  completarPrimerUso(datos: PrimerUso): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/admin/primer-uso`, datos).pipe(
      tap(() => {
        this.primerUso = false;
        this.sesion.cargar();
      }),
    );
  }

  cambiarContrasenya(datos: CambioContrasenya): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/admin/contrasenya`, datos);
  }
}

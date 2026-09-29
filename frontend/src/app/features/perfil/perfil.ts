import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { nombreCompleto } from '../../core/models/catalogo.model';
import { SesionService } from '../../core/services/sesion';
import { Avatar } from '../../shared/avatar/avatar';

// "Mi perfil" (/perfil, solo con sesión: guard conSesion): su foto y sus datos como usuario
// (cuenta) y, si lo es, como fotógrafo, con enlaces a su página y a editar sus datos (y su foto).
@Component({
  imports: [RouterLink, Avatar],
  selector: 'app-perfil',
  styleUrl: './perfil.scss',
  templateUrl: './perfil.html',
})
export class Perfil {
  protected readonly nombreCompleto = nombreCompleto;

  // undefined = cargando, null = no se ha podido cargar.
  protected readonly perfil = toSignal(inject(SesionService).perfil().pipe(catchError(() => of(null))));

  protected fecha(iso: string | undefined): string {
    return iso
      ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';
  }
}

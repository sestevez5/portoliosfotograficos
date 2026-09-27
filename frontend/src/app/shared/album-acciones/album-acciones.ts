import { Component, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AlbumResumen, ReglaNegocioIncumplida } from '../../core/models/album.model';
import { AlbumService } from '../../core/services/album';
import { Confirmacion } from '../confirmacion/confirmacion';

// Botones "Editar" y "Eliminar" de un álbum, para su fotógrafo propietario. Igual que con los
// portfolios, Eliminar pide primero al backend que borre sin confirmar: si el álbum no tiene fotos
// se elimina sin más; si las tiene, el backend responde con la regla ALBUM_ELIMINAR_CON_FOTOS y su
// mensaje (la advertencia, definida en el catálogo de reglas del backend) se muestra en un cuadro
// que ofrece seguir o no.
@Component({
  imports: [RouterLink, Confirmacion],
  selector: 'app-album-acciones',
  styleUrl: './album-acciones.scss',
  template: `
    <div class="acciones">
      <a
        class="accion"
        [routerLink]="['/gestion', fotografo(), 'portfolios', portfolio(), 'albumes', album().nombreNormalizado, 'editar']"
        >Editar</a
      >
      <button type="button" class="accion accion--peligro" [disabled]="eliminando()" (click)="eliminar()">
        {{ eliminando() ? 'Eliminando…' : 'Eliminar' }}
      </button>
    </div>
    @if (error(); as mensaje) {
      <p class="error" role="alert">{{ mensaje }}</p>
    }
    <app-confirmacion
      [abierto]="advertencia() !== null"
      titulo="Eliminar álbum"
      [mensaje]="advertencia() ?? ''"
      textoAceptar="Sí, eliminar"
      (aceptado)="confirmar()"
      (cancelado)="advertencia.set(null)"
    />
  `,
})
export class AlbumAcciones {
  private readonly albumService = inject(AlbumService);

  // Segmentos de URL del fotógrafo propietario y del portfolio del álbum.
  readonly fotografo = input.required<string>();
  readonly portfolio = input.required<string>();
  readonly album = input.required<Pick<AlbumResumen, 'nombre' | 'nombreNormalizado'>>();
  readonly eliminado = output<void>();

  protected readonly eliminando = signal(false);
  protected readonly advertencia = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected eliminar(): void {
    this.borrar(false);
  }

  protected confirmar(): void {
    this.advertencia.set(null);
    this.borrar(true);
  }

  private borrar(confirmar: boolean): void {
    this.eliminando.set(true);
    this.error.set(null);
    this.albumService
      .eliminarAlbum(this.fotografo(), this.portfolio(), this.album().nombreNormalizado, confirmar)
      .subscribe({
        next: () => {
          this.eliminando.set(false);
          this.eliminado.emit();
        },
        error: (respuesta: HttpErrorResponse) => {
          this.eliminando.set(false);
          const regla = respuesta.status === 422 ? (respuesta.error as ReglaNegocioIncumplida) : null;
          if (regla?.regla?.codigo === 'ALBUM_ELIMINAR_CON_FOTOS') {
            this.advertencia.set(regla.regla.mensaje);
          } else {
            this.error.set(regla?.message ?? respuesta.error?.message ?? 'No se ha podido eliminar el álbum.');
          }
        },
      });
  }
}

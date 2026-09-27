import { Component, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { PortfolioResumen, ReglaNegocioIncumplida } from '../../core/models/album.model';
import { AlbumService } from '../../core/services/album';
import { Confirmacion } from '../confirmacion/confirmacion';

// Botones "Editar" y "Eliminar" de un portfolio, para su fotógrafo propietario. Igual que con los
// fotógrafos, Eliminar pide primero al backend que borre sin confirmar: si el portfolio no tiene
// álbumes se elimina sin más; si los tiene, el backend responde con la regla
// PORTFOLIO_ELIMINAR_CON_ALBUMES y su mensaje (la advertencia, definida en el catálogo de reglas
// del backend) se muestra en un cuadro que ofrece seguir o no.
@Component({
  imports: [RouterLink, Confirmacion],
  selector: 'app-portfolio-acciones',
  styleUrl: './portfolio-acciones.scss',
  template: `
    <div class="acciones">
      <a class="accion" [routerLink]="['/gestion', fotografo(), 'portfolios', portfolio().nombreNormalizado, 'editar']">Editar</a>
      <button type="button" class="accion accion--peligro" [disabled]="eliminando()" (click)="eliminar()">
        {{ eliminando() ? 'Eliminando…' : 'Eliminar' }}
      </button>
    </div>
    @if (error(); as mensaje) {
      <p class="error" role="alert">{{ mensaje }}</p>
    }
    <app-confirmacion
      [abierto]="advertencia() !== null"
      titulo="Eliminar portfolio"
      [mensaje]="advertencia() ?? ''"
      textoAceptar="Sí, eliminar"
      (aceptado)="confirmar()"
      (cancelado)="advertencia.set(null)"
    />
  `,
})
export class PortfolioAcciones {
  private readonly albumService = inject(AlbumService);

  // nombreInformalNormalizado del fotógrafo propietario (segmento de URL).
  readonly fotografo = input.required<string>();
  readonly portfolio = input.required<Pick<PortfolioResumen, 'nombre' | 'nombreNormalizado'>>();
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
    this.albumService.eliminarPortfolio(this.fotografo(), this.portfolio().nombreNormalizado, confirmar).subscribe({
      next: () => {
        this.eliminando.set(false);
        this.eliminado.emit();
      },
      error: (respuesta: HttpErrorResponse) => {
        this.eliminando.set(false);
        const regla = respuesta.status === 422 ? (respuesta.error as ReglaNegocioIncumplida) : null;
        if (regla?.regla?.codigo === 'PORTFOLIO_ELIMINAR_CON_ALBUMES') {
          this.advertencia.set(regla.regla.mensaje);
        } else {
          this.error.set(regla?.message ?? respuesta.error?.message ?? 'No se ha podido eliminar el portfolio.');
        }
      },
    });
  }
}

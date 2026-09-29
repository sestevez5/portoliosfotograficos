import { Component, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ColeccionResumen, ReglaNegocioIncumplida } from '../../core/models/catalogo.model';
import { CatalogoService } from '../../core/services/catalogo';
import { SesionService } from '../../core/services/sesion';
import { Confirmacion } from '../confirmacion/confirmacion';

// Botones "Editar" y "Eliminar" de una colección, para su fotógrafo propietario. Igual que con los
// portfolios, Eliminar pide primero al backend que borre sin confirmar: si la colección no tiene fotos
// se elimina sin más; si las tiene, el backend responde con la regla COLECCION_ELIMINAR_CON_FOTOS y su
// mensaje (la advertencia, definida en el catálogo de reglas del backend) se muestra en un cuadro
// que ofrece seguir o no.
@Component({
  imports: [RouterLink, Confirmacion],
  selector: 'app-coleccion-acciones',
  styleUrl: './coleccion-acciones.scss',
  template: `
    <!-- Solo si el usuario puede gestionar lo de este fotógrafo (el suyo, o es el administrador).
         Los botones no se eliminan: sin permiso simplemente no se muestran. -->
    @if (visibles()) {
      <div class="acciones">
        <a
          class="accion"
          [routerLink]="['/gestion', fotografo(), 'portfolios', portfolio(), 'colecciones', coleccion().nombreNormalizado, 'editar']"
          >Editar</a
        >
        <button type="button" class="accion accion--peligro" [disabled]="eliminando()" (click)="eliminar()">
          {{ eliminando() ? 'Eliminando…' : 'Eliminar' }}
        </button>
      </div>
    }
    @if (error(); as mensaje) {
      <p class="error" role="alert">{{ mensaje }}</p>
    }
    <app-confirmacion
      [abierto]="advertencia() !== null"
      titulo="Eliminar colección"
      [mensaje]="advertencia() ?? ''"
      textoAceptar="Sí, eliminar"
      (aceptado)="confirmar()"
      (cancelado)="advertencia.set(null)"
    />
  `,
})
export class ColeccionAcciones {
  private readonly catalogoService = inject(CatalogoService);
  private readonly sesion = inject(SesionService);

  // Segmentos de URL del fotógrafo propietario y del portfolio dla colección.
  readonly fotografo = input.required<string>();
  readonly portfolio = input.required<string>();
  readonly coleccion = input.required<Pick<ColeccionResumen, 'nombre' | 'nombreNormalizado'>>();
  readonly eliminado = output<void>();

  // Sus botones solo se muestran a quien puede gestionarlo.
  protected readonly visibles = computed(() => this.sesion.puedeGestionar(this.fotografo()));

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
    this.catalogoService
      .eliminarColeccion(this.fotografo(), this.portfolio(), this.coleccion().nombreNormalizado, confirmar)
      .subscribe({
        next: () => {
          this.eliminando.set(false);
          this.eliminado.emit();
        },
        error: (respuesta: HttpErrorResponse) => {
          this.eliminando.set(false);
          const regla = respuesta.status === 422 ? (respuesta.error as ReglaNegocioIncumplida) : null;
          if (regla?.regla?.codigo === 'COLECCION_ELIMINAR_CON_FOTOS') {
            this.advertencia.set(regla.regla.mensaje);
          } else {
            this.error.set(regla?.message ?? respuesta.error?.message ?? 'No se ha podido eliminar la colección.');
          }
        },
      });
  }
}

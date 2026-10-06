import { Component, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FotografoPublico, ReglaNegocioIncumplida } from '../../core/models/catalogo.model';
import { CatalogoService } from '../../core/services/catalogo';
import { SesionService } from '../../core/services/sesion';
import { Confirmacion } from '../confirmacion/confirmacion';

// Botones "Editar" y "Eliminar" de un fotógrafo. Eliminar pide primero al backend que borre sin
// confirmar: si el fotógrafo no tiene portfolios se elimina sin más; si los tiene, el backend
// responde con la regla FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS y su mensaje (la advertencia, definida
// en el catálogo de reglas del backend) se muestra en un cuadro que ofrece seguir o no.
@Component({
  imports: [RouterLink, Confirmacion],
  selector: 'app-fotografo-acciones',
  styleUrl: './fotografo-acciones.scss',
  template: `
    <!-- Solo si el usuario puede gestionar lo de este fotógrafo (el suyo, o es el administrador).
         Los botones no se eliminan: sin permiso simplemente no se muestran. -->
    @if (visibles()) {
      <div class="acciones">
        @if (propio()) {
          <em class="propio">Tú</em>
        }
        <a class="accion" [routerLink]="['/admin/fotografos', fotografo().nombreInformalNormalizado, 'editar']">Editar</a>
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
      titulo="Eliminar fotógrafo"
      [mensaje]="advertencia() ?? ''"
      textoAceptar="Sí, eliminar"
      (aceptado)="confirmar()"
      (cancelado)="advertencia.set(null)"
    />
  `,
})
export class FotografoAcciones {
  private readonly catalogoService = inject(CatalogoService);
  private readonly sesion = inject(SesionService);

  readonly fotografo = input.required<Pick<FotografoPublico, 'nombreInformal' | 'nombreInformalNormalizado'>>();
  readonly eliminado = output<void>();
  // En la tarjeta de la portada: indica con "Tú" que el fotógrafo es el del usuario con la sesión iniciada.
  readonly indicarPropio = input(false);

  // Sus botones solo se muestran a quien puede gestionarlo.
  protected readonly visibles = computed(() => this.sesion.puedeGestionar(this.fotografo().nombreInformalNormalizado));

  protected readonly propio = computed(
    () => this.indicarPropio() && this.sesion.esSuFotografo(this.fotografo().nombreInformalNormalizado),
  );

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
    this.catalogoService.eliminarFotografo(this.fotografo().nombreInformalNormalizado, confirmar).subscribe({
      next: () => {
        this.eliminando.set(false);
        this.eliminado.emit();
      },
      error: (respuesta: HttpErrorResponse) => {
        this.eliminando.set(false);
        const regla = respuesta.status === 422 ? (respuesta.error as ReglaNegocioIncumplida) : null;
        if (regla?.regla?.codigo === 'FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS') {
          this.advertencia.set(regla.regla.mensaje);
        } else {
          this.error.set(regla?.message ?? respuesta.error?.message ?? 'No se ha podido eliminar el fotógrafo.');
        }
      },
    });
  }
}

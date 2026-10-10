import { Component, input, output } from '@angular/core';
import { Visibilidad } from '../../core/models/catalogo.model';

// Visibilidad de un portfolio o una colección para los demás usuarios, en sus páginas de gestión:
// tres botones juntos, el ojo (visible: cualquiera lo ve y entra), el candado (bloqueado: lo ven, pero
// no pueden entrar) y el ojo tachado (oculto: no lo ven). El elegido va resaltado; pulsar otro pide el
// cambio (cambiar) y quien lo usa lo guarda. Su fotógrafo y el administrador lo ven y entran siempre.
@Component({
  selector: 'app-selector-visibilidad',
  styleUrl: './selector-visibilidad.scss',
  template: `
    <div class="selector" role="radiogroup" [attr.aria-label]="'Visibilidad para los demás usuarios: ' + nombre()">
      @for (opcion of opciones; track opcion.valor) {
        <button
          type="button"
          role="radio"
          class="selector__opcion"
          [class.selector__opcion--elegida]="visibilidad() === opcion.valor"
          [attr.aria-checked]="visibilidad() === opcion.valor"
          [attr.aria-label]="opcion.texto"
          [title]="opcion.texto"
          [disabled]="desactivado()"
          (click)="visibilidad() !== opcion.valor && cambiar.emit(opcion.valor)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            @switch (opcion.valor) {
              @case ('bloqueado') {
                <rect x="5" y="11" width="14" height="9.5" rx="1.5" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              }
              @default {
                <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
                @if (opcion.valor === 'oculto') {
                  <path d="M4 3.5l16 17" />
                }
              }
            }
          </svg>
        </button>
      }
    </div>
  `,
})
export class SelectorVisibilidad {
  readonly visibilidad = input.required<Visibilidad>();
  // Nombre del portfolio o la colección, para los lectores de pantalla.
  readonly nombre = input.required<string>();
  readonly desactivado = input(false);
  readonly cambiar = output<Visibilidad>();

  protected readonly opciones: { valor: Visibilidad; texto: string }[] = [
    { valor: 'visible', texto: 'Visible: cualquiera lo ve y entra' },
    { valor: 'bloqueado', texto: 'Bloqueado: los demás lo ven, pero no pueden entrar' },
    { valor: 'oculto', texto: 'Oculto: los demás no lo ven' },
  ];
}

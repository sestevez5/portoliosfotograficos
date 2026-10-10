import { Component, inject } from '@angular/core';
import { MarcoService } from '../../core/services/marco';

// Selector del marco de las fotos (con marco / sin marco) de la franja superior, junto al del tema y
// con su mismo aspecto (sus estilos). Solo se muestra en la página de una colección (app.html).
@Component({
  selector: 'app-selector-marco',
  styleUrl: '../selector-tema/selector-tema.scss',
  template: `
    <div class="selector" role="radiogroup" aria-label="Fotos">
      @for (opcion of opciones; track opcion.texto) {
        <button
          type="button"
          role="radio"
          class="selector__opcion"
          [class.selector__opcion--activa]="marco.conMarco() === opcion.conMarco"
          [attr.aria-checked]="marco.conMarco() === opcion.conMarco"
          [title]="opcion.titulo"
          (click)="marco.elegir(opcion.conMarco)"
        >
          {{ opcion.texto }}
        </button>
      }
    </div>
  `,
})
export class SelectorMarco {
  protected readonly marco = inject(MarcoService);

  protected readonly opciones = [
    { conMarco: true, texto: 'Con marco', titulo: 'Fotos con marco' },
    { conMarco: false, texto: 'Sin marco', titulo: 'Fotos sin marco' },
  ];
}

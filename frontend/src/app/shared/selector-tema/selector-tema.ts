import { Component, inject } from '@angular/core';
import { Tema, TemaService } from '../../core/services/tema';

// Selector del tema (oscuro / claro) de la franja superior de la página.
@Component({
  selector: 'app-selector-tema',
  styleUrl: './selector-tema.scss',
  template: `
    <div class="selector" role="radiogroup" aria-label="Tema">
      @for (opcion of opciones; track opcion.valor) {
        <button
          type="button"
          role="radio"
          class="selector__opcion"
          [class.selector__opcion--activa]="tema.tema() === opcion.valor"
          [attr.aria-checked]="tema.tema() === opcion.valor"
          (click)="tema.elegir(opcion.valor)"
        >
          {{ opcion.texto }}
        </button>
      }
    </div>
  `,
})
export class SelectorTema {
  protected readonly tema = inject(TemaService);

  protected readonly opciones: { valor: Tema; texto: string }[] = [
    { valor: 'oscuro', texto: 'Oscuro' },
    { valor: 'claro', texto: 'Claro' },
  ];
}

import { Component, input, output } from '@angular/core';

// Ojo de la visibilidad de un portfolio o una colección, en sus páginas de gestión (como la estrella
// de la portada): un ojo si lo puede ver cualquiera, un ojo tachado si está oculto a los demás
// usuarios (solo lo ven su fotógrafo y el administrador). Pulsarlo pide el cambio (cambiar); quien
// lo usa lo guarda.
@Component({
  selector: 'app-ojo-visibilidad',
  styleUrl: './ojo-visibilidad.scss',
  template: `
    <button
      type="button"
      class="ojo"
      [class.ojo--oculto]="!visible()"
      [attr.aria-pressed]="visible()"
      [attr.aria-label]="'Visible para los demás usuarios: ' + nombre()"
      [title]="
        visible()
          ? 'Visible para cualquiera (pulsa para ocultar a los demás usuarios)'
          : 'Sin acceso para los demás usuarios (pulsa para dar acceso a cualquiera)'
      "
      [disabled]="desactivado()"
      (click)="cambiar.emit(!visible())"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        @if (!visible()) {
          <path d="M4 3.5l16 17" />
        }
      </svg>
    </button>
  `,
})
export class OjoVisibilidad {
  readonly visible = input.required<boolean>();
  // Nombre del portfolio o la colección, para los lectores de pantalla.
  readonly nombre = input.required<string>();
  readonly desactivado = input(false);
  // El valor que se pide: true = visible para cualquiera.
  readonly cambiar = output<boolean>();
}

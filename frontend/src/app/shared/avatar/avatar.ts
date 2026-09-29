import { Component, computed, input } from '@angular/core';

// Círculo con la foto de perfil del usuario o, si no tiene, con sus iniciales (hasta dos: "Santi
// Estévez" -> "SE"). El tamaño se da en rem.
@Component({
  selector: 'app-avatar',
  styleUrl: './avatar.scss',
  template: `
    <span class="avatar" [style.--tamanyo.rem]="tamanyo()" aria-hidden="true">
      @if (fotoUrl()) {
        <img class="avatar__foto" [src]="fotoUrl()" alt="" />
      } @else {
        {{ iniciales() }}
      }
    </span>
  `,
})
export class Avatar {
  readonly nombre = input.required<string>();
  readonly fotoUrl = input<string | undefined>();
  readonly tamanyo = input(1.875);

  protected readonly iniciales = computed(() =>
    this.nombre()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((palabra) => palabra[0].toUpperCase())
      .join(''),
  );
}

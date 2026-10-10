import { Component, computed, input } from '@angular/core';
import { Visibilidad } from '../../core/models/catalogo.model';

// Marca de un portfolio o una colección que los demás usuarios no ven del todo, en las páginas del
// catálogo: el ojo tachado y "Oculto" (no lo ven) o el candado y "Bloqueado" (lo ven, pero no pueden
// entrar). La ven su fotógrafo y el administrador; con "Bloqueado", también quien no puede entrar, en
// la tarjeta, para saber por qué no se abre. Con la clase "sobre-portada" va en la esquina de la
// portada de una tarjeta.
@Component({
  selector: 'app-marca-visibilidad',
  styleUrl: './marca-visibilidad.scss',
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      @if (visibilidad() === 'bloqueado') {
        <rect x="5" y="11" width="14" height="9.5" rx="1.5" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      } @else {
        <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        <path d="M4 3.5l16 17" />
      }
    </svg>
    {{ texto() }}
  `,
  host: { '[attr.title]': 'explicacion()' },
})
export class MarcaVisibilidad {
  readonly visibilidad = input<Visibilidad>('oculto');
  // Para las colecciones: "Oculta", "Bloqueada".
  readonly femenina = input(false);

  protected readonly texto = computed(() =>
    this.visibilidad() === 'bloqueado' ? (this.femenina() ? 'Bloqueada' : 'Bloqueado') : this.femenina() ? 'Oculta' : 'Oculto',
  );
  protected readonly explicacion = computed(() =>
    this.visibilidad() === 'bloqueado' ? 'Los demás usuarios lo ven, pero no pueden entrar' : 'Los demás usuarios no pueden verlo',
  );
}

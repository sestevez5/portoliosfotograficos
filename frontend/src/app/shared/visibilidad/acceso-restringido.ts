import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

// Página de un portfolio o una colección bloqueados (visibilidad 'bloqueado') para quien no es su
// fotógrafo ni el administrador: se sabe que existen, pero no se puede entrar. La API responde 403 con
// tipo "accesoRestringido" (esAccesoRestringido() en core/services/catalogo.ts). Normalmente no se
// llega aquí desde la web (sus tarjetas no son enlaces), sino escribiendo la dirección.
@Component({
  imports: [RouterLink],
  selector: 'app-acceso-restringido',
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
      margin-top: var(--space-4);
    }
    svg {
      width: 2.5rem;
      height: 2.5rem;
      fill: none;
      stroke: var(--color-text-muted);
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    p {
      color: var(--color-text-muted);
    }
  `,
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9.5" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
    <h1>Acceso restringido</h1>
    <p>{{ que() }} existe, pero su autor no permite entrar.</p>
    @if (volver(); as ruta) {
      <a [routerLink]="ruta">{{ textoVolver() }}</a>
    }
  `,
})
export class AccesoRestringido {
  // "Este portfolio" o "Esta colección".
  readonly que = input.required<string>();
  readonly volver = input<string[] | null>(null);
  readonly textoVolver = input('Volver');
}

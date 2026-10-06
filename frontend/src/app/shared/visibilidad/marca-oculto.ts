import { Component, input } from '@angular/core';

// Marca de un portfolio o una colección ocultos a los demás usuarios (el ojo tachado y "Oculto"), en
// las páginas del catálogo. Solo la ve quien puede verlos: su fotógrafo y el administrador. Con la
// clase "sobre-portada" va en la esquina de la portada de una tarjeta.
@Component({
  selector: 'app-marca-oculto',
  styleUrl: './marca-oculto.scss',
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 3.5l16 17" />
    </svg>
    {{ texto() }}
  `,
  host: { title: 'Los demás usuarios no pueden verlo' },
})
export class MarcaOculto {
  // "Oculto" (portfolio) u "Oculta" (colección).
  readonly texto = input('Oculto');
}

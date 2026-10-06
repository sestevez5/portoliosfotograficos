import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

// Lleva a la vista el aviso en cuanto aparece. Los avisos de error de los formularios están al
// principio, y quien acaba de pulsar el botón del final no los vería sin subir a buscarlos:
//
//   @if (reglaIncumplida(); as regla) {
//     <div class="aviso" role="alert" appAvisoVisible>…</div>
//   }
//
// Actúa al crearse el elemento, así que el aviso debe desaparecer antes de cada nuevo envío (los
// formularios lo ponen a null al enviar) para que vuelva a desplazarse si se repite el error.
@Directive({ selector: '[appAvisoVisible]' })
export class AvisoVisible {
  constructor() {
    const elemento = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      // jsdom (tests) no implementa scrollIntoView.
      if (typeof elemento.scrollIntoView !== 'function') return;
      const sinAnimaciones = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      elemento.scrollIntoView({ behavior: sinAnimaciones ? 'auto' : 'smooth', block: 'center' });
    });
  }
}

import { Directive, ElementRef, inject } from '@angular/core';

// Para un texto de una sola línea recortado con puntos suspensivos (text-overflow: ellipsis): al
// pasar el ratón por encima muestra el texto entero como tooltip (atributo title), pero solo si de
// verdad no cabe; si cabe entero, no hay tooltip que repita lo mismo.
@Directive({
  selector: '[appTextoRecortado]',
  host: { '(mouseenter)': 'actualizar()' },
})
export class TextoRecortado {
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  protected actualizar(): void {
    const elemento = this.elemento.nativeElement;
    if (elemento.scrollWidth > elemento.clientWidth) {
      elemento.title = elemento.textContent?.trim() ?? '';
    } else {
      elemento.removeAttribute('title');
    }
  }
}

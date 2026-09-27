import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

// Cuadro de diálogo modal para confirmar una acción: muestra un mensaje y ofrece seguir o no.
// Se abre mientras "abierto" es true. Escape o "Cancelar" emiten cancelado; el botón de
// aceptar emite aceptado.
@Component({
  selector: 'app-confirmacion',
  styleUrl: './confirmacion.scss',
  template: `
    <dialog #dialogo class="confirmacion" (cancel)="$event.preventDefault(); cancelado.emit()">
      <p class="confirmacion__titulo">{{ titulo() }}</p>
      <p class="confirmacion__mensaje">{{ mensaje() }}</p>
      <div class="confirmacion__acciones">
        <button type="button" class="boton boton--peligro" (click)="aceptado.emit()">{{ textoAceptar() }}</button>
        <button type="button" class="boton" (click)="cancelado.emit()" autofocus>Cancelar</button>
      </div>
    </dialog>
  `,
})
export class Confirmacion {
  readonly abierto = input(false);
  readonly titulo = input('¿Continuar?');
  readonly mensaje = input.required<string>();
  readonly textoAceptar = input('Sí, continuar');

  readonly aceptado = output<void>();
  readonly cancelado = output<void>();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    // showModal()/close() pueden no existir fuera de un navegador real (p. ej. en los tests).
    effect(() => {
      const dialogo = this.dialogo().nativeElement;
      if (this.abierto() && !dialogo.open) {
        if (typeof dialogo.showModal === 'function') dialogo.showModal();
        else dialogo.setAttribute('open', '');
      } else if (!this.abierto() && dialogo.open) {
        if (typeof dialogo.close === 'function') dialogo.close();
        else dialogo.removeAttribute('open');
      }
    });
  }
}

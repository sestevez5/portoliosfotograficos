import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

// Cuadro de diálogo modal que informa de algo (p. ej. que una operación ha terminado bien) y solo
// ofrece "Aceptar". Mismo aspecto que el de confirmación (shared/confirmacion/). Se abre mientras
// "abierto" es true; "Aceptar" o Escape emiten cerrado.
@Component({
  selector: 'app-notificacion',
  styleUrl: '../confirmacion/confirmacion.scss',
  template: `
    <dialog #dialogo class="confirmacion" role="alertdialog" (cancel)="$event.preventDefault(); cerrado.emit()">
      <p class="confirmacion__titulo">{{ titulo() }}</p>
      <p class="confirmacion__mensaje">{{ mensaje() }}</p>
      <div class="confirmacion__acciones">
        <button type="button" class="boton" (click)="cerrado.emit()" autofocus>Aceptar</button>
      </div>
    </dialog>
  `,
})
export class Notificacion {
  readonly abierto = input(false);
  readonly titulo = input.required<string>();
  readonly mensaje = input.required<string>();

  readonly cerrado = output<void>();

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

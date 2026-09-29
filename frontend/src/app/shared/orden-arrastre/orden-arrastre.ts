import { WritableSignal, signal } from '@angular/core';

// Ordenar una lista arrastrando sus elementos con el drag & drop nativo del navegador (sin
// librerías; no funciona en pantallas táctiles). La usan "Gestionar fotos", "Ordenar portfolios" y "Gestionar colecciones".
//
// Al pasar el elemento arrastrado sobre otro, ocupa su sitio (los demás se desplazan) y la lista
// muestra el resultado en el momento; al soltarlo se llama a guardar() con el orden nuevo y el que
// había al empezar (para volver a él si no se puede guardar). Escape cancela el arrastre y deja el
// orden como estaba.
//
// En la plantilla, cada elemento lleva:
//   [attr.draggable]="permitido" (dragstart)="orden.empezar($event, elemento, permitido)"
//   (dragover)="orden.pasarSobre($event, elemento)" (dragend)="orden.terminar($event)"
export class OrdenPorArrastre<T> {
  // Clave del elemento que se está arrastrando (null si no se arrastra nada).
  readonly arrastrado = signal<string | null>(null);
  private alEmpezar: T[] = [];
  // Último elemento con el que se ha intercambiado. Si los elementos tienen alturas distintas (las
  // fotos, con su proporción original), tras el intercambio puede quedar justo bajo el puntero y
  // se volverían a intercambiar una y otra vez: se ignora hasta que el puntero pasa a otro.
  private ultimoDestino: string | null = null;

  constructor(
    private readonly lista: WritableSignal<T[]>,
    private readonly clave: (elemento: T) => string,
    private readonly guardar: (ahora: T[], antes: T[]) => void,
  ) {}

  empezar(evento: DragEvent, elemento: T, permitido: boolean): void {
    if (!permitido || !evento.dataTransfer) {
      evento.preventDefault();
      return;
    }
    evento.dataTransfer.effectAllowed = 'move';
    evento.dataTransfer.setData('text/plain', this.clave(elemento)); // Firefox no arrastra sin datos
    this.alEmpezar = this.lista();
    this.ultimoDestino = null;
    this.arrastrado.set(this.clave(elemento));
  }

  pasarSobre(evento: DragEvent, destino: T): void {
    const arrastrado = this.arrastrado();
    if (arrastrado === null) {
      return; // no es uno de nuestros elementos (p. ej. un archivo del equipo)
    }
    evento.preventDefault();
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'move';
    const claveDestino = this.clave(destino);
    if (claveDestino === arrastrado) {
      this.ultimoDestino = null;
      return;
    }
    if (claveDestino === this.ultimoDestino) {
      return;
    }
    this.ultimoDestino = claveDestino;
    this.lista.update((lista) => {
      const desde = lista.findIndex((e) => this.clave(e) === arrastrado);
      const hasta = lista.findIndex((e) => this.clave(e) === claveDestino);
      const resultado = [...lista];
      resultado.splice(hasta, 0, ...resultado.splice(desde, 1));
      return resultado;
    });
  }

  terminar(evento: DragEvent): void {
    if (this.arrastrado() === null) {
      return;
    }
    this.arrastrado.set(null);
    const antes = this.alEmpezar;
    // dropEffect 'none': arrastre cancelado (Escape o soltado fuera de la página).
    if (evento.dataTransfer?.dropEffect === 'none') {
      this.lista.set(antes);
      return;
    }
    const ahora = this.lista();
    if (ahora.every((e, i) => this.clave(e) === this.clave(antes[i]))) {
      return;
    }
    this.guardar(ahora, antes);
  }
}

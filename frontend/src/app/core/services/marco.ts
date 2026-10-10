import { DOCUMENT, Service, effect, inject, signal } from '@angular/core';

const CLAVE = 'marco';

// Marco de las fotos de una colección (miniaturas de su página y visor a pantalla completa): sin
// marco por defecto; con marco, data-marco="con" en <html>, y las fotos llevan un borde del color
// --color-marco de styles.scss, el opuesto al fondo del tema (blanco en el oscuro, negro en el claro).
// Se elige en la franja superior (shared/selector-marco/, solo en la página de una colección) y se
// recuerda en este navegador (localStorage); index.html la aplica antes de pintar, como el tema.
@Service()
export class MarcoService {
  private readonly documento = inject(DOCUMENT);

  readonly conMarco = signal<boolean>(leerGuardado());

  constructor() {
    effect(() => {
      const conMarco = this.conMarco();
      const raiz = this.documento.documentElement;
      if (conMarco) {
        raiz.dataset['marco'] = 'con';
      } else {
        delete raiz.dataset['marco'];
      }
      try {
        localStorage.setItem(CLAVE, conMarco ? 'con' : 'sin');
      } catch {
        // Sin almacenamiento (p. ej. navegación privada estricta): dura hasta recargar.
      }
    });
  }

  elegir(conMarco: boolean): void {
    this.conMarco.set(conMarco);
  }
}

function leerGuardado(): boolean {
  try {
    return localStorage.getItem(CLAVE) === 'con';
  } catch {
    return false;
  }
}

import { DOCUMENT, Service, effect, inject, signal } from '@angular/core';

export type Tema = 'oscuro' | 'claro';

const CLAVE = 'tema';

// Tema de la página: el oscuro es el predeterminado y el claro se activa con data-tema="claro" en
// <html>, que redefine los tokens de color de styles.scss. La elección se recuerda en este
// navegador (localStorage); index.html la aplica antes de pintar para que no haya parpadeo.
@Service()
export class TemaService {
  private readonly documento = inject(DOCUMENT);

  readonly tema = signal<Tema>(leerGuardado());

  constructor() {
    effect(() => {
      const tema = this.tema();
      const raiz = this.documento.documentElement;
      if (tema === 'claro') {
        raiz.dataset['tema'] = 'claro';
      } else {
        delete raiz.dataset['tema'];
      }
      try {
        localStorage.setItem(CLAVE, tema);
      } catch {
        // Sin almacenamiento (p. ej. navegación privada estricta): el tema dura hasta recargar.
      }
    });
  }

  elegir(tema: Tema): void {
    this.tema.set(tema);
  }
}

function leerGuardado(): Tema {
  try {
    return localStorage.getItem(CLAVE) === 'claro' ? 'claro' : 'oscuro';
  } catch {
    return 'oscuro';
  }
}

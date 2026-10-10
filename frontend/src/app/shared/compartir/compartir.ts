import { Component, DOCUMENT, ElementRef, inject, signal, viewChild } from '@angular/core';
import { enlaceVistaLimpia } from '../../core/services/vista-limpia';

// Icono "compartir", junto al título de las páginas de fotógrafo, portfolio y colección (no en su
// vista limpia). Abre un diálogo con el enlace de la página en su vista limpia (?limpia=true: la
// página sin la aplicación, para enseñarla) y un botón para copiarlo.
@Component({
  selector: 'app-compartir',
  styleUrl: './compartir.scss',
  template: `
    <button type="button" class="boton-compartir" aria-label="Compartir esta página" title="Compartir" (click)="abrir()">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="18" cy="5" r="2.6" />
        <circle cx="6" cy="12" r="2.6" />
        <circle cx="18" cy="19" r="2.6" />
        <path d="M8.3 10.8 15.7 6.3M8.3 13.2l7.4 4.5" />
      </svg>
    </button>

    <dialog #dialogo class="compartir" aria-labelledby="compartir-titulo">
      <p id="compartir-titulo" class="compartir__titulo">Comparte este enlace si quieres compartir esta página</p>
      <div class="compartir__enlace">
        <input #campo class="compartir__url" type="text" readonly [value]="enlace()" aria-label="Enlace de la página" (focus)="campo.select()" />
        <button type="button" class="compartir__copiar" aria-label="Copiar el enlace" title="Copiar" (click)="copiar(campo)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="8.5" y="8.5" width="11" height="12" rx="1.5" />
            <path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 5v10A1.5 1.5 0 0 0 6 16.5h2.5" />
          </svg>
        </button>
      </div>
      <p class="compartir__estado" role="status">{{ estado() }}</p>
      <div class="compartir__acciones">
        <button type="button" class="boton" (click)="cerrar()" autofocus>Cerrar</button>
      </div>
    </dialog>
  `,
})
export class Compartir {
  private readonly documento = inject(DOCUMENT);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  protected readonly enlace = signal('');
  // "Enlace copiado" o el aviso si no se ha podido (vacío mientras no se pulsa copiar).
  protected readonly estado = signal('');

  protected abrir(): void {
    const { origin, pathname } = this.documento.location;
    this.enlace.set(origin + enlaceVistaLimpia(pathname));
    this.estado.set('');
    const dialogo = this.dialogo().nativeElement;
    // showModal() puede no existir fuera de un navegador real (p. ej. en los tests).
    if (typeof dialogo.showModal === 'function') dialogo.showModal();
    else dialogo.setAttribute('open', '');
  }

  protected cerrar(): void {
    const dialogo = this.dialogo().nativeElement;
    if (typeof dialogo.close === 'function') dialogo.close();
    else dialogo.removeAttribute('open');
  }

  // El portapapeles moderno solo existe en un contexto seguro (https o localhost); servida por http
  // (p. ej. en el NAS, en la red local) se copia seleccionando el texto del campo.
  protected async copiar(campo: HTMLInputElement): Promise<void> {
    try {
      if (this.documento.defaultView?.isSecureContext && navigator.clipboard) {
        await navigator.clipboard.writeText(this.enlace());
      } else {
        campo.select();
        if (!this.documento.execCommand('copy')) throw new Error('copy');
      }
      this.estado.set('Enlace copiado.');
    } catch {
      campo.select();
      this.estado.set('No se ha podido copiar: cópialo a mano (ya está seleccionado).');
    }
  }
}

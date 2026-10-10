import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { AcercaDe as DatosAcercaDe } from '../../core/models/catalogo.model';
import { CatalogoService } from '../../core/services/catalogo';

// Fecha AAAA-MM-DD en español ("7 de octubre de 2026"), sin cambios de día por la zona horaria.
function fechaLarga(fecha: string): string {
  const [anyo, mes, dia] = fecha.split('-').map(Number);
  return new Date(anyo, mes - 1, dia).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Botón "?" de la franja superior. Abre "Acerca de" (versión de la aplicación y de la base de datos,
// cada una con su fecha, y el autor) y, desde ahí, el manual del fotógrafo en un diálogo a casi toda
// la pantalla: al cerrarlo se vuelve a la aplicación, a la página en la que se estaba.
@Component({
  selector: 'app-acerca-de',
  styleUrl: './acerca-de.scss',
  template: `
    <button type="button" class="boton-ayuda" aria-label="Acerca de" title="Acerca de" (click)="abrir()">?</button>

    <dialog #dialogo class="acerca-de" aria-labelledby="acerca-de-titulo">
      <p id="acerca-de-titulo" class="acerca-de__titulo">Acerca de</p>
      <p class="acerca-de__aplicacion">Portfolios fotográficos<span>.</span></p>
      @if (datos(); as d) {
        <dl class="acerca-de__datos">
          <dt>Versión de la aplicación</dt>
          <dd>{{ d.aplicacion.version }} · {{ fechaLarga(d.aplicacion.fecha) }}</dd>
          <dt>Versión de la base de datos</dt>
          <dd>{{ d.baseDatos.version }} · {{ fechaLarga(d.baseDatos.fecha) }}</dd>
          <dt>Autor</dt>
          <dd>{{ d.autor }}</dd>
        </dl>
      } @else if (error()) {
        <p class="acerca-de__error" role="alert">No se han podido consultar las versiones.</p>
      } @else {
        <p class="acerca-de__cargando">Cargando…</p>
      }
      <div class="acerca-de__acciones">
        <button type="button" class="boton boton--principal" (click)="abrirManual()">Manual del fotógrafo</button>
        <button type="button" class="boton" (click)="cerrar()" autofocus>Cerrar</button>
      </div>
    </dialog>

    <dialog #manual class="manual" aria-label="Manual del fotógrafo" (close)="manualAbierto.set(false)">
      <div class="manual__barra">
        <p class="manual__titulo">Manual del fotógrafo</p>
        <button type="button" class="manual__cerrar" aria-label="Cerrar el manual" title="Cerrar" (click)="cerrarManual()">×</button>
      </div>
      <!-- Solo se carga al abrirlo (pesa, con sus capturas). La página (relativa al <base href>) la
           genera docs/generar-html.mjs a partir de docs/funcional/manual-del-fotografo.md. -->
      @if (manualAbierto()) {
        <iframe class="manual__pagina" src="ayuda/manual-del-fotografo.html" title="Manual del fotógrafo"></iframe>
      }
    </dialog>
  `,
})
export class AcercaDe {
  private readonly catalogoService = inject(CatalogoService);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly manual = viewChild.required<ElementRef<HTMLDialogElement>>('manual');

  protected readonly fechaLarga = fechaLarga;
  protected readonly datos = signal<DatosAcercaDe | null>(null);
  protected readonly error = signal(false);
  protected readonly manualAbierto = signal(false);

  protected abrir(): void {
    // Se consulta cada vez que se abre (si antes falló, se vuelve a intentar).
    this.error.set(false);
    this.catalogoService.getAcercaDe().subscribe({
      next: (datos) => this.datos.set(datos),
      error: () => this.error.set(true),
    });
    mostrar(this.dialogo().nativeElement);
  }

  protected cerrar(): void {
    cerrar(this.dialogo().nativeElement);
  }

  // El manual se abre sobre la aplicación; "Acerca de" se cierra, así que al cerrar el manual se
  // vuelve directamente a la página en la que se estaba.
  protected abrirManual(): void {
    this.cerrar();
    this.manualAbierto.set(true);
    mostrar(this.manual().nativeElement);
  }

  protected cerrarManual(): void {
    cerrar(this.manual().nativeElement);
  }
}

// showModal()/close() pueden no existir fuera de un navegador real (p. ej. en los tests).
function mostrar(dialogo: HTMLDialogElement): void {
  if (dialogo.open) return;
  if (typeof dialogo.showModal === 'function') dialogo.showModal();
  else dialogo.setAttribute('open', '');
}

function cerrar(dialogo: HTMLDialogElement): void {
  if (!dialogo.open) return;
  if (typeof dialogo.close === 'function') dialogo.close();
  else {
    dialogo.removeAttribute('open');
    dialogo.dispatchEvent(new Event('close'));
  }
}

import { Component, HostListener, input, output } from '@angular/core';
import { Foto } from '../../core/models/catalogo.model';
import { ANCHO_GRANDE, conAncho } from '../foto-reducida/foto-reducida';

// Muestra siempre la versión grande de la foto (3840 px de lado largo como máximo), la de pantalla completa.
@Component({
  selector: 'app-lightbox',
  styleUrl: './lightbox.scss',
  templateUrl: './lightbox.html',
})
export class Lightbox {
  readonly photos = input.required<Foto[]>();
  readonly index = input.required<number>();

  readonly closeRequested = output<void>();
  readonly indexChange = output<number>();

  protected readonly grande = (url: string) => conAncho(url, ANCHO_GRANDE);

  protected get current(): Foto {
    return this.photos()[this.index()];
  }

  protected close(): void {
    this.closeRequested.emit();
  }

  protected goTo(delta: number): void {
    const total = this.photos().length;
    const next = (this.index() + delta + total) % total;
    this.indexChange.emit(next);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
    if (event.key === 'ArrowRight') this.goTo(1);
    if (event.key === 'ArrowLeft') this.goTo(-1);
  }
}

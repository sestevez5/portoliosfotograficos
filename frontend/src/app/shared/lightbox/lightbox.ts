import { Component, HostListener, input, output } from '@angular/core';
import { Photo } from '../../core/models/album.model';

@Component({
  imports: [],
  selector: 'app-lightbox',
  styleUrl: './lightbox.scss',
  templateUrl: './lightbox.html',
})
export class Lightbox {
  readonly photos = input.required<Photo[]>();
  readonly index = input.required<number>();

  readonly closeRequested = output<void>();
  readonly indexChange = output<number>();

  protected get current(): Photo {
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

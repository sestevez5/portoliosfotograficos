import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AlbumService } from '../../core/services/album';
import { Lightbox } from '../../shared/lightbox/lightbox';

@Component({
  imports: [RouterLink, Lightbox],
  selector: 'app-album-detail',
  styleUrl: './album-detail.scss',
  templateUrl: './album-detail.html',
})
export class AlbumDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly albumService = inject(AlbumService);

  protected readonly fotografoSlug = toSignal(this.route.paramMap.pipe(map((params) => params.get('fotografo')!)));

  // undefined = cargando, null = álbum no encontrado para ese fotógrafo
  protected readonly album = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) =>
        this.albumService
          .getAlbumDeFotografo(params.get('fotografo')!, params.get('id')!)
          .pipe(catchError(() => of(null))),
      ),
    ),
  );

  protected readonly lightboxIndex = signal<number | null>(null);

  protected openLightbox(index: number): void {
    this.lightboxIndex.set(index);
  }

  protected closeLightbox(): void {
    this.lightboxIndex.set(null);
  }
}

import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AlbumService } from '../../core/services/album';
import { AlbumAcciones } from '../../shared/album-acciones/album-acciones';
import { Lightbox } from '../../shared/lightbox/lightbox';

@Component({
  imports: [RouterLink, Lightbox, AlbumAcciones],
  selector: 'app-album-detail',
  styleUrl: './album-detail.scss',
  templateUrl: './album-detail.html',
})
export class AlbumDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly albumService = inject(AlbumService);
  private readonly router = inject(Router);

  protected readonly segmentoFotografo = toSignal(this.route.paramMap.pipe(map((params) => params.get('fotografo')!)));

  // undefined = cargando, null = álbum no encontrado en ese portfolio
  protected readonly album = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) =>
        this.albumService
          .getAlbumDePortfolio(params.get('fotografo')!, params.get('portfolio')!, params.get('album')!)
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

  // Tras eliminar el álbum se vuelve a los álbumes de su portfolio.
  protected alEliminar(portfolio: string): void {
    this.router.navigate(['/', this.segmentoFotografo(), portfolio]);
  }
}

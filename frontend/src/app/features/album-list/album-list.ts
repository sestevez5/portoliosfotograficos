import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap } from 'rxjs';
import { AlbumService } from '../../core/services/album';
import { AlbumAcciones } from '../../shared/album-acciones/album-acciones';
import { PortfolioAcciones } from '../../shared/portfolio-acciones/portfolio-acciones';

@Component({
  imports: [RouterLink, PortfolioAcciones, AlbumAcciones],
  selector: 'app-album-list',
  styleUrl: './album-list.scss',
  templateUrl: './album-list.html',
})
export class AlbumList {
  private readonly route = inject(ActivatedRoute);
  private readonly albumService = inject(AlbumService);
  private readonly router = inject(Router);

  protected readonly segmentoFotografo = toSignal(this.route.paramMap.pipe(map((params) => params.get('fotografo')!)));

  // Se emite para volver a cargar el portfolio (tras eliminar uno de sus álbumes).
  private readonly recarga = new BehaviorSubject<void>(undefined);

  // undefined = cargando, null = portfolio no encontrado para ese fotógrafo
  protected readonly portfolio = toSignal(
    combineLatest([this.route.paramMap, this.recarga]).pipe(
      switchMap(([params]) =>
        this.albumService
          .getPortfolio(params.get('fotografo')!, params.get('portfolio')!)
          .pipe(catchError(() => of(null))),
      ),
    ),
  );

  // Tras eliminar el portfolio se vuelve a los portfolios del fotógrafo.
  protected alEliminar(): void {
    this.router.navigate(['/', this.segmentoFotografo()]);
  }

  protected alEliminarAlbum(): void {
    this.recarga.next();
  }
}

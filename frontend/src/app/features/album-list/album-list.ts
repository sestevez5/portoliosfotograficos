import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AlbumService } from '../../core/services/album';

@Component({
  imports: [RouterLink],
  selector: 'app-album-list',
  styleUrl: './album-list.scss',
  templateUrl: './album-list.html',
})
export class AlbumList {
  private readonly route = inject(ActivatedRoute);
  private readonly albumService = inject(AlbumService);

  protected readonly fotografoSlug = toSignal(this.route.paramMap.pipe(map((params) => params.get('fotografo')!)));

  // undefined = cargando, null = portfolio no encontrado para ese fotógrafo
  protected readonly portfolio = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) =>
        this.albumService
          .getPortfolio(params.get('fotografo')!, params.get('portfolio')!)
          .pipe(catchError(() => of(null))),
      ),
    ),
  );
}

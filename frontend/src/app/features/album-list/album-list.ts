import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
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

  // undefined = cargando, null = fotógrafo no encontrado
  protected readonly fotografo = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) =>
        this.albumService.getFotografo(params.get('fotografo')!).pipe(catchError(() => of(null))),
      ),
    ),
  );
}

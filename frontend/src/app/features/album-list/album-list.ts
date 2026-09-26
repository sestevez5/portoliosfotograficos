import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
  private readonly router = inject(Router);

  // Solo se ofrece "Volver" si se ha llegado navegando desde la portada, no al entrar
  // directamente por URL o al recargar (en ese caso no hay navegación previa).
  protected readonly desdeInicio = (() => {
    const navigation = this.router.currentNavigation() ?? this.router.lastSuccessfulNavigation();
    return navigation?.previousNavigation?.finalUrl?.toString() === '/';
  })();

  // undefined = cargando, null = fotógrafo no encontrado
  protected readonly fotografo = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) =>
        this.albumService.getFotografo(params.get('fotografo')!).pipe(catchError(() => of(null))),
      ),
    ),
  );
}

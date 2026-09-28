import { Component, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { catchError, filter, map, of, switchMap } from 'rxjs';
import { nombreCompleto } from './core/models/album.model';
import { AlbumService } from './core/services/album';
import { UsuarioSesion } from './shared/usuario-sesion/usuario-sesion';

@Component({
  imports: [RouterLink, RouterOutlet, UsuarioSesion],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  private readonly albumService = inject(AlbumService);

  protected readonly nombreCompleto = nombreCompleto;

  // Segmento de URL del fotógrafo presente en la ruta activa (null en la portada).
  private readonly segmentoFotografo = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => {
        let route = this.router.routerState.snapshot.root;
        while (route.firstChild) {
          route = route.firstChild;
        }
        return route.paramMap.get('fotografo');
      }),
    ),
    { initialValue: null },
  );

  protected readonly fotografo = toSignal(
    toObservable(this.segmentoFotografo).pipe(
      switchMap((segmento) =>
        segmento ? this.albumService.getFotografo(segmento).pipe(catchError(() => of(null))) : of(null),
      ),
    ),
    { initialValue: null },
  );
}

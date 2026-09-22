import { Component, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { catchError, filter, map, of, switchMap } from 'rxjs';
import { AlbumService } from './core/services/album';

@Component({
  imports: [RouterLink, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  private readonly albumService = inject(AlbumService);

  // Slug del fotógrafo presente en la ruta activa (null en la portada).
  private readonly slug = toSignal(
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
    toObservable(this.slug).pipe(
      switchMap((slug) =>
        slug ? this.albumService.getFotografo(slug).pipe(catchError(() => of(null))) : of(null),
      ),
    ),
    { initialValue: null },
  );
}

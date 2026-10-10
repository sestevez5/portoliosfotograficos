import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { catchError, filter, map, of, switchMap } from 'rxjs';
import { nombreCompleto } from './core/models/catalogo.model';
import { CatalogoService } from './core/services/catalogo';
import { VistaLimpiaService, esVistaLimpia } from './core/services/vista-limpia';
import { AcercaDe } from './shared/acerca-de/acerca-de';
import { SelectorTema } from './shared/selector-tema/selector-tema';
import { SelectorMarco } from './shared/selector-marco/selector-marco';
import { UsuarioSesion } from './shared/usuario-sesion/usuario-sesion';

@Component({
  imports: [RouterLink, RouterOutlet, AcercaDe, SelectorTema, SelectorMarco, UsuarioSesion],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  private readonly catalogoService = inject(CatalogoService);
  // Se crea aquí, al arrancar, para que recuerde desde la primera navegación qué páginas se
  // abrieron en su vista limpia; el logo vuelve al fotógrafo como se vio por última vez.
  protected readonly vistas = inject(VistaLimpiaService);

  protected readonly nombreCompleto = nombreCompleto;

  // Ruta activa más interna, tras cada navegación (null antes de la primera).
  private readonly rutaActiva = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => {
        let route = this.router.routerState.snapshot.root;
        while (route.firstChild) {
          route = route.firstChild;
        }
        return route;
      }),
    ),
    { initialValue: null },
  );

  // Segmento de URL del fotógrafo presente en la ruta activa (null en la portada).
  private readonly segmentoFotografo = computed(() => this.rutaActiva()?.paramMap.get('fotografo') ?? null);

  // Si la página es la de una colección (la única con fotos sueltas): entonces se ofrece el marco.
  protected readonly enColeccion = computed(() => {
    const ruta = this.rutaActiva();
    return !!ruta && ruta.data['admiteVistaLimpia'] === true && ruta.paramMap.has('coleccion');
  });

  // Vista limpia (?limpia=true en una página del catálogo, las rutas con data.admiteVistaLimpia): la
  // página sin la franja superior de la aplicación, para mostrarla como si no formara parte de ella.
  protected readonly vistaLimpia = computed(() => {
    const ruta = this.rutaActiva();
    return !!ruta && ruta.data['admiteVistaLimpia'] === true && esVistaLimpia(ruta.queryParamMap);
  });

  protected readonly fotografo = toSignal(
    toObservable(this.segmentoFotografo).pipe(
      switchMap((segmento) =>
        segmento ? this.catalogoService.getFotografo(segmento).pipe(catchError(() => of(null))) : of(null),
      ),
    ),
    { initialValue: null },
  );
}

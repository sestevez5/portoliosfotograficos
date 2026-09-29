import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap } from 'rxjs';
import { CatalogoService } from '../../core/services/catalogo';
import { SesionService } from '../../core/services/sesion';
import { ColeccionAcciones } from '../../shared/coleccion-acciones/coleccion-acciones';
import { PortfolioAcciones } from '../../shared/portfolio-acciones/portfolio-acciones';
import { TextoRecortado } from '../../shared/texto-recortado/texto-recortado';
import { FotoReducida } from '../../shared/foto-reducida/foto-reducida';

@Component({
  imports: [RouterLink, PortfolioAcciones, ColeccionAcciones, TextoRecortado, FotoReducida],
  selector: 'app-coleccion-list',
  styleUrl: './coleccion-list.scss',
  templateUrl: './coleccion-list.html',
})
export class ColeccionList {
  private readonly route = inject(ActivatedRoute);
  private readonly catalogoService = inject(CatalogoService);
  private readonly router = inject(Router);
  protected readonly sesion = inject(SesionService);

  protected readonly segmentoFotografo = toSignal(this.route.paramMap.pipe(map((params) => params.get('fotografo')!)));

  // Se emite para volver a cargar el portfolio (tras eliminar uno de sus colecciones).
  private readonly recarga = new BehaviorSubject<void>(undefined);

  // undefined = cargando, null = portfolio no encontrado para ese fotógrafo
  protected readonly portfolio = toSignal(
    combineLatest([this.route.paramMap, this.recarga]).pipe(
      switchMap(([params]) =>
        this.catalogoService
          .getPortfolio(params.get('fotografo')!, params.get('portfolio')!)
          .pipe(catchError(() => of(null))),
      ),
    ),
  );

  // Tras eliminar el portfolio se vuelve a los portfolios del fotógrafo.
  protected alEliminar(): void {
    this.router.navigate(['/', this.segmentoFotografo()]);
  }

  protected alEliminarColeccion(): void {
    this.recarga.next();
  }
}

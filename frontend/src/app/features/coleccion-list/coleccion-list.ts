import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap } from 'rxjs';
import { CatalogoService, esAccesoRestringido } from '../../core/services/catalogo';
import { SesionService } from '../../core/services/sesion';
import { VistaLimpiaService, esVistaLimpia } from '../../core/services/vista-limpia';
import { ColeccionAcciones } from '../../shared/coleccion-acciones/coleccion-acciones';
import { PortfolioAcciones } from '../../shared/portfolio-acciones/portfolio-acciones';
import { TextoRecortado } from '../../shared/texto-recortado/texto-recortado';
import { FotoReducida } from '../../shared/foto-reducida/foto-reducida';
import { MarcaVisibilidad } from '../../shared/visibilidad/marca-visibilidad';
import { AccesoRestringido } from '../../shared/visibilidad/acceso-restringido';
import { Compartir } from '../../shared/compartir/compartir';

@Component({
  imports: [RouterLink, PortfolioAcciones, ColeccionAcciones, TextoRecortado, FotoReducida, MarcaVisibilidad, AccesoRestringido, NgTemplateOutlet, Compartir],
  selector: 'app-coleccion-list',
  styleUrl: './coleccion-list.scss',
  templateUrl: './coleccion-list.html',
})
export class ColeccionList {
  private readonly route = inject(ActivatedRoute);
  private readonly catalogoService = inject(CatalogoService);
  private readonly router = inject(Router);
  protected readonly sesion = inject(SesionService);
  // Los enlaces de vuelta abren la página de destino como se vio por última vez (limpia o no).
  protected readonly vistas = inject(VistaLimpiaService);

  // Vista limpia (/:fotografo/:portfolio?limpia=true): sin enlace de vuelta, etiqueta (número de
  // colecciones) ni mantenimiento. Las colecciones se abren en su página normal: ?limpia=true solo lo
  // escribe el usuario, la navegación nunca lo añade.
  protected readonly vistaLimpia = toSignal(this.route.queryParamMap.pipe(map(esVistaLimpia)), {
    initialValue: esVistaLimpia(this.route.snapshot.queryParamMap),
  });

  protected readonly segmentoFotografo = toSignal(this.route.paramMap.pipe(map((params) => params.get('fotografo')!)));

  // Se emite para volver a cargar el portfolio (tras eliminar uno de sus colecciones).
  private readonly recarga = new BehaviorSubject<void>(undefined);

  // Si es un portfolio bloqueado para quien mira (existe, pero no puede entrar).
  protected readonly restringido = signal(false);

  // undefined = cargando, null = portfolio no encontrado para ese fotógrafo (o restringido)
  protected readonly portfolio = toSignal(
    combineLatest([this.route.paramMap, this.recarga]).pipe(
      switchMap(([params]) => {
        this.restringido.set(false);
        return this.catalogoService.getPortfolio(params.get('fotografo')!, params.get('portfolio')!).pipe(
          catchError((error) => {
            this.restringido.set(esAccesoRestringido(error));
            return of(null);
          }),
        );
      }),
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

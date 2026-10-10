import { Component, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap } from 'rxjs';
import { nombreCompleto } from '../../core/models/catalogo.model';
import { CatalogoService } from '../../core/services/catalogo';
import { SesionService } from '../../core/services/sesion';
import { esVistaLimpia } from '../../core/services/vista-limpia';
import { FotografoAcciones } from '../../shared/fotografo-acciones/fotografo-acciones';
import { PortfolioAcciones } from '../../shared/portfolio-acciones/portfolio-acciones';
import { TextoRecortado } from '../../shared/texto-recortado/texto-recortado';
import { MarcaVisibilidad } from '../../shared/visibilidad/marca-visibilidad';
import { FotoReducida } from '../../shared/foto-reducida/foto-reducida';
import { Compartir } from '../../shared/compartir/compartir';

@Component({
  imports: [RouterLink, FotografoAcciones, PortfolioAcciones, TextoRecortado, FotoReducida, MarcaVisibilidad, NgTemplateOutlet, Compartir],
  selector: 'app-portfolio-list',
  styleUrl: './portfolio-list.scss',
  templateUrl: './portfolio-list.html',
})
export class PortfolioList {
  private readonly route = inject(ActivatedRoute);
  private readonly catalogoService = inject(CatalogoService);
  private readonly router = inject(Router);
  protected readonly sesion = inject(SesionService);

  protected readonly nombreCompleto = nombreCompleto;

  // Vista limpia (/:fotografo?limpia=true): sin enlace de vuelta, etiqueta (número de portfolios), número
  // de colecciones, marcas de oculto ni mantenimiento. Los portfolios se abren en su página normal:
  // ?limpia=true solo lo escribe el usuario, la navegación nunca lo añade.
  protected readonly vistaLimpia = toSignal(this.route.queryParamMap.pipe(map(esVistaLimpia)), {
    initialValue: esVistaLimpia(this.route.snapshot.queryParamMap),
  });

  // Solo se ofrece "Volver" si se ha llegado navegando desde la portada, no al entrar
  // directamente por URL o al recargar (en ese caso no hay navegación previa).
  protected readonly desdeInicio = (() => {
    const navigation = this.router.currentNavigation() ?? this.router.lastSuccessfulNavigation();
    return navigation?.previousNavigation?.finalUrl?.toString() === '/';
  })();

  // Se emite para volver a cargar el fotógrafo (tras eliminar uno de sus portfolios).
  private readonly recarga = new BehaviorSubject<void>(undefined);

  // undefined = cargando, null = fotógrafo no encontrado
  protected readonly fotografo = toSignal(
    combineLatest([this.route.paramMap, this.recarga]).pipe(
      switchMap(([params]) =>
        this.catalogoService.getFotografo(params.get('fotografo')!).pipe(catchError(() => of(null))),
      ),
    ),
  );

  protected alEliminar(): void {
    this.router.navigate(['/']);
  }

  protected alEliminarPortfolio(): void {
    this.recarga.next();
  }
}

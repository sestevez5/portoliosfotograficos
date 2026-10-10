import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { CatalogoService, esAccesoRestringido } from '../../core/services/catalogo';
import { SesionService } from '../../core/services/sesion';
import { VistaLimpiaService, esVistaLimpia } from '../../core/services/vista-limpia';
import { ColeccionAcciones } from '../../shared/coleccion-acciones/coleccion-acciones';
import { Lightbox } from '../../shared/lightbox/lightbox';
import { TextoRecortado } from '../../shared/texto-recortado/texto-recortado';
import { FotoReducida } from '../../shared/foto-reducida/foto-reducida';
import { MarcaVisibilidad } from '../../shared/visibilidad/marca-visibilidad';
import { AccesoRestringido } from '../../shared/visibilidad/acceso-restringido';
import { Compartir } from '../../shared/compartir/compartir';

@Component({
  imports: [RouterLink, Lightbox, ColeccionAcciones, TextoRecortado, FotoReducida, MarcaVisibilidad, AccesoRestringido, Compartir],
  selector: 'app-coleccion-detail',
  styleUrl: './coleccion-detail.scss',
  templateUrl: './coleccion-detail.html',
})
export class ColeccionDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly catalogoService = inject(CatalogoService);
  private readonly router = inject(Router);
  protected readonly sesion = inject(SesionService);
  // Los enlaces de vuelta abren la página de destino como se vio por última vez (limpia o no).
  protected readonly vistas = inject(VistaLimpiaService);

  // Vista limpia (/:fotografo/:portfolio/:coleccion?limpia=true): sin enlace de vuelta, etiqueta (número de
  // fotos) ni mantenimiento.
  protected readonly vistaLimpia = toSignal(this.route.queryParamMap.pipe(map(esVistaLimpia)), {
    initialValue: esVistaLimpia(this.route.snapshot.queryParamMap),
  });

  protected readonly segmentoFotografo = toSignal(this.route.paramMap.pipe(map((params) => params.get('fotografo')!)));

  // Si es una colección bloqueada (o de un portfolio bloqueado) para quien mira.
  protected readonly restringido = signal(false);

  // undefined = cargando, null = colección no encontrada en ese portfolio (o restringida)
  protected readonly coleccion = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) => {
        this.restringido.set(false);
        return this.catalogoService
          .getColeccionDePortfolio(params.get('fotografo')!, params.get('portfolio')!, params.get('coleccion')!)
          .pipe(
            catchError((error) => {
              this.restringido.set(esAccesoRestringido(error));
              return of(null);
            }),
          );
      }),
    ),
  );

  protected readonly lightboxIndex = signal<number | null>(null);

  protected openLightbox(index: number): void {
    this.lightboxIndex.set(index);
  }

  protected closeLightbox(): void {
    this.lightboxIndex.set(null);
  }

  // Tras eliminar la colección se vuelve a las colecciones de su portfolio.
  protected alEliminar(portfolio: string): void {
    this.router.navigate(['/', this.segmentoFotografo(), portfolio]);
  }
}

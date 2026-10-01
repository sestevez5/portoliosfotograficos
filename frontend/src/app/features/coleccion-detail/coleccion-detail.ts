import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { CatalogoService } from '../../core/services/catalogo';
import { SesionService } from '../../core/services/sesion';
import { ColeccionAcciones } from '../../shared/coleccion-acciones/coleccion-acciones';
import { Lightbox } from '../../shared/lightbox/lightbox';
import { TextoRecortado } from '../../shared/texto-recortado/texto-recortado';
import { FotoReducida } from '../../shared/foto-reducida/foto-reducida';
import { MarcaOculto } from '../../shared/visibilidad/marca-oculto';

@Component({
  imports: [RouterLink, Lightbox, ColeccionAcciones, TextoRecortado, FotoReducida, MarcaOculto],
  selector: 'app-coleccion-detail',
  styleUrl: './coleccion-detail.scss',
  templateUrl: './coleccion-detail.html',
})
export class ColeccionDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly catalogoService = inject(CatalogoService);
  private readonly router = inject(Router);
  protected readonly sesion = inject(SesionService);

  protected readonly segmentoFotografo = toSignal(this.route.paramMap.pipe(map((params) => params.get('fotografo')!)));

  // undefined = cargando, null = colección no encontrada en ese portfolio
  protected readonly coleccion = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) =>
        this.catalogoService
          .getColeccionDePortfolio(params.get('fotografo')!, params.get('portfolio')!, params.get('coleccion')!)
          .pipe(catchError(() => of(null))),
      ),
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

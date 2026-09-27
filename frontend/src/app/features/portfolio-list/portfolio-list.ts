import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, of, switchMap } from 'rxjs';
import { AlbumService } from '../../core/services/album';
import { FotografoAcciones } from '../../shared/fotografo-acciones/fotografo-acciones';
import { PortfolioAcciones } from '../../shared/portfolio-acciones/portfolio-acciones';

@Component({
  imports: [RouterLink, FotografoAcciones, PortfolioAcciones],
  selector: 'app-portfolio-list',
  styleUrl: './portfolio-list.scss',
  templateUrl: './portfolio-list.html',
})
export class PortfolioList {
  private readonly route = inject(ActivatedRoute);
  private readonly albumService = inject(AlbumService);
  private readonly router = inject(Router);

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
        this.albumService.getFotografo(params.get('fotografo')!).pipe(catchError(() => of(null))),
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

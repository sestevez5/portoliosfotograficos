import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FotografoDetalle, PortfolioResumen, ReglaNegocioIncumplida, nombreCompleto } from '../../core/models/catalogo.model';
import { CatalogoService } from '../../core/services/catalogo';
import { OrdenPorArrastre } from '../../shared/orden-arrastre/orden-arrastre';
import { FotoReducida } from '../../shared/foto-reducida/foto-reducida';
import { OjoVisibilidad } from '../../shared/visibilidad/ojo-visibilidad';

// "Gestionar portfolios" de un fotógrafo, para él mismo (/gestion/:fotografo/portfolios/ordenar): sus
// portfolios en una cuadrícula, que se ordenan arrastrándolos al lugar que deben ocupar, igual que
// las colecciones en "Gestionar colecciones". Al soltar se guarda el orden nuevo; si no se puede,
// vuelve al anterior. El ojo de cada portfolio indica si lo ven los demás usuarios (pulsarlo lo
// oculta, con todas sus colecciones, o lo muestra).
@Component({
  imports: [RouterLink, FotoReducida, OjoVisibilidad],
  selector: 'app-portfolio-orden',
  styleUrl: './portfolio-orden.scss',
  templateUrl: './portfolio-orden.html',
})
export class PortfolioOrden {
  private readonly catalogoService = inject(CatalogoService);

  protected readonly fotografoSegmento = inject(ActivatedRoute).snapshot.paramMap.get('fotografo')!;
  protected readonly volver = ['/', this.fotografoSegmento];
  protected readonly nombreCompleto = nombreCompleto;

  // undefined = cargando, null = no encontrado
  protected readonly fotografo = signal<FotografoDetalle | null | undefined>(undefined);
  protected readonly portfolios = signal<PortfolioResumen[]>([]);

  protected readonly guardando = signal(false);
  // Error al guardar el orden o al cambiar la visibilidad.
  protected readonly aviso = signal<{ titulo: string; mensaje: string } | null>(null);
  protected readonly cambiandoVisibilidad = signal(false);
  protected readonly puedeOrdenar = computed(() => this.portfolios().length > 1 && !this.guardando());

  protected readonly orden = new OrdenPorArrastre(
    this.portfolios,
    (portfolio) => portfolio.nombreNormalizado,
    (ahora, antes) => this.guardar(ahora, antes),
  );

  constructor() {
    this.catalogoService.getFotografo(this.fotografoSegmento).subscribe({
      next: (fotografo) => {
        this.fotografo.set(fotografo);
        this.portfolios.set(fotografo.portfolios);
      },
      error: () => this.fotografo.set(null),
    });
  }

  private guardar(ahora: PortfolioResumen[], antes: PortfolioResumen[]): void {
    this.aviso.set(null);
    this.guardando.set(true);
    const nombres = ahora.map((p) => p.nombreNormalizado);
    this.catalogoService.ordenarPortfolios(this.fotografoSegmento, nombres).subscribe({
      next: () => this.guardando.set(false),
      error: (respuesta: HttpErrorResponse) => {
        this.guardando.set(false);
        this.portfolios.set(antes);
        this.aviso.set({
          titulo: 'No se ha podido guardar el nuevo orden',
          mensaje: mensajeDeError(respuesta, 'No se ha podido guardar el nuevo orden.'),
        });
      },
    });
  }

  protected cambiarVisibilidad(portfolio: PortfolioResumen, visible: boolean): void {
    const poner = (valor: boolean) =>
      this.portfolios.update((lista) => lista.map((p) => (p.nombreNormalizado === portfolio.nombreNormalizado ? { ...p, visible: valor } : p)));
    poner(visible); // se marca ya; si no se puede guardar, vuelve a como estaba
    this.cambiandoVisibilidad.set(true);
    this.aviso.set(null);
    this.catalogoService.cambiarVisibilidadPortfolio(this.fotografoSegmento, portfolio.nombreNormalizado, visible).subscribe({
      next: () => this.cambiandoVisibilidad.set(false),
      error: (respuesta: HttpErrorResponse) => {
        this.cambiandoVisibilidad.set(false);
        poner(!visible);
        this.aviso.set({
          titulo: 'No se ha podido cambiar la visibilidad',
          mensaje: mensajeDeError(respuesta, 'No se ha podido cambiar la visibilidad del portfolio.'),
        });
      },
    });
  }
}

// El motivo de una regla incumplida (422) o el mensaje del backend; si no hay, el texto indicado.
function mensajeDeError(respuesta: HttpErrorResponse, porDefecto: string): string {
  return respuesta.status === 422 && respuesta.error?.tipo === 'reglaNegocioIncumplida'
    ? (respuesta.error as ReglaNegocioIncumplida).regla.mensaje
    : (respuesta.error?.message ?? porDefecto);
}

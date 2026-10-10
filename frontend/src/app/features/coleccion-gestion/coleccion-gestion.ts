import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ColeccionResumen, Visibilidad, PortfolioDetalle, ReglaNegocioIncumplida } from '../../core/models/catalogo.model';
import { CatalogoService } from '../../core/services/catalogo';
import { OrdenPorArrastre } from '../../shared/orden-arrastre/orden-arrastre';
import { FotoReducida } from '../../shared/foto-reducida/foto-reducida';
import { SelectorVisibilidad } from '../../shared/visibilidad/selector-visibilidad';

// "Gestionar colecciones" de un portfolio, para su fotógrafo propietario
// (/gestion/:fotografo/portfolios/:portfolio/colecciones/gestionar): las colecciones en una
// cuadrícula, que se ordenan arrastrándolas al lugar que deben ocupar, igual que las fotos en
// "Gestionar fotos". Al soltar se guarda el orden nuevo; si no se puede, vuelve al anterior. La
// estrella de cada colección elige la que da su portada al portfolio (pulsar la elegida la quita:
// entonces es la primera) y el ojo indica si la ven los demás usuarios (pulsarlo la oculta o la muestra).
@Component({
  imports: [RouterLink, FotoReducida, SelectorVisibilidad],
  selector: 'app-coleccion-gestion',
  styleUrl: './coleccion-gestion.scss',
  templateUrl: './coleccion-gestion.html',
})
export class ColeccionGestion {
  private readonly catalogoService = inject(CatalogoService);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly fotografo = this.params.get('fotografo')!;
  protected readonly portfolioSegmento = this.params.get('portfolio')!;
  protected readonly volver = ['/', this.fotografo, this.portfolioSegmento];

  // undefined = cargando, null = no encontrado
  protected readonly portfolio = signal<PortfolioDetalle | null | undefined>(undefined);
  protected readonly colecciones = signal<ColeccionResumen[]>([]);

  protected readonly guardando = signal(false);
  // Error al guardar el orden o al cambiar la portada o la visibilidad.
  protected readonly aviso = signal<{ titulo: string; mensaje: string } | null>(null);
  protected readonly puedeOrdenar = computed(() => this.colecciones().length > 1 && !this.guardando());

  // Colección elegida como portada del portfolio (su nombreNormalizado), o null si no hay ninguna.
  protected readonly portada = signal<string | null>(null);
  protected readonly cambiandoPortada = signal(false);
  protected readonly cambiandoVisibilidad = signal(false);

  protected readonly orden = new OrdenPorArrastre(
    this.colecciones,
    (coleccion) => coleccion.nombreNormalizado,
    (ahora, antes) => this.guardar(ahora, antes),
  );

  constructor() {
    this.catalogoService.getPortfolio(this.fotografo, this.portfolioSegmento).subscribe({
      next: (portfolio) => {
        this.portfolio.set(portfolio);
        this.colecciones.set(portfolio.colecciones);
        this.portada.set(portfolio.coleccionPortada ?? null);
      },
      error: () => this.portfolio.set(null),
    });
  }

  private guardar(ahora: ColeccionResumen[], antes: ColeccionResumen[]): void {
    this.aviso.set(null);
    this.guardando.set(true);
    const nombres = ahora.map((c) => c.nombreNormalizado);
    this.catalogoService.ordenarColecciones(this.fotografo, this.portfolioSegmento, nombres).subscribe({
      next: () => this.guardando.set(false),
      error: (respuesta: HttpErrorResponse) => {
        this.guardando.set(false);
        this.colecciones.set(antes);
        this.aviso.set({
          titulo: 'No se ha podido guardar el nuevo orden',
          mensaje: mensajeDeError(respuesta, 'No se ha podido guardar el nuevo orden.'),
        });
      },
    });
  }

  protected cambiarVisibilidad(coleccion: ColeccionResumen, visibilidad: Visibilidad): void {
    const antes = coleccion.visibilidad;
    const poner = (valor: Visibilidad) =>
      this.colecciones.update((lista) =>
        lista.map((c) => (c.nombreNormalizado === coleccion.nombreNormalizado ? { ...c, visibilidad: valor, visible: valor !== 'oculto' } : c)),
      );
    poner(visibilidad); // se marca ya; si no se puede guardar, vuelve a como estaba
    this.cambiandoVisibilidad.set(true);
    this.aviso.set(null);
    this.catalogoService.cambiarVisibilidadColeccion(this.fotografo, this.portfolioSegmento, coleccion.nombreNormalizado, visibilidad).subscribe({
      next: () => this.cambiandoVisibilidad.set(false),
      error: (respuesta: HttpErrorResponse) => {
        this.cambiandoVisibilidad.set(false);
        poner(antes);
        this.aviso.set({
          titulo: 'No se ha podido cambiar la visibilidad',
          mensaje: mensajeDeError(respuesta, 'No se ha podido cambiar la visibilidad de la colección.'),
        });
      },
    });
  }

  protected alternarPortada(coleccion: ColeccionResumen): void {
    const antes = this.portada();
    const nueva = antes === coleccion.nombreNormalizado ? null : coleccion.nombreNormalizado;
    this.portada.set(nueva); // se marca ya; si no se puede guardar, vuelve a como estaba
    this.cambiandoPortada.set(true);
    this.aviso.set(null);
    this.catalogoService.cambiarPortadaPortfolio(this.fotografo, this.portfolioSegmento, nueva).subscribe({
      next: () => this.cambiandoPortada.set(false),
      error: (respuesta: HttpErrorResponse) => {
        this.cambiandoPortada.set(false);
        this.portada.set(antes);
        this.aviso.set({
          titulo: 'No se ha podido cambiar la portada',
          mensaje: mensajeDeError(respuesta, 'No se ha podido cambiar la portada del portfolio.'),
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

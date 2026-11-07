import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import {
  ColeccionDetalle,
  FotografoDetalle,
  PortfolioDetalle,
  nombreCompleto,
} from '../models/catalogo.model';

// Título, descripción, URL canónica y si se puede indexar cada página (SEO).
//
// Al abrir una dirección, el backend ya sirve el index.html con todo eso en el <head>, además de la
// vista previa para compartir (Open Graph) y los datos estructurados (backend:
// services/seo.service.ts). Al navegar dentro de la web, lo actualiza este servicio, con los mismos
// títulos y descripciones (si cambian allí, hay que cambiarlos también aquí): es lo que ve Google
// cuando ejecuta la página, y el título de la pestaña del navegador.
//
// Tras cada navegación se ponen los valores generales (sin indexar, salvo la portada); las páginas
// del catálogo ponen los suyos al cargar sus datos (fotografo(), portfolio(), coleccion()).

export const NOMBRE_SITIO = 'Portfolios fotográficos';
const DESCRIPCION_SITIO = 'Portfolios y colecciones de fotografía de autor.';
const LONGITUD_DESCRIPCION = 160;

// Sin saltos de línea ni espacios repetidos, y recortada (por una palabra) si no cabe en un resultado
// de Google. Igual que recortarDescripcion() del backend.
export function recortarDescripcion(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= LONGITUD_DESCRIPCION) {
    return limpio;
  }
  const corte = limpio.slice(0, LONGITUD_DESCRIPCION - 1);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > LONGITUD_DESCRIPCION / 2 ? corte.slice(0, espacio) : corte).replace(/[\s.,;:]+$/, '')}…`;
}

interface DatosPagina {
  titulo: string;
  descripcion: string;
  // Ruta canónica ("/ana/viajes"), sin la consulta. Sin ella, la página no tiene URL canónica.
  ruta?: string;
  indexable: boolean;
}

@Service()
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);

  constructor() {
    let primera = true;
    this.router.events.pipe(filter((evento) => evento instanceof NavigationEnd)).subscribe(() => {
      // La vista previa y los datos estructurados que puso el backend son los de la página con la que
      // se abrió la web: al pasar a otra ya no valen (y nadie los vuelve a leer: los buscadores y las
      // redes sociales abren cada dirección desde cero).
      if (!primera) {
        this.quitarDeLaPrimeraPagina();
      }
      primera = false;
      // Las páginas del catálogo ponen los suyos en cuanto cargan sus datos; mientras, se dejan los
      // que hay (al abrir la web, los que ha puesto el backend, que son ya los buenos).
      let activa = this.router.routerState.snapshot.root;
      while (activa.firstChild) {
        activa = activa.firstChild;
      }
      if (activa.data['admiteVistaLimpia'] === true) {
        return;
      }
      const esPortada = !this.router.parseUrl(this.router.url).root.children['primary'];
      this.aplicar({ titulo: NOMBRE_SITIO, descripcion: DESCRIPCION_SITIO, ruta: esPortada ? '/' : undefined, indexable: esPortada });
    });
  }

  fotografo(f: FotografoDetalle): void {
    this.aplicar({
      titulo: `${f.nombreInformal} · ${NOMBRE_SITIO}`,
      descripcion: recortarDescripcion(f.descripcion || `Portfolios fotográficos de ${nombreCompleto(f)}.`),
      ruta: `/${f.nombreInformalNormalizado}`,
      indexable: true,
    });
  }

  portfolio(p: PortfolioDetalle): void {
    this.aplicar({
      titulo: `${p.nombre} · ${p.fotografo.nombreInformal}`,
      descripcion: recortarDescripcion(p.descripcion || `Portfolio «${p.nombre}» de ${p.fotografo.nombreInformal}.`),
      ruta: `/${p.fotografo.nombreInformalNormalizado}/${p.nombreNormalizado}`,
      indexable: p.visibilidad === 'visible',
    });
  }

  coleccion(a: ColeccionDetalle): void {
    const numero = `${a.fotos.length} ${a.fotos.length === 1 ? 'foto' : 'fotos'}`;
    this.aplicar({
      titulo: `${a.nombre} · ${a.portfolio.nombre} · ${a.fotografo.nombreInformal}`,
      descripcion: recortarDescripcion(
        a.descripcion ||
          `Colección «${a.nombre}» del portfolio «${a.portfolio.nombre}» de ${a.fotografo.nombreInformal}: ${numero}.`,
      ),
      ruta: `/${a.fotografo.nombreInformalNormalizado}/${a.portfolio.nombreNormalizado}/${a.nombreNormalizado}`,
      indexable: a.visibilidad === 'visible',
    });
  }

  noEncontrada(): void {
    this.aplicar({ titulo: `Página no encontrada · ${NOMBRE_SITIO}`, descripcion: DESCRIPCION_SITIO, indexable: false });
  }

  restringida(): void {
    this.aplicar({ titulo: `Acceso restringido · ${NOMBRE_SITIO}`, descripcion: 'Acceso restringido.', indexable: false });
  }

  private aplicar({ titulo, descripcion, ruta, indexable }: DatosPagina): void {
    this.title.setTitle(titulo);
    this.meta.updateTag({ name: 'description', content: descripcion });
    if (indexable) {
      this.meta.removeTag('name="robots"');
    } else {
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
    }
    this.cambiarCanonica(ruta && this.document.location.origin + ruta);
  }

  private cambiarCanonica(url: string | undefined): void {
    let enlace = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!url) {
      enlace?.remove();
      return;
    }
    if (!enlace) {
      enlace = this.document.createElement('link');
      enlace.rel = 'canonical';
      this.document.head.appendChild(enlace);
    }
    enlace.href = url;
  }

  private quitarDeLaPrimeraPagina(): void {
    this.document.head
      .querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], script#datos-estructurados')
      .forEach((elemento) => elemento.remove());
  }
}

import { Service, inject, signal } from '@angular/core';
import { NavigationEnd, ParamMap, PRIMARY_OUTLET, Params, Router } from '@angular/router';
import { filter } from 'rxjs';

// Vista limpia de las páginas de fotógrafo, portfolio y colección: el parámetro ?limpia=true en su
// URL (/:fotografo?limpia=true, /:fotografo/:portfolio?limpia=true…).
const PARAMETRO = 'limpia';
const CONSULTA_LIMPIA: Params = { [PARAMETRO]: 'true' };

export function esVistaLimpia(consulta: ParamMap): boolean {
  return consulta.get(PARAMETRO) === 'true';
}

// Dirección de la vista limpia de una página ("/ana/viajes" -> "/ana/viajes?limpia=true").
export function enlaceVistaLimpia(ruta: string): string {
  return `${ruta}?${PARAMETRO}=true`;
}

// Recuerda qué páginas del catálogo (fotógrafo, portfolio o colección) se han abierto en su vista
// limpia, para que los enlaces que vuelven a ellas ("Volver", el logo) las abran como se veían.
// La navegación nunca añade ?limpia=true al ir a un nivel más profundo: solo lo escribe el usuario.
// Una página deja de recordarse como limpia en cuanto se abre en su versión normal.
@Service()
export class VistaLimpiaService {
  private readonly router = inject(Router);

  // Rutas ("/fotografo", "/fotografo/portfolio"…) que se vieron por última vez en su vista limpia.
  private readonly limpias = signal<ReadonlySet<string>>(new Set());

  constructor() {
    this.router.events.pipe(filter((evento) => evento instanceof NavigationEnd)).subscribe((evento) => {
      const url = this.router.parseUrl(evento.urlAfterRedirects);
      const segmentos = (url.root.children[PRIMARY_OUTLET]?.segments ?? []).map((s) => s.path);
      if (segmentos.length < 1 || segmentos.length > 3) {
        return;
      }
      const clave = '/' + segmentos.join('/');
      const limpia = esVistaLimpia(url.queryParamMap);
      if (limpia !== this.limpias().has(clave)) {
        const nuevas = new Set(this.limpias());
        if (limpia) {
          nuevas.add(clave);
        } else {
          nuevas.delete(clave);
        }
        this.limpias.set(nuevas);
      }
    });
  }

  // Parámetros de consulta del enlace a una página del catálogo (['/', fotógrafo, portfolio…]) para
  // abrirla tal como se vio por última vez: ?limpia=true si se abrió en su vista limpia.
  consulta(ruta: string[]): Params | null {
    return this.limpias().has('/' + ruta.slice(1).join('/')) ? CONSULTA_LIMPIA : null;
  }
}

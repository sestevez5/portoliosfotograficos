import { Directive, computed, input } from '@angular/core';

// Anchos de las versiones reducidas que genera el backend (services/miniatura.service.ts).
export const ANCHOS_MINIATURA = [480, 960, 1600, 2400] as const;

// URL de la versión reducida de una foto de /photos a un ancho.
export function conAncho(url: string, ancho: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}ancho=${ancho}`;
}

// Muestra una foto del catálogo con la versión reducida adecuada a su tamaño en pantalla, en vez de
// la original (de varios miles de píxeles y varios MB): el backend las reduce con un buen filtro y el
// navegador elige con srcset la más cercana al tamaño en que la muestra, teniendo en cuenta la
// densidad de la pantalla. Así la foto se ve nítida (el navegador apenas tiene que reducirla) y carga
// mucho antes.
//
//   <img [appFotoReducida]="foto.url" tamanyos="(max-width: 40rem) 100vw, 25vw" [alt]="…" />
//
// tamanyos es el atributo sizes: el ancho aproximado con que se muestra la imagen.
@Directive({
  selector: 'img[appFotoReducida]',
  host: {
    '[attr.src]': 'src()',
    '[attr.srcset]': 'srcset()',
    '[attr.sizes]': 'tamanyos()',
  },
})
export class FotoReducida {
  readonly appFotoReducida = input.required<string>();
  readonly tamanyos = input('100vw');

  // Sin srcset (navegadores muy antiguos), la de 960.
  protected readonly src = computed(() => conAncho(this.appFotoReducida(), 960));
  protected readonly srcset = computed(() =>
    ANCHOS_MINIATURA.map((ancho) => `${conAncho(this.appFotoReducida(), ancho)} ${ancho}w`).join(', '),
  );
}

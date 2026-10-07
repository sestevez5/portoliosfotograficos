import { Directive, computed, input } from '@angular/core';

// Anchos de las versiones que genera el backend (services/miniatura.service.ts): la de las
// cuadrículas y la grande, de 3840 px de lado largo como máximo, la del visor a pantalla completa.
export const ANCHO_MINIATURA = 960;
export const ANCHO_GRANDE = 3840;

// URL de la versión reducida de una foto de /photos a un ancho.
export function conAncho(url: string, ancho: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}ancho=${ancho}`;
}

// Muestra una foto del catálogo con la versión de 960 px si basta para su tamaño en pantalla y, si
// no, con la grande: el navegador elige con srcset según el tamaño en que la muestra (sizes) y la
// densidad de la pantalla. Las dos las reduce el backend con un buen filtro, en AVIF, así que la foto
// se ve nítida y pesa poco.
//
//   <img [appFotoReducida]="foto.url" tamanyos="(max-width: 40rem) 100vw, 25vw" [alt]="…" />
//
// tamanyos es el atributo sizes: el ancho aproximado con que se muestra la imagen. La imagen debe
// tener su ancho fijado por CSS (el ancho declarado de la grande no es el real si es vertical).
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

  // Sin srcset (navegadores muy antiguos), la miniatura.
  protected readonly src = computed(() => conAncho(this.appFotoReducida(), ANCHO_MINIATURA));
  protected readonly srcset = computed(
    () =>
      `${conAncho(this.appFotoReducida(), ANCHO_MINIATURA)} ${ANCHO_MINIATURA}w, ${conAncho(this.appFotoReducida(), ANCHO_GRANDE)} ${ANCHO_GRANDE}w`,
  );
}

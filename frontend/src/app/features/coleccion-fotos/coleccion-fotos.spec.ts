import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { ColeccionFotos } from './coleccion-fotos';

const COLECCION = {
  nombre: 'Montaña',
  nombreNormalizado: 'montanya',
  tags: [],
  visible: true,
  portfolio: { nombre: 'Viajes', nombreNormalizado: 'viajes' },
  fotos: [],
};
const foto = (nombre: string) => new File(['x'], nombre, { type: 'image/jpeg' });

describe('ColeccionFotos', () => {
  let http: HttpTestingController;
  let elemento: HTMLElement;

  const crear = async () => {
    await TestBed.configureTestingModule({
      imports: [ColeccionFotos],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ fotografo: 'ana-uno', portfolio: 'viajes', coleccion: 'montanya' }) } },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ColeccionFotos);
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/colecciones/montanya')).flush(COLECCION);
    await fixture.whenStable();
    return fixture;
  };
  // Como si se eligieran esos archivos en el equipo.
  const elegir = (fixture: Awaited<ReturnType<typeof crear>>, archivos: File[]) =>
    (fixture.componentInstance as unknown as { alElegir(input: { files: File[]; value: string }): void }).alElegir({ files: archivos, value: '' });
  const subida = (nombre: string) => http.expectOne((r) => r.method === 'POST' && r.url.includes(`nombreFichero=${nombre}`));
  const dialogo = () => elemento.querySelector<HTMLDialogElement>('app-notificacion dialog')!;

  it('al terminar de subir todas las fotos avisa de que ha ido bien', async () => {
    const fixture = await crear();
    elegir(fixture, [foto('a.jpg'), foto('b.jpg')]);
    subida('a.jpg').flush({ nombreFichero: 'a.avif', url: '/photos/a.avif', orden: 0 });
    await fixture.whenStable();
    expect(dialogo().open).toBe(false);
    subida('b.jpg').flush({ nombreFichero: 'b.avif', url: '/photos/b.avif', orden: 1 });
    await fixture.whenStable();
    expect(dialogo().open).toBe(true);
    expect(dialogo().textContent).toContain('Se han añadido las 2 fotos a la colección.');

    dialogo().querySelector('button')!.click();
    await fixture.whenStable();
    expect(dialogo().open).toBe(false);
  });

  it('si alguna no se ha podido subir no avisa de que ha ido bien', async () => {
    const fixture = await crear();
    elegir(fixture, [foto('a.jpg'), foto('b.jpg')]);
    subida('a.jpg').flush({ nombreFichero: 'a.avif', url: '/photos/a.avif', orden: 0 });
    subida('b.jpg').flush({ message: 'No' }, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(dialogo().open).toBe(false);
  });
});

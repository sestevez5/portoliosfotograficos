import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AlbumAcciones } from './album-acciones';

const ADVERTENCIA =
  'Este álbum contiene fotos. Si lo elimina, se perderán de forma permanente sus fotos. ¿Desea continuar?';

describe('AlbumAcciones', () => {
  let fixture: ComponentFixture<AlbumAcciones>;
  let http: HttpTestingController;
  let elemento: HTMLElement;
  let eliminado: boolean;

  const boton = (texto: string) =>
    [...elemento.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto)!;
  const responderConFotos = () =>
    http
      .expectOne(
        (r) => r.method === 'DELETE' && r.url.endsWith('/api/fotografos/ana-uno/portfolios/viajes/albums/montanya'),
      )
      .flush(
        {
          tipo: 'reglaNegocioIncumplida',
          operacion: { codigo: 'ELIMINAR_ALBUM', descripcion: 'Eliminar el álbum "Montaña" del portfolio "Viajes"' },
          regla: { codigo: 'ALBUM_ELIMINAR_CON_FOTOS', mensaje: ADVERTENCIA },
          message: '…',
        },
        { status: 422, statusText: 'Unprocessable Content' },
      );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlbumAcciones],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AlbumAcciones);
    fixture.componentRef.setInput('fotografo', 'ana-uno');
    fixture.componentRef.setInput('portfolio', 'viajes');
    fixture.componentRef.setInput('album', { nombre: 'Montaña', nombreNormalizado: 'montanya' });
    eliminado = false;
    fixture.componentInstance.eliminado.subscribe(() => (eliminado = true));
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('tiene un enlace para editar en la zona de gestión del fotógrafo', () => {
    expect(elemento.querySelector('a')!.getAttribute('href')).toBe('/gestion/ana-uno/portfolios/viajes/albumes/montanya/editar');
  });

  it('sin fotos elimina directamente', () => {
    boton('Eliminar').click();
    http.expectOne((r) => r.method === 'DELETE').flush(null, { status: 204, statusText: 'No Content' });
    expect(eliminado).toBe(true);
  });

  it('con fotos muestra la advertencia y solo elimina si se confirma', async () => {
    boton('Eliminar').click();
    responderConFotos();
    await fixture.whenStable();

    const dialogo = elemento.querySelector('dialog')!;
    expect(dialogo.open).toBe(true);
    expect(dialogo.textContent).toContain(ADVERTENCIA);

    // Cancelar: no se elimina nada.
    boton('Cancelar').click();
    await fixture.whenStable();
    expect(dialogo.open).toBe(false);
    http.expectNone(() => true);
    expect(eliminado).toBe(false);

    // Volver a intentarlo y aceptar: se repite la petición confirmando.
    boton('Eliminar').click();
    responderConFotos();
    await fixture.whenStable();
    boton('Sí, eliminar').click();
    http
      .expectOne((r) => r.method === 'DELETE' && r.urlWithParams.endsWith('/albums/montanya?confirmar=true'))
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(eliminado).toBe(true);
  });
});

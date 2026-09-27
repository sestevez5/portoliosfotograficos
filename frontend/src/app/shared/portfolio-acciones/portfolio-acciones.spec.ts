import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PortfolioAcciones } from './portfolio-acciones';

const ADVERTENCIA =
  'Este portfolio contiene álbumes. Si lo elimina, se perderán de forma permanente sus álbumes y fotos. ¿Desea continuar?';

describe('PortfolioAcciones', () => {
  let fixture: ComponentFixture<PortfolioAcciones>;
  let http: HttpTestingController;
  let elemento: HTMLElement;
  let eliminado: boolean;

  const boton = (texto: string) =>
    [...elemento.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto)!;
  const responderConAlbumes = () =>
    http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/api/fotografos/ana-uno/portfolios/viajes')).flush(
      {
        tipo: 'reglaNegocioIncumplida',
        operacion: { codigo: 'ELIMINAR_PORTFOLIO', descripcion: 'Eliminar el portfolio "Viajes" del fotógrafo "Ana Uno"' },
        regla: { codigo: 'PORTFOLIO_ELIMINAR_CON_ALBUMES', mensaje: ADVERTENCIA },
        message: '…',
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PortfolioAcciones],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PortfolioAcciones);
    fixture.componentRef.setInput('fotografo', 'ana-uno');
    fixture.componentRef.setInput('portfolio', { nombre: 'Viajes', nombreNormalizado: 'viajes' });
    eliminado = false;
    fixture.componentInstance.eliminado.subscribe(() => (eliminado = true));
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('tiene un enlace para editar en la zona de gestión del fotógrafo', () => {
    expect(elemento.querySelector('a')!.getAttribute('href')).toBe('/gestion/ana-uno/portfolios/viajes/editar');
  });

  it('sin álbumes elimina directamente', () => {
    boton('Eliminar').click();
    http.expectOne((r) => r.method === 'DELETE').flush(null, { status: 204, statusText: 'No Content' });
    expect(eliminado).toBe(true);
  });

  it('con álbumes muestra la advertencia y solo elimina si se confirma', async () => {
    boton('Eliminar').click();
    responderConAlbumes();
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
    responderConAlbumes();
    await fixture.whenStable();
    boton('Sí, eliminar').click();
    http
      .expectOne((r) => r.method === 'DELETE' && r.urlWithParams.endsWith('/portfolios/viajes?confirmar=true'))
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(eliminado).toBe(true);
  });
});

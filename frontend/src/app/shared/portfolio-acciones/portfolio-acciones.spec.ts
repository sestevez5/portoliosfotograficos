import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SesionService } from '../../core/services/sesion';
import { PortfolioAcciones } from './portfolio-acciones';

const ADVERTENCIA =
  'Este portfolio contiene colecciones. Si lo elimina, se perderán de forma permanente sus colecciones y fotos. ¿Desea continuar?';

describe('PortfolioAcciones', () => {
  let fixture: ComponentFixture<PortfolioAcciones>;
  let http: HttpTestingController;
  let elemento: HTMLElement;
  let eliminado: boolean;

  const boton = (texto: string) =>
    [...elemento.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto)!;
  const responderConColecciones = () =>
    http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/api/fotografos/ana-uno/portfolios/viajes')).flush(
      {
        tipo: 'reglaNegocioIncumplida',
        operacion: { codigo: 'ELIMINAR_PORTFOLIO', descripcion: 'Eliminar el portfolio "Viajes" del fotógrafo "Ana Uno"' },
        regla: { codigo: 'PORTFOLIO_ELIMINAR_CON_COLECCIONES', mensaje: ADVERTENCIA },
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
    // Los botones solo se muestran a quien puede gestionarlo: aquí, el administrador.
    TestBed.inject(SesionService).usuario.set({ usuario: 'admin', rol: 'administrador' });
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

  it('sin colecciones elimina directamente', () => {
    boton('Eliminar').click();
    http.expectOne((r) => r.method === 'DELETE').flush(null, { status: 204, statusText: 'No Content' });
    expect(eliminado).toBe(true);
  });

  it('con colecciones muestra la advertencia y solo elimina si se confirma', async () => {
    boton('Eliminar').click();
    responderConColecciones();
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
    responderConColecciones();
    await fixture.whenStable();
    boton('Sí, eliminar').click();
    http
      .expectOne((r) => r.method === 'DELETE' && r.urlWithParams.endsWith('/portfolios/viajes?confirmar=true'))
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(eliminado).toBe(true);
  });

  describe('permisos', () => {
    const sesion = () => TestBed.inject(SesionService);
    const hayBotones = async () => {
      await fixture.whenStable();
      return elemento.querySelector('.acciones') !== null;
    };

    it('sin sesión no se muestran los botones', async () => {
      sesion().usuario.set(null);
      expect(await hayBotones()).toBe(false);
    });

    it('el dueño los ve; otro usuario, no', async () => {
      sesion().usuario.set({ usuario: 'ana', rol: 'usuario', fotografo: { nombreInformal: 'Ana Uno', nombreInformalNormalizado: 'ana-uno', logoUrl: '' } });
      expect(await hayBotones()).toBe(true);
      sesion().usuario.set({ usuario: 'bea', rol: 'usuario', fotografo: { nombreInformal: 'Bea', nombreInformalNormalizado: 'bea', logoUrl: '' } });
      expect(await hayBotones()).toBe(false);
    });
  });
});

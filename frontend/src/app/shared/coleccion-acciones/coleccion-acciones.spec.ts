import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SesionService } from '../../core/services/sesion';
import { ColeccionAcciones } from './coleccion-acciones';

const ADVERTENCIA =
  'Esta colección contiene fotos. Si lo elimina, se perderán de forma permanente sus fotos. ¿Desea continuar?';

describe('ColeccionAcciones', () => {
  let fixture: ComponentFixture<ColeccionAcciones>;
  let http: HttpTestingController;
  let elemento: HTMLElement;
  let eliminado: boolean;

  const boton = (texto: string) =>
    [...elemento.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto)!;
  const responderConFotos = () =>
    http
      .expectOne(
        (r) => r.method === 'DELETE' && r.url.endsWith('/api/fotografos/ana-uno/portfolios/viajes/colecciones/montanya'),
      )
      .flush(
        {
          tipo: 'reglaNegocioIncumplida',
          operacion: { codigo: 'ELIMINAR_COLECCION', descripcion: 'Eliminar la colección "Montaña" del portfolio "Viajes"' },
          regla: { codigo: 'COLECCION_ELIMINAR_CON_FOTOS', mensaje: ADVERTENCIA },
          message: '…',
        },
        { status: 422, statusText: 'Unprocessable Content' },
      );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColeccionAcciones],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ColeccionAcciones);
    // Los botones solo se muestran a quien puede gestionarlo: aquí, el administrador.
    TestBed.inject(SesionService).usuario.set({ usuario: 'admin', rol: 'administrador' });
    fixture.componentRef.setInput('fotografo', 'ana-uno');
    fixture.componentRef.setInput('portfolio', 'viajes');
    fixture.componentRef.setInput('coleccion', { nombre: 'Montaña', nombreNormalizado: 'montanya' });
    eliminado = false;
    fixture.componentInstance.eliminado.subscribe(() => (eliminado = true));
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('tiene un enlace para editar en la zona de gestión del fotógrafo', () => {
    expect(elemento.querySelector('a')!.getAttribute('href')).toBe('/gestion/ana-uno/portfolios/viajes/colecciones/montanya/editar');
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
      .expectOne((r) => r.method === 'DELETE' && r.urlWithParams.endsWith('/colecciones/montanya?confirmar=true'))
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

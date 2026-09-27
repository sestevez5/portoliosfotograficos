import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { FotografoAcciones } from './fotografo-acciones';

const ADVERTENCIA =
  'El usuario que intenta eliminar tiene portfolios creados. Si lo elimina, se perderán de forma permanente sus portfolios, álbumes y fotos. ¿Desea continuar?';

describe('FotografoAcciones', () => {
  let fixture: ComponentFixture<FotografoAcciones>;
  let http: HttpTestingController;
  let elemento: HTMLElement;
  let eliminado: boolean;

  const boton = (texto: string) =>
    [...elemento.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto)!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FotografoAcciones],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FotografoAcciones);
    fixture.componentRef.setInput('fotografo', { nombreInformal: 'Santi Estévez', nombreInformalNormalizado: 'santi-estevez' });
    eliminado = false;
    fixture.componentInstance.eliminado.subscribe(() => (eliminado = true));
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('tiene un enlace para editar', () => {
    const editar = elemento.querySelector('a')!;
    expect(editar.getAttribute('href')).toBe('/admin/fotografos/santi-estevez/editar');
  });

  it('sin portfolios elimina directamente', () => {
    boton('Eliminar').click();
    http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/api/fotografos/santi-estevez')).flush(null, { status: 204, statusText: 'No Content' });
    expect(eliminado).toBe(true);
  });

  it('con portfolios muestra la advertencia y solo elimina si se confirma', async () => {
    boton('Eliminar').click();
    http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/santi-estevez')).flush(
      {
        tipo: 'reglaNegocioIncumplida',
        operacion: { codigo: 'ELIMINAR_FOTOGRAFO', descripcion: 'Eliminar al fotógrafo "Santi Estévez"' },
        regla: { codigo: 'FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS', mensaje: ADVERTENCIA },
        message: '…',
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await fixture.whenStable();

    const dialogo = elemento.querySelector('dialog')!;
    expect(dialogo.open).toBe(true);
    expect(dialogo.textContent).toContain(ADVERTENCIA);
    expect(eliminado).toBe(false);

    // Cancelar: no se elimina nada.
    boton('Cancelar').click();
    await fixture.whenStable();
    expect(dialogo.open).toBe(false);
    http.expectNone(() => true);

    // Volver a intentarlo y aceptar: se repite la petición confirmando.
    boton('Eliminar').click();
    http.expectOne((r) => r.method === 'DELETE').flush(
      { tipo: 'reglaNegocioIncumplida', regla: { codigo: 'FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS', mensaje: ADVERTENCIA }, message: '…' },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await fixture.whenStable();
    boton('Sí, eliminar').click();
    http.expectOne((r) => r.method === 'DELETE' && r.urlWithParams.endsWith('/santi-estevez?confirmar=true')).flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    expect(eliminado).toBe(true);
  });
});

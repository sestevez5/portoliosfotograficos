import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AcercaDe } from './acerca-de';

describe('AcercaDe', () => {
  let http: HttpTestingController;
  let elemento: HTMLElement;

  const crear = async () => {
    await TestBed.configureTestingModule({
      imports: [AcercaDe],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(AcercaDe);
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
    return fixture;
  };
  const boton = (texto: string) =>
    Array.from(elemento.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === texto || b.getAttribute('aria-label') === texto)!;
  const dialogo = (clase: string) => elemento.querySelector<HTMLDialogElement>(`dialog.${clase}`)!;

  it('muestra las versiones con su fecha y el autor', async () => {
    const fixture = await crear();
    expect(dialogo('acerca-de').open).toBe(false);
    boton('Acerca de').click();
    http.expectOne((r) => r.url.endsWith('/api/acerca-de')).flush({
      aplicacion: { version: '2.4.0', fecha: '2026-10-07' },
      baseDatos: { version: 18, fecha: '2026-10-10' },
      autor: 'Santi Estévez',
      colaboradores: ['Mario Estévez'],
    });
    await fixture.whenStable();
    const texto = dialogo('acerca-de').textContent!;
    expect(dialogo('acerca-de').open).toBe(true);
    expect(texto).toContain('2.4.0 · 7 de octubre de 2026');
    expect(texto).toContain('18 · 10 de octubre de 2026');
    expect(texto).toContain('Santi Estévez');
    expect(texto).toContain('Colaboradores');
    expect(texto).toContain('Mario Estévez');

    boton('Cerrar').click();
    await fixture.whenStable();
    expect(dialogo('acerca-de').open).toBe(false);
  });

  it('abre el manual del fotógrafo en su diálogo y, al cerrarlo, vuelve a la aplicación', async () => {
    const fixture = await crear();
    boton('Acerca de').click();
    http.expectOne((r) => r.url.endsWith('/api/acerca-de')).flush({ aplicacion: { version: '1', fecha: '2026-01-01' }, baseDatos: { version: 1, fecha: '2026-01-01' }, autor: 'X', colaboradores: [] });
    expect(elemento.querySelector('iframe')).toBeNull(); // no se carga hasta abrirlo

    boton('Manual del fotógrafo').click();
    await fixture.whenStable();
    expect(dialogo('acerca-de').open).toBe(false);
    expect(dialogo('manual').open).toBe(true);
    expect(elemento.querySelector('iframe')!.getAttribute('src')).toBe('ayuda/manual-del-fotografo.html');

    boton('Cerrar el manual').click();
    await fixture.whenStable();
    expect(dialogo('manual').open).toBe(false);
    expect(dialogo('acerca-de').open).toBe(false);
    expect(elemento.querySelector('iframe')).toBeNull();
  });

  it('si no se pueden consultar las versiones, lo dice', async () => {
    const fixture = await crear();
    boton('Acerca de').click();
    http.expectOne((r) => r.url.endsWith('/api/acerca-de')).flush(null, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(dialogo('acerca-de').textContent).toContain('No se han podido consultar las versiones.');
  });
});

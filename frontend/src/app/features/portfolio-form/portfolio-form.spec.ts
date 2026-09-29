import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { PortfolioForm } from './portfolio-form';

describe('PortfolioForm', () => {
  let http: HttpTestingController;
  let elemento: HTMLElement;

  // params: los de la ruta (fotografo y, al editar, portfolio).
  const crear = async (params: Record<string, string>) => {
    await TestBed.configureTestingModule({
      imports: [PortfolioForm],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(params) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PortfolioForm);
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
    return fixture;
  };
  const rellenar = (campo: string, valor: string) => {
    const control = elemento.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${campo}`)!;
    control.value = valor;
    control.dispatchEvent(new Event('input'));
  };
  const enviar = () => elemento.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));

  it('no envía nada sin nombre', async () => {
    const fixture = await crear({ fotografo: 'ana-uno' });
    enviar();
    fixture.detectChanges();
    http.expectNone(() => true);
    expect(elemento.textContent).toContain('Indica un nombre para el portfolio.');
  });

  it('crea el portfolio y navega a su página', async () => {
    await crear({ fotografo: 'ana-uno' });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    rellenar('nombre', 'Bodas en Galicia');
    enviar();

    const peticion = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/fotografos/ana-uno/portfolios'));
    expect(peticion.request.body).toEqual({ nombre: 'Bodas en Galicia' });
    peticion.flush({ nombre: 'Bodas en Galicia', nombreNormalizado: 'bodas-en-galicia', colecciones: [] });
    expect(navegar).toHaveBeenCalledWith(['/', 'ana-uno', 'bodas-en-galicia']);
  });

  it('al editar carga los datos y muestra la regla incumplida si el backend responde 422', async () => {
    const fixture = await crear({ fotografo: 'ana-uno', portfolio: 'viajes' });
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/portfolios/viajes'))
      .flush({ nombre: 'Viajes', nombreNormalizado: 'viajes', descripcion: 'Por el mundo', colecciones: [] });
    await fixture.whenStable();
    expect(elemento.querySelector<HTMLInputElement>('#nombre')!.value).toBe('Viajes');

    rellenar('nombre', 'Retratos');
    enviar();
    const peticion = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/portfolios/viajes'));
    expect(peticion.request.body).toEqual({ nombre: 'Retratos', descripcion: 'Por el mundo' });
    peticion.flush(
      {
        tipo: 'reglaNegocioIncumplida',
        operacion: { codigo: 'EDITAR_PORTFOLIO', descripcion: 'Modificar el portfolio "Viajes" del fotógrafo "Ana Uno"' },
        regla: { codigo: 'PORTFOLIO_NOMBRE_DUPLICADO', mensaje: 'Ya existe otro portfolio con el mismo nombre.' },
        message: '…',
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    fixture.detectChanges();

    const aviso = elemento.querySelector('[role="alert"]')!.textContent!;
    expect(aviso).toContain('Modificar el portfolio "Viajes"');
    expect(aviso).toContain('Ya existe otro portfolio con el mismo nombre.');
  });
});

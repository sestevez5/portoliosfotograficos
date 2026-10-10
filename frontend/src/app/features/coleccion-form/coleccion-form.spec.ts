import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { ColeccionForm } from './coleccion-form';

const COLECCION = {
  nombre: 'Montaña',
  nombreNormalizado: 'montanya',
  descripcion: 'Picos',
  tags: ['nieve', 'roca'],
  portfolio: { nombre: 'Viajes', nombreNormalizado: 'viajes' },
  fotos: [],
};

describe('ColeccionForm', () => {
  let http: HttpTestingController;
  let elemento: HTMLElement;

  // params: los de la ruta (fotografo, portfolio y, al editar, coleccion).
  const crear = async (params: Record<string, string>) => {
    await TestBed.configureTestingModule({
      imports: [ColeccionForm],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(params) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ColeccionForm);
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
    const fixture = await crear({ fotografo: 'ana-uno', portfolio: 'viajes' });
    enviar();
    fixture.detectChanges();
    http.expectNone(() => true);
    expect(elemento.textContent).toContain('Indica un nombre para la colección.');
  });

  it('crea la colección sin tags y navega a su página', async () => {
    await crear({ fotografo: 'ana-uno', portfolio: 'viajes' });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    rellenar('nombre', 'Montaña');
    enviar();

    const peticion = http.expectOne(
      (r) => r.method === 'POST' && r.url.endsWith('/api/fotografos/ana-uno/portfolios/viajes/colecciones'),
    );
    expect(peticion.request.body).toEqual({ nombre: 'Montaña', tags: [] });
    peticion.flush(COLECCION);
    expect(navegar).toHaveBeenCalledWith(['/', 'ana-uno', 'viajes', 'montanya']);
  });

  it('al editar carga los datos y muestra la regla incumplida si el backend responde 422', async () => {
    const fixture = await crear({ fotografo: 'ana-uno', portfolio: 'viajes', coleccion: 'montanya' });
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/portfolios/viajes/colecciones/montanya')).flush(COLECCION);
    await fixture.whenStable();
    expect(elemento.querySelector<HTMLInputElement>('#nombre')!.value).toBe('Montaña');
    expect(elemento.querySelector('#tags')).toBeNull();

    rellenar('nombre', 'Mar');
    enviar();
    const peticion = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/colecciones/montanya'));
    expect(peticion.request.body).toEqual({ nombre: 'Mar', descripcion: 'Picos', tags: ['nieve', 'roca'] });
    peticion.flush(
      {
        tipo: 'reglaNegocioIncumplida',
        operacion: { codigo: 'EDITAR_COLECCION', descripcion: 'Modificar la colección "Montaña" del portfolio "Viajes"' },
        regla: { codigo: 'COLECCION_NOMBRE_DUPLICADO', mensaje: 'Ya existe otra colección con el mismo nombre.' },
        message: '…',
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    fixture.detectChanges();

    const aviso = elemento.querySelector('[role="alert"]')!.textContent!;
    expect(aviso).toContain('Modificar la colección "Montaña"');
    expect(aviso).toContain('Ya existe otra colección con el mismo nombre.');
  });
});

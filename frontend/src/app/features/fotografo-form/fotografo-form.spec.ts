import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { FotografoForm } from './fotografo-form';

describe('FotografoForm', () => {
  let fixture: ComponentFixture<FotografoForm>;
  let http: HttpTestingController;
  let elemento: HTMLElement;

  const rellenar = (campo: string, valor: string) => {
    const input = elemento.querySelector<HTMLInputElement>(`#${campo}`)!;
    input.value = valor;
    input.dispatchEvent(new Event('input'));
  };
  const enviar = () => elemento.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FotografoForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FotografoForm);
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('no envía nada si faltan campos obligatorios', () => {
    enviar();
    fixture.detectChanges();
    http.expectNone(() => true);
    expect(elemento.textContent).toContain('Indica un nombre informal.');
  });

  it('envía el alta sin los campos opcionales vacíos y navega a la página del fotógrafo', () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    rellenar('nombreInformal', 'Ana Núñez');
    rellenar('nombre', 'Ana');
    rellenar('primerApellido', 'Núñez');
    enviar();

    const peticion = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/fotografos'));
    expect(peticion.request.body).toEqual({ nombreInformal: 'Ana Núñez', nombre: 'Ana', primerApellido: 'Núñez' });
    peticion.flush({ nombreInformalNormalizado: 'ana-nunyez' }, { status: 201, statusText: 'Created' });
    expect(navegar).toHaveBeenCalledWith(['/', 'ana-nunyez']);
  });

  it('muestra la operación intentada y la regla incumplida si el backend responde 422', () => {
    rellenar('nombreInformal', 'Santi Estévez');
    rellenar('nombre', 'Santi');
    rellenar('primerApellido', 'Estévez');
    enviar();

    http.expectOne((r) => r.method === 'POST').flush(
      {
        tipo: 'reglaNegocioIncumplida',
        operacion: { codigo: 'CREAR_FOTOGRAFO', descripcion: 'Dar de alta al fotógrafo "Santi Estévez"' },
        regla: { codigo: 'FOTOGRAFO_NOMBRE_INFORMAL_DUPLICADO', mensaje: 'Ya existe otro fotógrafo con el mismo nombre informal.' },
        message: '…',
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    fixture.detectChanges();

    const aviso = elemento.querySelector('[role="alert"]')!.textContent!;
    expect(aviso).toContain('Dar de alta al fotógrafo "Santi Estévez"');
    expect(aviso).toContain('Ya existe otro fotógrafo con el mismo nombre informal.');
  });
});

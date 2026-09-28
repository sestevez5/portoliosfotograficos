import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { FotografoForm } from './fotografo-form';
import { SesionService } from '../../core/services/sesion';

// El formulario del fotógrafo en modo registro (/registro).
describe('FotografoForm (registro)', () => {
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
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}), data: { modo: 'registro' } } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(FotografoForm);
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('pide los datos de acceso, con correo y contraseña obligatorios', async () => {
    expect(elemento.querySelector('h1')!.textContent).toContain('Crear cuenta');
    expect(elemento.querySelector('#usuario')).not.toBeNull();
    rellenar('nombreInformal', 'Ana Uno');
    rellenar('nombre', 'Ana');
    rellenar('primerApellido', 'Uno');
    enviar();
    await new Promise((r) => setTimeout(r));
    http.expectNone(() => true);
    expect(elemento.textContent).toContain('Indica un nombre de usuario.');
    expect(elemento.textContent).toContain('Indica tu correo electrónico.');
    expect(elemento.textContent).toContain('Indica una contraseña.');
  });

  it('registra, deja la sesión iniciada y lleva a la página del nuevo fotógrafo', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    rellenar('usuario', ' ana.uno ');
    rellenar('email', 'ana@example.com');
    rellenar('contrasenya', 'secreta123');
    rellenar('repetirContrasenya', 'secreta123');
    rellenar('nombreInformal', 'Ana Uno');
    rellenar('nombre', 'Ana');
    rellenar('primerApellido', 'Uno');
    enviar();

    const peticion = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/registro'));
    expect(peticion.request.body).toEqual({
      usuario: 'ana.uno',
      email: 'ana@example.com',
      contrasenya: 'secreta123',
      nombreInformal: 'Ana Uno',
      nombre: 'Ana',
      primerApellido: 'Uno',
    });
    const usuario = {
      usuario: 'ana.uno',
      rol: 'usuario',
      fotografo: { nombreInformal: 'Ana Uno', nombreInformalNormalizado: 'ana-uno', logoUrl: '/api/fotografos/ana-uno/logo' },
    };
    peticion.flush({ usuario }, { status: 201, statusText: 'Created' });
    expect(navegar).toHaveBeenCalledWith(['/', 'ana-uno']);
    expect(TestBed.inject(SesionService).usuario()?.usuario).toBe('ana.uno');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NuevaContrasenya } from './nueva-contrasenya';
import { SesionService } from '../../core/services/sesion';

describe('NuevaContrasenya', () => {
  let fixture: ComponentFixture<NuevaContrasenya>;
  let http: HttpTestingController;
  let elemento: HTMLElement;

  const rellenar = (campo: string, valor: string) => {
    const control = elemento.querySelector<HTMLInputElement>(`#${campo}`)!;
    control.value = valor;
    control.dispatchEvent(new Event('input'));
    control.dispatchEvent(new Event('blur'));
  };
  const enlaceNoValido = {
    tipo: 'reglaNegocioIncumplida',
    regla: { codigo: 'RECUPERACION_ENLACE_NO_VALIDO', mensaje: 'El enlace para recuperar la contraseña no es válido o ha caducado.' },
    message: '…',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NuevaContrasenya],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ token: 'abc' }) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NuevaContrasenya);
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
  });

  const comprobacion = () => {
    const peticion = http.expectOne((r) => r.url.endsWith('/api/recuperar-contrasenya/comprobar'));
    expect(peticion.request.body).toEqual({ token: 'abc' });
    return peticion;
  };

  it('con un enlace que no sirve no muestra el formulario, sino el motivo y "Pedir otro enlace"', async () => {
    comprobacion().flush(enlaceNoValido, { status: 422, statusText: 'Unprocessable Content' });
    await fixture.whenStable();
    expect(elemento.querySelector('form')).toBeNull();
    expect(elemento.querySelector('[role="alert"]')!.textContent).toContain('ha caducado');
    expect(elemento.textContent).toContain('Pedir otro enlace');
  });

  it('pide la contraseña dos veces y, si coinciden, la cambia y deja la sesión iniciada', async () => {
    comprobacion().flush(null);
    await fixture.whenStable();

    rellenar('contrasenyaNueva', 'nueva-clave');
    rellenar('repetirContrasenya', 'otra-clave');
    elemento.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(elemento.textContent).toContain('Las contraseñas no coinciden.');
    http.expectNone((r) => r.url.endsWith('/api/recuperar-contrasenya/nueva'));

    rellenar('repetirContrasenya', 'nueva-clave');
    elemento.querySelector('form')!.dispatchEvent(new Event('submit'));
    const peticion = http.expectOne((r) => r.url.endsWith('/api/recuperar-contrasenya/nueva'));
    expect(peticion.request.body).toEqual({ token: 'abc', contrasenya: 'nueva-clave' });
    peticion.flush({ usuario: { usuario: 'ana.uno', rol: 'usuario' } });
    await fixture.whenStable();
    expect(elemento.querySelector('[role="status"]')!.textContent).toContain('ya has iniciado sesión');
    expect(TestBed.inject(SesionService).usuario()?.usuario).toBe('ana.uno');
  });
});

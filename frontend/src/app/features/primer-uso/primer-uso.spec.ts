import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { PrimerUso } from './primer-uso';

describe('PrimerUso', () => {
  let http: HttpTestingController;
  let elemento: HTMLElement;
  let navegar: ReturnType<typeof vi.spyOn>;

  const crear = async () => {
    await TestBed.configureTestingModule({
      imports: [PrimerUso],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(PrimerUso);
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
    return fixture;
  };
  const rellenar = (campo: string, valor: string) => {
    const control = elemento.querySelector<HTMLInputElement>(`#${campo}`)!;
    control.value = valor;
    control.dispatchEvent(new Event('input'));
  };
  const enviar = () => elemento.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));

  it('si el primer uso ya se completó, lleva a la portada', async () => {
    await crear();
    http.expectOne((r) => r.url.endsWith('/api/estado')).flush({ primerUso: false });
    expect(navegar).toHaveBeenCalledWith(['/']);
  });

  it('envía las credenciales y la contraseña nueva, y lleva a la portada', async () => {
    const fixture = await crear();
    http.expectOne((r) => r.url.endsWith('/api/estado')).flush({ primerUso: true });
    rellenar('usuario', 'admin');
    rellenar('contrasenya', 'admin');
    rellenar('contrasenyaNueva', 'nueva-clave');
    rellenar('repetirContrasenya', 'nueva-clave');
    enviar();
    fixture.detectChanges();

    const peticion = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/admin/primer-uso'));
    expect(peticion.request.body).toEqual({ usuario: 'admin', contrasenya: 'admin', contrasenyaNueva: 'nueva-clave' });
    peticion.flush(null, { status: 204, statusText: 'No Content' });
    expect(navegar).toHaveBeenCalledWith(['/']);
  });

  it('sin cambiar la contraseña no envía una nueva; muestra la regla si las credenciales fallan', async () => {
    const fixture = await crear();
    http.expectOne((r) => r.url.endsWith('/api/estado')).flush({ primerUso: true });
    elemento.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    fixture.detectChanges();
    expect(elemento.querySelector('#contrasenyaNueva')).toBeNull();

    rellenar('usuario', 'admin');
    rellenar('contrasenya', 'mal');
    enviar();
    const peticion = http.expectOne((r) => r.method === 'POST');
    expect(peticion.request.body).toEqual({ usuario: 'admin', contrasenya: 'mal' });
    peticion.flush(
      {
        tipo: 'reglaNegocioIncumplida',
        regla: { codigo: 'USUARIO_CREDENCIALES_INCORRECTAS', mensaje: 'El usuario o la contraseña no son correctos.' },
        message: '…',
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    fixture.detectChanges();
    expect(elemento.querySelector('[role="alert"]')!.textContent).toContain('El usuario o la contraseña no son correctos.');
    expect(navegar).not.toHaveBeenCalled();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { UsuarioSesion } from './usuario-sesion';

const ANA = {
  usuario: 'ana.uno',
  rol: 'usuario',
  fotografo: { nombreInformal: 'Ana Uno', nombreInformalNormalizado: 'ana-uno', logoUrl: '/api/fotografos/ana-uno/logo' },
};

describe('UsuarioSesion', () => {
  let fixture: ComponentFixture<UsuarioSesion>;
  let http: HttpTestingController;
  let elemento: HTMLElement;

  const boton = (texto: string) => [...elemento.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto);
  const rellenar = (campo: string, valor: string) => {
    const control = elemento.querySelector<HTMLInputElement>(`#${campo}`)!;
    control.value = valor;
    control.dispatchEvent(new Event('input'));
  };
  const sesionActual = (usuario: unknown) =>
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/sesion')).flush({ usuario });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsuarioSesion],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(UsuarioSesion);
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('con la sesión iniciada muestra al usuario, enlaza a su página y permite cerrarla', async () => {
    sesionActual(ANA);
    await fixture.whenStable();
    expect(elemento.textContent).toContain('Ana Uno');
    expect(elemento.textContent).toContain('ana.uno');
    expect(elemento.querySelector('a')!.getAttribute('href')).toBe('/ana-uno');

    boton('Cerrar sesión')!.click();
    http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/api/sesion')).flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    expect(boton('Iniciar sesión')).toBeDefined();
  });

  it('el administrador aparece como tal', async () => {
    sesionActual({ usuario: 'admin', rol: 'administrador' });
    await fixture.whenStable();
    expect(elemento.textContent).toContain('Administrador');
  });

  it('sin sesión, el panel inicia sesión y muestra el error si las credenciales no son correctas', async () => {
    sesionActual(null);
    await fixture.whenStable();
    boton('Iniciar sesión')!.click();
    await fixture.whenStable();
    expect(elemento.querySelector('dialog')!.open).toBe(true);

    rellenar('sesion-usuario', 'ana.uno');
    rellenar('sesion-contrasenya', 'mal');
    elemento.querySelector('form')!.dispatchEvent(new Event('submit'));
    const fallida = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/sesion'));
    expect(fallida.request.body).toEqual({ usuario: 'ana.uno', contrasenya: 'mal' });
    fallida.flush(
      { tipo: 'reglaNegocioIncumplida', regla: { codigo: 'USUARIO_CREDENCIALES_INCORRECTAS', mensaje: 'El usuario o la contraseña no son correctos.' }, message: '…' },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await fixture.whenStable();
    expect(elemento.querySelector('[role="alert"]')!.textContent).toContain('no son correctos');

    rellenar('sesion-contrasenya', 'secreta123');
    elemento.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne((r) => r.method === 'POST').flush({ usuario: ANA });
    await fixture.whenStable();
    expect(elemento.querySelector('dialog')!.open).toBe(false);
    expect(elemento.textContent).toContain('Ana Uno');
  });

  it('desde el panel se puede ir al registro', async () => {
    sesionActual(null);
    await fixture.whenStable();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    boton('Iniciar sesión')!.click();
    await fixture.whenStable();
    boton('Regístrate')!.click();
    await fixture.whenStable();
    expect(navegar).toHaveBeenCalledWith(['/registro']);
    expect(elemento.querySelector('dialog')!.open).toBe(false);
  });
});

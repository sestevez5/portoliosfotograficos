import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { UsuarioSesion } from './usuario-sesion';

const SANTI = {
  usuario: 'sest2',
  email: 'santi@example.com',
  rol: 'usuario',
  fotografo: { nombreInformal: 'Santi Estévez', nombreInformalNormalizado: 'santi-estevez', logoUrl: '/api/fotografos/santi-estevez/logo' },
};

describe('UsuarioSesion', () => {
  let fixture: ComponentFixture<UsuarioSesion>;
  let http: HttpTestingController;
  let elemento: HTMLElement;

  const boton = (texto: string) =>
    [...elemento.querySelectorAll('button')].find((b) => b.textContent!.replace(/\s+/g, ' ').trim().includes(texto));
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

  it('con sesión muestra las iniciales y el nombre informal; el menú tiene el correo y las opciones', async () => {
    sesionActual(SANTI);
    await fixture.whenStable();
    expect(elemento.querySelector('.avatar')!.textContent!.trim()).toBe('SE');
    expect(elemento.querySelector('.disparador__nombre')!.textContent).toBe('Santi Estévez');
    expect(elemento.querySelector('[role="menu"]')).toBeNull();

    boton('Santi Estévez')!.click();
    await fixture.whenStable();
    const menu = elemento.querySelector('[role="menu"]')!;
    expect(menu.textContent).toContain('santi@example.com');
    const enlaces = [...menu.querySelectorAll('a')].map((a) => [a.textContent!.trim(), a.getAttribute('href')]);
    expect(enlaces).toEqual([['Mi perfil', '/perfil']]);
  });

  it('el menú se cierra con Escape y al pulsar fuera', async () => {
    sesionActual(SANTI);
    await fixture.whenStable();
    boton('Santi Estévez')!.click();
    await fixture.whenStable();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(elemento.querySelector('[role="menu"]')).toBeNull();

    boton('Santi Estévez')!.click();
    await fixture.whenStable();
    document.body.click();
    await fixture.whenStable();
    expect(elemento.querySelector('[role="menu"]')).toBeNull();
  });

  it('"Salir" cierra la sesión y vuelve a la portada', async () => {
    sesionActual(SANTI);
    await fixture.whenStable();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    boton('Santi Estévez')!.click();
    await fixture.whenStable();
    boton('Salir')!.click();
    http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/api/sesion')).flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    expect(navegar).toHaveBeenCalledWith(['/']);
    expect(boton('Iniciar sesión')).toBeDefined();
  });

  it('el administrador aparece como tal', async () => {
    sesionActual({ usuario: 'admin', rol: 'administrador' });
    await fixture.whenStable();
    expect(elemento.querySelector('.disparador__nombre')!.textContent).toBe('Administrador');
    expect(elemento.querySelector('.avatar')!.textContent!.trim()).toBe('A');
  });

  it('sin sesión, "Iniciar sesión" abre el panel de autenticación', async () => {
    sesionActual(null);
    await fixture.whenStable();
    boton('Iniciar sesión')!.click();
    await fixture.whenStable();
    expect(elemento.querySelector('dialog')!.open).toBe(true);
  });
});

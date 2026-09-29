import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { PanelSesion } from './panel-sesion';
import { SesionService } from '../../core/services/sesion';

describe('PanelSesion', () => {
  let fixture: ComponentFixture<PanelSesion>;
  let http: HttpTestingController;
  let elemento: HTMLElement;

  const boton = (texto: string) => [...elemento.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto)!;
  const rellenar = (campo: string, valor: string) => {
    const control = elemento.querySelector<HTMLInputElement>(`#${campo}`)!;
    control.value = valor;
    control.dispatchEvent(new Event('input'));
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PanelSesion],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(PanelSesion);
    fixture.componentRef.setInput('abierto', true);
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('muestra el error si las credenciales no son correctas y, si lo son, inicia sesión y se cierra', async () => {
    expect(elemento.querySelector('dialog')!.open).toBe(true);
    rellenar('sesion-usuario', 'sest2');
    rellenar('sesion-contrasenya', 'mal');
    elemento.querySelector('form')!.dispatchEvent(new Event('submit'));
    const fallida = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/sesion'));
    expect(fallida.request.body).toEqual({ usuario: 'sest2', contrasenya: 'mal' });
    fallida.flush(
      { tipo: 'reglaNegocioIncumplida', regla: { codigo: 'USUARIO_CREDENCIALES_INCORRECTAS', mensaje: 'El usuario o la contraseña no son correctos.' }, message: '…' },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await fixture.whenStable();
    expect(elemento.querySelector('[role="alert"]')!.textContent).toContain('no son correctos');

    rellenar('sesion-contrasenya', 'usuario1234');
    elemento.querySelector('form')!.dispatchEvent(new Event('submit'));
    http.expectOne((r) => r.method === 'POST').flush({ usuario: { usuario: 'sest2', rol: 'usuario' } });
    await fixture.whenStable();
    expect(elemento.querySelector('dialog')!.open).toBe(false);
    expect(TestBed.inject(SesionService).usuario()?.usuario).toBe('sest2');
  });

  it('"Regístrate" cierra el panel y lleva al registro', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    boton('Regístrate').click();
    await fixture.whenStable();
    expect(navegar).toHaveBeenCalledWith(['/registro']);
    expect(elemento.querySelector('dialog')!.open).toBe(false);
  });
});

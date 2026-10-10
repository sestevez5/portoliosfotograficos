import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { CuentaForm } from './cuenta-form';

const PERFIL = { usuario: 'ana.uno', email: 'ana@example.com', rol: 'usuario', temaPreferido: 'claro', fechaCreacion: '2026-01-01', tieneContrasenya: true };

describe('CuentaForm', () => {
  let http: HttpTestingController;
  let elemento: HTMLElement;

  const crear = async (perfil: object = PERFIL) => {
    await TestBed.configureTestingModule({
      imports: [CuentaForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(CuentaForm);
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/perfil')).flush(perfil);
    await fixture.whenStable();
    return fixture;
  };
  const campo = (id: string) => elemento.querySelector<HTMLInputElement>(`#${id}`)!;
  const rellenar = (id: string, valor: string) => {
    campo(id).value = valor;
    campo(id).dispatchEvent(new Event('input'));
  };
  // Opciones del tema preferido, en su orden: sin preferencia, oscuro y claro.
  const tema = (valor: 'ninguno' | 'oscuro' | 'claro') =>
    elemento.querySelectorAll<HTMLInputElement>('input[type=radio]')[['ninguno', 'oscuro', 'claro'].indexOf(valor)];
  const boton = (texto: string) => Array.from(elemento.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === texto)!;

  it('carga la cuenta, guarda el usuario y el tema y vuelve a "Mi perfil"', async () => {
    const fixture = await crear();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    expect(campo('usuario').value).toBe('ana.uno');
    expect(tema('claro').checked).toBe(true);

    rellenar('usuario', ' ana.nueva ');
    tema('ninguno').click();
    boton('Guardar cambios').click();
    const peticion = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/perfil/cuenta'));
    expect(peticion.request.body).toEqual({ usuario: 'ana.nueva', temaPreferido: null });
    peticion.flush(null, { status: 204, statusText: 'No Content' });
    http.match((r) => r.url.endsWith('/api/sesion')).forEach((r) => r.flush({ usuario: null })); // se vuelve a consultar la sesión
    await fixture.whenStable();
    expect(navegar).toHaveBeenCalledWith(['/perfil']);
  });

  it('muestra la regla incumplida si el usuario ya existe', async () => {
    const fixture = await crear();
    rellenar('usuario', 'bea.dos');
    boton('Guardar cambios').click();
    http.expectOne((r) => r.url.endsWith('/api/perfil/cuenta')).flush(
      {
        tipo: 'reglaNegocioIncumplida',
        operacion: { codigo: 'EDITAR_CUENTA', descripcion: 'Modificar la cuenta del usuario "ana.uno"' },
        regla: { codigo: 'USUARIO_DUPLICADO', mensaje: 'Ya existe otro usuario con el nombre de usuario "bea.dos".' },
        message: '…',
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await fixture.whenStable();
    expect(elemento.textContent).toContain('Ya existe otro usuario con el nombre de usuario "bea.dos".');
  });

  it('el usuario del administrador no se puede cambiar', async () => {
    await crear({ ...PERFIL, usuario: 'admin', rol: 'administrador' });
    expect(campo('usuario').disabled).toBe(true);
    expect(elemento.textContent).toContain('El nombre de usuario del administrador no se puede cambiar.');
  });

  it('guarda a la vez el usuario y la contraseña, con un solo "Guardar cambios"', async () => {
    const fixture = await crear();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    expect(campo('contrasenyaActual')).toBeNull();
    rellenar('usuario', 'demo');
    boton('Cambiar contraseña').click();
    await fixture.whenStable();

    rellenar('contrasenyaActual', 'secreta123');
    rellenar('contrasenyaNueva', 'nueva12345');
    rellenar('repetirContrasenya', 'otra123456');
    boton('Guardar cambios').click();
    await fixture.whenStable();
    http.expectNone((r) => r.url.endsWith('/api/perfil/cuenta'));
    expect(elemento.textContent).toContain('Las contraseñas no coinciden.');

    rellenar('repetirContrasenya', 'nueva12345');
    boton('Guardar cambios').click();
    const peticion = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/perfil/cuenta'));
    expect(peticion.request.body).toEqual({
      usuario: 'demo',
      temaPreferido: 'claro',
      contrasenya: { contrasenyaActual: 'secreta123', contrasenyaNueva: 'nueva12345' },
    });
  });

  it('si se pliega "Cambiar contraseña", la contraseña ni se valida ni se envía', async () => {
    const fixture = await crear();
    boton('Cambiar contraseña').click();
    await fixture.whenStable();
    boton('No cambiar la contraseña').click();
    await fixture.whenStable();
    boton('Guardar cambios').click();
    const peticion = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/perfil/cuenta'));
    expect(peticion.request.body).toEqual({ usuario: 'ana.uno', temaPreferido: 'claro' });
  });
});

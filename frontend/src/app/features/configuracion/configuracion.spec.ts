import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Configuracion } from './configuracion';
import { TemaService } from '../../core/services/tema';

describe('Configuracion', () => {
  beforeEach(() => {
    localStorage.removeItem('tema');
    delete document.documentElement.dataset['tema'];
  });

  it('guarda el tema elegido como preferido y lo aplica', async () => {
    await TestBed.configureTestingModule({
      imports: [Configuracion],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(Configuracion);
    const http = TestBed.inject(HttpTestingController);
    const elemento: HTMLElement = fixture.nativeElement;
    await fixture.whenStable();

    const opcion = (texto: string) =>
      [...elemento.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.textContent!.includes(texto))!;
    expect(opcion('Oscuro').getAttribute('aria-checked')).toBe('true');

    opcion('Claro').click();
    await fixture.whenStable();
    [...elemento.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Guardar')!.click();

    const peticion = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/perfil/preferencias'));
    expect(peticion.request.body).toEqual({ temaPreferido: 'claro' });
    peticion.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(TestBed.inject(TemaService).tema()).toBe('claro');
    expect(document.documentElement.dataset['tema']).toBe('claro');
    expect(elemento.textContent).toContain('Configuración guardada');
  });
});

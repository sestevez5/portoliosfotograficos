import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { VistaLimpiaService } from './vista-limpia';

@Component({ template: '' })
class Vacia {}

describe('VistaLimpiaService', () => {
  let router: Router;
  let vistas: VistaLimpiaService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', component: Vacia }])] });
    router = TestBed.inject(Router);
    vistas = TestBed.inject(VistaLimpiaService);
  });

  it('sin vista limpia, el enlace no lleva parámetros', () => {
    expect(vistas.consulta(['/', 'ana'])).toBeNull();
  });

  it('vuelve a cada nivel como se vio por última vez', async () => {
    await router.navigateByUrl('/ana?limpia=true');
    await router.navigateByUrl('/ana/viajes');
    await router.navigateByUrl('/ana/viajes/mar?limpia=true');
    expect(vistas.consulta(['/', 'ana'])).toEqual({ limpia: 'true' });
    expect(vistas.consulta(['/', 'ana', 'viajes'])).toBeNull();
    expect(vistas.consulta(['/', 'ana', 'viajes', 'mar'])).toEqual({ limpia: 'true' });
  });

  it('deja de recordarla al abrir la página en su versión normal', async () => {
    await router.navigateByUrl('/ana?limpia=true');
    await router.navigateByUrl('/ana');
    expect(vistas.consulta(['/', 'ana'])).toBeNull();
  });
});

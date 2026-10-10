import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Visibilidad } from '../../core/models/catalogo.model';
import { SelectorVisibilidad } from './selector-visibilidad';

@Component({
  imports: [SelectorVisibilidad],
  template: `<app-selector-visibilidad [visibilidad]="visibilidad()" nombre="Viajes" (cambiar)="pedidas.push($event)" />`,
})
class Anfitrion {
  readonly visibilidad = signal<Visibilidad>('visible');
  readonly pedidas: Visibilidad[] = [];
}

describe('SelectorVisibilidad', () => {
  it('muestra los tres estados, resalta el elegido y pide el cambio al pulsar otro', async () => {
    const fixture = TestBed.createComponent(Anfitrion);
    await fixture.whenStable();
    const botones = () => Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'));
    expect(botones().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Visible: cualquiera lo ve y entra',
      'Bloqueado: los demás lo ven, pero no pueden entrar',
      'Oculto: los demás no lo ven',
    ]);
    expect(botones().map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);

    botones()[0].click(); // el que ya está elegido: no pide nada
    botones()[1].click();
    expect(fixture.componentInstance.pedidas).toEqual(['bloqueado']);

    fixture.componentInstance.visibilidad.set('bloqueado');
    await fixture.whenStable();
    expect(botones().map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
  });
});

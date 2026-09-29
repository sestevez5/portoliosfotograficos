import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TextoRecortado } from './texto-recortado';

@Component({
  imports: [TextoRecortado],
  template: `<p appTextoRecortado>Una descripción larga que no cabe en una sola línea</p>`,
})
class Anfitrion {}

describe('TextoRecortado', () => {
  // jsdom no calcula tamaños: se simula el ancho del texto (scrollWidth) y el disponible (clientWidth).
  const parrafo = async (anchoTexto: number, anchoDisponible: number) => {
    const fixture = TestBed.createComponent(Anfitrion);
    await fixture.whenStable();
    const p: HTMLElement = fixture.nativeElement.querySelector('p');
    Object.defineProperty(p, 'scrollWidth', { value: anchoTexto });
    Object.defineProperty(p, 'clientWidth', { value: anchoDisponible });
    p.dispatchEvent(new Event('mouseenter'));
    return p;
  };

  it('si el texto no cabe, el tooltip muestra el texto entero', async () => {
    expect((await parrafo(800, 400)).title).toBe('Una descripción larga que no cabe en una sola línea');
  });

  it('si cabe entero, no hay tooltip', async () => {
    expect((await parrafo(300, 400)).hasAttribute('title')).toBe(false);
  });
});

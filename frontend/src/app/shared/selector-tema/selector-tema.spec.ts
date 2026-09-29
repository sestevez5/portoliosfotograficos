import { TestBed } from '@angular/core/testing';
import { SelectorTema } from './selector-tema';

describe('SelectorTema', () => {
  beforeEach(() => {
    localStorage.removeItem('tema');
    delete document.documentElement.dataset['tema'];
  });

  const crear = async () => {
    const fixture = TestBed.createComponent(SelectorTema);
    await fixture.whenStable();
    return fixture;
  };
  const opcion = (elemento: HTMLElement, texto: string) =>
    [...elemento.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto)!;

  it('por defecto el tema es el oscuro', async () => {
    const elemento: HTMLElement = (await crear()).nativeElement;
    expect(opcion(elemento, 'Oscuro').getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.dataset['tema']).toBeUndefined();
  });

  it('elegir el claro lo aplica a la página y lo recuerda; volver al oscuro lo quita', async () => {
    const fixture = await crear();
    const elemento: HTMLElement = fixture.nativeElement;

    opcion(elemento, 'Claro').click();
    await fixture.whenStable();
    expect(document.documentElement.dataset['tema']).toBe('claro');
    expect(localStorage.getItem('tema')).toBe('claro');
    expect(opcion(elemento, 'Claro').getAttribute('aria-checked')).toBe('true');

    opcion(elemento, 'Oscuro').click();
    await fixture.whenStable();
    expect(document.documentElement.dataset['tema']).toBeUndefined();
    expect(localStorage.getItem('tema')).toBe('oscuro');
  });
});

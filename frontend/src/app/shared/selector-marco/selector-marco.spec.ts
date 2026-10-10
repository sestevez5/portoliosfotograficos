import { TestBed } from '@angular/core/testing';
import { SelectorMarco } from './selector-marco';

describe('SelectorMarco', () => {
  beforeEach(() => {
    localStorage.removeItem('marco');
    delete document.documentElement.dataset['marco'];
  });

  const crear = async () => {
    const fixture = TestBed.createComponent(SelectorMarco);
    await fixture.whenStable();
    return fixture;
  };
  const opcion = (elemento: HTMLElement, texto: string) =>
    [...elemento.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto)!;

  it('por defecto, las fotos van sin marco', async () => {
    const elemento: HTMLElement = (await crear()).nativeElement;
    expect(opcion(elemento, 'Sin marco').getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.dataset['marco']).toBeUndefined();
  });

  it('elegir "Con marco" lo aplica a la página y lo recuerda; "Sin marco" lo quita', async () => {
    const fixture = await crear();
    const elemento: HTMLElement = fixture.nativeElement;

    opcion(elemento, 'Con marco').click();
    await fixture.whenStable();
    expect(document.documentElement.dataset['marco']).toBe('con');
    expect(localStorage.getItem('marco')).toBe('con');
    expect(opcion(elemento, 'Con marco').getAttribute('aria-checked')).toBe('true');

    opcion(elemento, 'Sin marco').click();
    await fixture.whenStable();
    expect(document.documentElement.dataset['marco']).toBeUndefined();
    expect(localStorage.getItem('marco')).toBe('sin');
  });
});

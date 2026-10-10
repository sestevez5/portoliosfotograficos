import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Compartir } from './compartir';

describe('Compartir', () => {
  let elemento: HTMLElement;

  const crear = async () => {
    await TestBed.configureTestingModule({ imports: [Compartir] }).compileComponents();
    const fixture = TestBed.createComponent(Compartir);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
    return fixture;
  };
  const dialogo = () => elemento.querySelector<HTMLDialogElement>('dialog')!;
  const boton = (etiqueta: string) =>
    Array.from(elemento.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.getAttribute('aria-label') === etiqueta || b.textContent?.trim() === etiqueta,
    )!;

  it('muestra el enlace de la página en su vista limpia y se cierra con "Cerrar"', async () => {
    const fixture = await crear();
    boton('Compartir esta página').click();
    await fixture.whenStable();
    expect(dialogo().open).toBe(true);
    expect(dialogo().textContent).toContain('Comparte este enlace si quieres compartir esta página');
    const { origin, pathname } = document.location;
    expect(elemento.querySelector<HTMLInputElement>('input')!.value).toBe(`${origin}${pathname}?limpia=true`);

    boton('Cerrar').click();
    await fixture.whenStable();
    expect(dialogo().open).toBe(false);
  });

  it('copia el enlace y lo confirma', async () => {
    const fixture = await crear();
    const escribir = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escribir }, configurable: true });
    boton('Compartir esta página').click();
    boton('Copiar el enlace').click();
    await vi.waitFor(() => expect(elemento.textContent).toContain('Enlace copiado.'));
    expect(escribir).toHaveBeenCalledWith(elemento.querySelector<HTMLInputElement>('input')!.value);
    vi.unstubAllGlobals();
    await fixture.whenStable();
  });
});

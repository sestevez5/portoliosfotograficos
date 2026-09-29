import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { EditorFoto } from './editor-foto';

// Acceso a lo protegido del componente para probar la lógica del encuadre.
type Interno = {
  imagen: { set(img: unknown): void };
  paso: { set(p: string): void; (): string };
  zoom: () => number;
  desplazamiento: () => { x: number; y: number };
  caja: () => { izquierda: number; arriba: number; ancho: number; alto: number };
  cambiarZoom(valor: number): void;
  empezarArrastre(e: unknown): void;
  arrastrar(e: unknown): void;
  terminarArrastre(): void;
};

describe('EditorFoto', () => {
  let fixture: ComponentFixture<EditorFoto>;
  let editor: Interno;
  let elemento: HTMLElement;

  // Una imagen apaisada de 600 × 400 px en el visor de 288 px: para cubrir el círculo se escala a
  // 0,72 (432 × 288): sobra ancho (72 px por cada lado) y nada de alto.
  const cargarImagen = () => {
    editor.imagen.set({ naturalWidth: 600, naturalHeight: 400, src: 'data:,' });
    editor.paso.set('encuadre');
  };
  const arrastre = (dx: number, dy: number) => {
    const destino = { setPointerCapture: () => undefined };
    editor.empezarArrastre({ currentTarget: destino, pointerId: 1, clientX: 0, clientY: 0 });
    editor.arrastrar({ clientX: dx, clientY: dy });
    editor.terminarArrastre();
  };

  beforeEach(async () => {
    fixture = TestBed.createComponent(EditorFoto);
    fixture.componentRef.setInput('abierto', true);
    editor = fixture.componentInstance as unknown as Interno;
    elemento = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('empieza ofreciendo un archivo o la cámara', () => {
    expect(elemento.textContent).toContain('Elegir un archivo');
    expect(elemento.textContent).toContain('Usar la cámara');
    expect(elemento.querySelector('input[type="file"]')!.getAttribute('accept')).toBe('image/*');
  });

  describe('cámara', () => {
    let pista: { stop: ReturnType<typeof vi.fn> };
    let pedirCamara: ReturnType<typeof vi.fn>;
    const boton = (texto: string) =>
      [...elemento.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes(texto))!;

    beforeEach(() => {
      pista = { stop: vi.fn() };
      pedirCamara = vi.fn(async () => ({ getTracks: () => [pista] }));
      Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: pedirCamara }, configurable: true });
    });

    it('conecta la cámara al vídeo cuando ya está pintado y no deja capturar hasta que da imagen', async () => {
      boton('Usar la cámara').click();
      await fixture.whenStable();
      const video = elemento.querySelector('video')!;
      expect(video.srcObject).toEqual({ getTracks: expect.any(Function) });
      expect(boton('Capturar').disabled).toBe(true);
      expect(elemento.textContent).toContain('Preparando la cámara');

      video.dispatchEvent(new Event('loadeddata'));
      await fixture.whenStable();
      expect(boton('Capturar').disabled).toBe(false);
    });

    it('pulsar dos veces no abre dos cámaras', async () => {
      boton('Usar la cámara').click();
      boton('Usar la cámara').click();
      await fixture.whenStable();
      expect(pedirCamara).toHaveBeenCalledTimes(1);
    });

    it('la cámara se apaga al volver y al cerrar el editor', async () => {
      boton('Usar la cámara').click();
      await fixture.whenStable();
      boton('Volver').click();
      await fixture.whenStable();
      expect(pista.stop).toHaveBeenCalledTimes(1);

      boton('Usar la cámara').click();
      await fixture.whenStable();
      fixture.componentRef.setInput('abierto', false);
      await fixture.whenStable();
      expect(pista.stop).toHaveBeenCalledTimes(2);
    });
  });

  it('la imagen cubre siempre el círculo: sin zoom solo se puede mover lo que sobra', async () => {
    cargarImagen();
    expect(editor.caja()).toEqual({ izquierda: -72, arriba: 0, ancho: 432, alto: 288 });

    arrastre(500, 500);
    expect(editor.desplazamiento()).toEqual({ x: 72, y: 0 });
    arrastre(-1000, -1000);
    expect(editor.desplazamiento()).toEqual({ x: -72, y: 0 });
  });

  it('al ampliar se puede mover más; al reducir el desplazamiento se ajusta para no dejar hueco', () => {
    cargarImagen();
    editor.cambiarZoom(2);
    arrastre(0, 1000);
    expect(editor.desplazamiento().y).toBe(144);

    editor.cambiarZoom(1);
    expect(editor.desplazamiento()).toEqual({ x: 0, y: 0 });
    editor.cambiarZoom(99);
    expect(editor.zoom()).toBe(4);
    editor.cambiarZoom(0);
    expect(editor.zoom()).toBe(1);
  });
});

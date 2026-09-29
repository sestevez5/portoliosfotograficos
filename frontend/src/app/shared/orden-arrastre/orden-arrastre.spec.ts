import { signal } from '@angular/core';
import { OrdenPorArrastre } from './orden-arrastre';

// Un DragEvent mínimo: lo que usa OrdenPorArrastre (dataTransfer y preventDefault).
function evento(dropEffect: DataTransfer['dropEffect'] = 'move'): DragEvent {
  return {
    preventDefault: () => undefined,
    dataTransfer: { effectAllowed: 'all', dropEffect, setData: () => undefined },
  } as unknown as DragEvent;
}

describe('OrdenPorArrastre', () => {
  const crear = () => {
    const lista = signal(['a', 'b', 'c', 'd']);
    const guardados: { ahora: string[]; antes: string[] }[] = [];
    const orden = new OrdenPorArrastre(lista, (e) => e, (ahora, antes) => guardados.push({ ahora, antes }));
    return { lista, guardados, orden };
  };

  it('al pasar sobre otro elemento ocupa su sitio y al soltar guarda el orden nuevo', () => {
    const { lista, guardados, orden } = crear();
    orden.empezar(evento(), 'a', true);
    expect(orden.arrastrado()).toBe('a');
    orden.pasarSobre(evento(), 'c');
    expect(lista()).toEqual(['b', 'c', 'a', 'd']);
    orden.pasarSobre(evento(), 'b');
    expect(lista()).toEqual(['a', 'b', 'c', 'd']);
    orden.pasarSobre(evento(), 'd');
    orden.terminar(evento());
    expect(lista()).toEqual(['b', 'c', 'd', 'a']);
    expect(orden.arrastrado()).toBeNull();
    expect(guardados).toEqual([{ ahora: ['b', 'c', 'd', 'a'], antes: ['a', 'b', 'c', 'd'] }]);
  });

  it('no vuelve a intercambiarse con el mismo elemento hasta que el puntero pasa a otro', () => {
    const { lista, orden } = crear();
    orden.empezar(evento(), 'a', true);
    orden.pasarSobre(evento(), 'b');
    expect(lista()).toEqual(['b', 'a', 'c', 'd']);
    // "b" (más baja, p. ej.) queda bajo el puntero tras el intercambio: no se deshace.
    orden.pasarSobre(evento(), 'b');
    expect(lista()).toEqual(['b', 'a', 'c', 'd']);
    // Tras pasar por encima de la propia "a", volver a "b" sí la intercambia.
    orden.pasarSobre(evento(), 'a');
    orden.pasarSobre(evento(), 'b');
    expect(lista()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('cancelar (Escape) vuelve al orden de antes sin guardar', () => {
    const { lista, guardados, orden } = crear();
    orden.empezar(evento(), 'd', true);
    orden.pasarSobre(evento(), 'a');
    expect(lista()).toEqual(['d', 'a', 'b', 'c']);
    orden.terminar(evento('none'));
    expect(lista()).toEqual(['a', 'b', 'c', 'd']);
    expect(guardados).toEqual([]);
  });

  it('no guarda si el orden no cambia ni empieza si no está permitido', () => {
    const { lista, guardados, orden } = crear();
    orden.empezar(evento(), 'b', true);
    orden.pasarSobre(evento(), 'b');
    orden.terminar(evento());
    expect(guardados).toEqual([]);

    orden.empezar(evento(), 'b', false);
    expect(orden.arrastrado()).toBeNull();
    orden.pasarSobre(evento(), 'd');
    expect(lista()).toEqual(['a', 'b', 'c', 'd']);
  });
});

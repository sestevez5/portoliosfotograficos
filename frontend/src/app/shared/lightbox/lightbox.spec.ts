import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Foto } from '../../core/models/catalogo.model';
import { Lightbox } from './lightbox';

const FOTOS: Foto[] = [
  { nombreFichero: '01.avif', orden: 0, url: '/photos/demo/p/c/01.avif' },
  {
    nombreFichero: '02.avif',
    orden: 1,
    url: '/photos/demo/p/c/02.avif',
    metadatos: { camara: 'FUJIFILM X-T5', iso: 12800, apertura: 2.8, distanciaFocal: 23, exposicion: '1/250 s' },
  },
];

describe('Lightbox', () => {
  let fixture: ComponentFixture<Lightbox>;
  let el: HTMLElement;

  const pulsar = async (key: string) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key }));
    await fixture.whenStable();
  };
  const porcentaje = () => el.querySelector('.lightbox__porcentaje')?.textContent?.trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Lightbox],
    }).compileComponents();

    fixture = TestBed.createComponent(Lightbox);
    fixture.componentRef.setInput('photos', FOTOS);
    fixture.componentRef.setInput('index', 0);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('abre la foto encajada, solo con el botón de ampliar y sin minimapa', () => {
    expect(porcentaje()).toBeUndefined();
    expect(el.querySelector('[aria-label="Ampliar"]')).toBeTruthy();
    expect(el.querySelector('.lightbox__minimapa')).toBeNull();
  });

  it('amplía con + y muestra el porcentaje, el minimapa y el botón de encajar', async () => {
    await pulsar('+');
    expect(porcentaje()).toBe('150 %');
    expect(el.querySelector('.lightbox__minimapa')).toBeTruthy();
    expect(el.querySelector('[aria-label="Ver la foto entera"]')).toBeTruthy();
  });

  it('no pasa del zoom máximo ni baja de la foto encajada', async () => {
    for (let i = 0; i < 5; i++) await pulsar('+');
    expect(porcentaje()).toBe('200 %');
    expect((el.querySelector('[aria-label="Ampliar"]') as HTMLButtonElement).disabled).toBe(true);
    for (let i = 0; i < 5; i++) await pulsar('-');
    expect(porcentaje()).toBeUndefined();
  });

  it('con zoom, Escape encaja la foto y la segunda vez cierra el visor', async () => {
    const cerrar = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(cerrar);
    await pulsar('+');
    await pulsar('Escape');
    expect(porcentaje()).toBeUndefined();
    expect(cerrar).not.toHaveBeenCalled();
    await pulsar('Escape');
    expect(cerrar).toHaveBeenCalledOnce();
  });

  it('con zoom, las flechas mueven la foto en lugar de cambiar de foto', async () => {
    const cambio = vi.fn();
    fixture.componentInstance.indexChange.subscribe(cambio);
    await pulsar('+');
    await pulsar('ArrowRight');
    expect(cambio).not.toHaveBeenCalled();
    await pulsar('0');
    await pulsar('ArrowRight');
    expect(cambio).toHaveBeenCalledWith(1);
  });

  it('con zoom, muestra la cámara, el ISO, la apertura y la distancia focal de la foto, si los tiene', async () => {
    await pulsar('+');
    expect(el.querySelector('.lightbox__metadatos')).toBeNull();
    fixture.componentRef.setInput('index', 1);
    await fixture.whenStable();
    expect(el.querySelector('.lightbox__metadatos')).toBeNull();
    await pulsar('+');
    const datos = [...el.querySelectorAll('.lightbox__metadatos div')].map((d) => `${d.querySelector('dt')?.textContent} ${d.querySelector('dd')?.textContent}`);
    expect(datos).toEqual(['Cámara FUJIFILM X-T5', 'ISO 12.800', 'Apertura f/2,8', 'Distancia focal 23 mm']);
  });

  it('al cambiar de foto vuelve a encajarla', async () => {
    await pulsar('+');
    fixture.componentRef.setInput('index', 1);
    await fixture.whenStable();
    expect(porcentaje()).toBeUndefined();
  });
});

describe('Lightbox: controles del zoom', () => {
  afterEach(() => vi.useRealTimers());

  it('se ocultan solos y reaparecen al mover el ratón', async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [Lightbox] }).compileComponents();
    const fixture = TestBed.createComponent(Lightbox);
    fixture.componentRef.setInput('photos', FOTOS);
    fixture.componentRef.setInput('index', 0);
    fixture.detectChanges();
    const zoom = () => fixture.nativeElement.querySelector('.lightbox__zoom') as HTMLElement;

    expect(zoom().classList).not.toContain('lightbox__zoom--oculto');
    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(zoom().classList).toContain('lightbox__zoom--oculto');

    fixture.nativeElement.querySelector('.lightbox').dispatchEvent(new Event('pointermove'));
    fixture.detectChanges();
    expect(zoom().classList).not.toContain('lightbox__zoom--oculto');
  });
});

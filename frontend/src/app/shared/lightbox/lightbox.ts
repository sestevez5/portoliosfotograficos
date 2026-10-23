import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Foto } from '../../core/models/catalogo.model';
import { ANCHO_GRANDE, ANCHO_MINIATURA, conAncho } from '../foto-reducida/foto-reducida';

interface Punto {
  x: number;
  y: number;
}

// Cada pulsación de "+" o "−" multiplica o divide el zoom por este factor.
const PASO_ZOOM = 1.5;
// Zoom máximo: el que muestra la foto a su tamaño real (un píxel de la foto, un píxel CSS), pero
// nunca menos que este.
const ZOOM_MAXIMO_MINIMO = 2;
// Los controles del zoom se ocultan tras este tiempo sin mover el ratón ni tocar la pantalla.
const OCULTAR_CONTROLES_MS = 2500;
// Dos toques (o clics) más juntos que esto, en tiempo y distancia, son un doble toque.
const DOBLE_TOQUE_MS = 300;
const DOBLE_TOQUE_PX = 25;
// Por debajo de este desplazamiento, una pulsación es un toque y no un arrastre.
const ARRASTRE_MINIMO_PX = 4;
// Con zoom, cada pulsación de una flecha del teclado mueve la foto esta fracción de la ventana.
const PASO_TECLADO = 0.1;

// Números con la coma decimal del español ("2,8").
const formatoNumero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

const distancia = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);
const limitar = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, valor));

// Muestra siempre la versión grande de la foto (3840 px de lado largo como máximo), la de pantalla completa.
//
// Zoom: la foto se amplía dentro de su propio recuadro (el marco, si lo hay, sigue rodeando la zona
// visible), con la rueda, pellizcando, con doble clic o doble toque, con +, − y 0 o con la cápsula de
// abajo a la derecha, que se oculta sola. Con zoom, la foto se mueve arrastrándola, con las flechas
// del teclado o con el minimapa, que marca la zona visible. Las coordenadas son relativas al centro
// del recuadro: la foto se dibuja con translate(despl) scale(zoom) y origen en su centro.
//
// Con zoom, a la izquierda del minimapa, los datos de la toma que tenga la foto en su EXIF
// (cámara, ISO, apertura y distancia focal), que se ocultan con ellos.
@Component({
  selector: 'app-lightbox',
  styleUrl: './lightbox.scss',
  templateUrl: './lightbox.html',
})
export class Lightbox implements OnDestroy {
  readonly photos = input.required<Foto[]>();
  readonly index = input.required<number>();

  readonly closeRequested = output<void>();
  readonly indexChange = output<number>();

  private readonly ventana = viewChild.required<ElementRef<HTMLElement>>('ventana');
  private readonly foto = viewChild.required<ElementRef<HTMLImageElement>>('foto');

  protected readonly grande = (url: string) => conAncho(url, ANCHO_GRANDE);
  protected readonly miniatura = (url: string) => conAncho(url, ANCHO_MINIATURA);

  protected readonly zoom = signal(1);
  private readonly despl = signal<Punto>({ x: 0, y: 0 });
  // Tamaño en pantalla de la foto encajada (sin zoom).
  private readonly tamanyo = signal({ ancho: 0, alto: 0 });
  protected readonly zoomMaximo = signal(ZOOM_MAXIMO_MINIMO);
  // Transición suave al cambiar el zoom con los botones o el doble clic; no al arrastrar ni con la rueda.
  protected readonly animar = signal(false);
  protected readonly arrastrando = signal(false);
  protected readonly controlesVisibles = signal(true);

  // Datos de la toma de la foto actual: solo los que tenga.
  protected readonly datosToma = computed(() => {
    const m = this.photos()[this.index()]?.metadatos;
    if (!m) return [];
    const datos: { nombre: string; valor: string | undefined }[] = [
      { nombre: 'Cámara', valor: m.camara },
      { nombre: 'ISO', valor: m.iso ? formatoNumero.format(m.iso) : undefined },
      { nombre: 'Apertura', valor: m.apertura ? `f/${formatoNumero.format(m.apertura)}` : undefined },
      { nombre: 'Distancia focal', valor: m.distanciaFocal ? `${formatoNumero.format(m.distanciaFocal)} mm` : undefined },
    ];
    return datos.filter((dato): dato is { nombre: string; valor: string } => !!dato.valor);
  });

  protected readonly ampliada = computed(() => this.zoom() > 1);
  protected readonly porcentaje = computed(() => Math.round(this.zoom() * 100));
  protected readonly transformacion = computed(() => {
    const { x, y } = this.despl();
    return `translate(${x}px, ${y}px) scale(${this.zoom()})`;
  });
  // Zona visible de la foto, en porcentajes de la foto entera (el rectángulo del minimapa).
  protected readonly zonaVisible = computed(() => {
    const z = this.zoom();
    const { x, y } = this.despl();
    const { ancho, alto } = this.tamanyo();
    if (!ancho || !alto) return { left: 0, top: 0, width: 100, height: 100 };
    return {
      left: (0.5 - (ancho / 2 + x) / (z * ancho)) * 100,
      top: (0.5 - (alto / 2 + y) / (z * alto)) * 100,
      width: 100 / z,
      height: 100 / z,
    };
  });

  private readonly punteros = new Map<number, Punto>();
  private inicioGesto: Punto = { x: 0, y: 0 };
  private movido = false;
  private ultimoToque?: Punto & { t: number };
  // Al soltar un arrastre fuera de la foto, el clic llega al fondo: no debe cerrar el visor.
  private recienArrastrado = false;
  protected sobreControles = false;
  private temporizador?: ReturnType<typeof setTimeout>;

  constructor() {
    // Cada foto se abre encajada.
    effect(() => {
      this.index();
      untracked(() => this.restablecer());
    });
    this.mostrarControles();
  }

  ngOnDestroy(): void {
    clearTimeout(this.temporizador);
  }

  protected get current(): Foto {
    return this.photos()[this.index()];
  }

  protected close(): void {
    this.closeRequested.emit();
  }

  protected alPulsarFondo(): void {
    if (this.recienArrastrado) {
      this.recienArrastrado = false;
      return;
    }
    this.close();
  }

  protected goTo(delta: number): void {
    const total = this.photos().length;
    const next = (this.index() + delta + total) % total;
    this.indexChange.emit(next);
  }

  // --- Zoom ---

  protected medir(): void {
    const img = this.foto().nativeElement;
    const ancho = img.clientWidth;
    this.tamanyo.set({ ancho, alto: img.clientHeight });
    this.zoomMaximo.set(Math.max(ZOOM_MAXIMO_MINIMO, ancho ? img.naturalWidth / ancho : 0));
    this.restablecer();
  }

  protected ampliar(): void {
    this.animar.set(true);
    this.zoomEn(this.zoom() * PASO_ZOOM, { x: 0, y: 0 });
  }

  protected reducir(): void {
    this.animar.set(true);
    this.zoomEn(this.zoom() / PASO_ZOOM, { x: 0, y: 0 });
  }

  protected encajar(): void {
    this.animar.set(true);
    this.zoom.set(1);
    this.despl.set({ x: 0, y: 0 });
  }

  private restablecer(): void {
    this.animar.set(false);
    this.zoom.set(1);
    this.despl.set({ x: 0, y: 0 });
  }

  // Cambia el zoom dejando quieto el punto p (relativo al centro del recuadro).
  private zoomEn(nuevo: number, p: Punto): void {
    const z = this.zoom();
    const z2 = limitar(nuevo, 1, this.zoomMaximo());
    const { x, y } = this.despl();
    this.zoom.set(z2);
    this.fijarDespl(p.x - (z2 / z) * (p.x - x), p.y - (z2 / z) * (p.y - y));
  }

  // Sin dejar nunca hueco entre la foto y los bordes del recuadro.
  private fijarDespl(x: number, y: number): void {
    const z = this.zoom();
    const { ancho, alto } = this.tamanyo();
    const maxX = ((z - 1) * ancho) / 2;
    const maxY = ((z - 1) * alto) / 2;
    this.despl.set({ x: limitar(x, -maxX, maxX), y: limitar(y, -maxY, maxY) });
  }

  private desplazar(dx: number, dy: number): void {
    const { x, y } = this.despl();
    this.fijarDespl(x + dx, y + dy);
  }

  private relativoAlCentro(e: { clientX: number; clientY: number }): Punto {
    const r = this.ventana().nativeElement.getBoundingClientRect();
    return { x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) };
  }

  protected alGirarRueda(e: WheelEvent): void {
    e.preventDefault();
    this.animar.set(false);
    // Con deltaMode 1 (Firefox) llegan líneas en lugar de píxeles; con ctrlKey, el pellizco del panel táctil.
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1) * (e.ctrlKey ? 0.01 : 0.0015);
    this.zoomEn(this.zoom() * Math.exp(-delta), this.relativoAlCentro(e));
  }

  // --- Gestos: arrastrar, pellizcar y doble toque (ratón, lápiz y táctil con Pointer Events) ---

  protected alPulsar(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    this.recienArrastrado = false;
    this.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.punteros.size === 1) {
      this.inicioGesto = { x: e.clientX, y: e.clientY };
      this.movido = false;
    }
    this.animar.set(false);
    this.arrastrando.set(true);
  }

  protected alMover(e: PointerEvent): void {
    const anterior = this.punteros.get(e.pointerId);
    if (!anterior) return;
    const actual = { x: e.clientX, y: e.clientY };
    if (this.punteros.size === 1) {
      if (distancia(actual, this.inicioGesto) > ARRASTRE_MINIMO_PX) this.movido = true;
      if (this.ampliada()) this.desplazar(actual.x - anterior.x, actual.y - anterior.y);
    } else if (this.punteros.size === 2) {
      const otro = [...this.punteros].find(([id]) => id !== e.pointerId)![1];
      const antes = distancia(anterior, otro);
      const medioAntes = { x: (anterior.x + otro.x) / 2, y: (anterior.y + otro.y) / 2 };
      const medio = { x: (actual.x + otro.x) / 2, y: (actual.y + otro.y) / 2 };
      this.movido = true;
      if (antes > 0) this.zoomEn(this.zoom() * (distancia(actual, otro) / antes), this.relativoAlCentro({ clientX: medio.x, clientY: medio.y }));
      this.desplazar(medio.x - medioAntes.x, medio.y - medioAntes.y);
    }
    this.punteros.set(e.pointerId, actual);
  }

  protected alSoltar(e: PointerEvent): void {
    if (!this.punteros.delete(e.pointerId)) return;
    if (this.punteros.size > 0) return;
    this.arrastrando.set(false);
    if (this.movido) {
      this.recienArrastrado = true;
      return;
    }
    const ahora = performance.now();
    const ultimo = this.ultimoToque;
    if (ultimo && ahora - ultimo.t < DOBLE_TOQUE_MS && distancia(ultimo, { x: e.clientX, y: e.clientY }) < DOBLE_TOQUE_PX) {
      this.ultimoToque = undefined;
      this.alternarZoom(this.relativoAlCentro(e));
    } else {
      this.ultimoToque = { x: e.clientX, y: e.clientY, t: ahora };
    }
  }

  protected alCancelar(e: PointerEvent): void {
    this.punteros.delete(e.pointerId);
    if (this.punteros.size === 0) this.arrastrando.set(false);
  }

  // Doble clic o doble toque: amplía al máximo en ese punto o, si ya está ampliada, la encaja.
  private alternarZoom(p: Punto): void {
    if (this.ampliada()) {
      this.encajar();
    } else {
      this.animar.set(true);
      this.zoomEn(this.zoomMaximo(), p);
    }
  }

  // --- Minimapa: pulsarlo o arrastrar sobre él centra la vista en ese punto ---

  protected alPulsarMinimapa(e: PointerEvent): void {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    this.animar.set(false);
    this.irA(e);
  }

  protected alMoverMinimapa(e: PointerEvent): void {
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) this.irA(e);
  }

  private irA(e: PointerEvent): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!r.width || !r.height) return;
    const fx = (e.clientX - r.left) / r.width - 0.5;
    const fy = (e.clientY - r.top) / r.height - 0.5;
    const z = this.zoom();
    const { ancho, alto } = this.tamanyo();
    this.fijarDespl(-z * fx * ancho, -z * fy * alto);
  }

  // --- Controles que se ocultan solos ---

  protected mostrarControles(): void {
    this.controlesVisibles.set(true);
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      if (!this.sobreControles) this.controlesVisibles.set(false);
    }, OCULTAR_CONTROLES_MS);
  }

  @HostListener('window:resize')
  protected alRedimensionar(): void {
    this.medir();
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    const { ancho, alto } = this.tamanyo();
    const ampliada = this.ampliada();
    switch (event.key) {
      case 'Escape':
        if (ampliada) this.encajar();
        else this.close();
        break;
      case 'ArrowRight':
        if (ampliada) this.desplazar(-ancho * PASO_TECLADO, 0);
        else this.goTo(1);
        break;
      case 'ArrowLeft':
        if (ampliada) this.desplazar(ancho * PASO_TECLADO, 0);
        else this.goTo(-1);
        break;
      case 'ArrowUp':
        if (ampliada) this.desplazar(0, alto * PASO_TECLADO);
        break;
      case 'ArrowDown':
        if (ampliada) this.desplazar(0, -alto * PASO_TECLADO);
        break;
      case '+':
      case '=':
        this.ampliar();
        break;
      case '-':
        this.reducir();
        break;
      case '0':
        this.encajar();
        break;
      default:
        return;
    }
    this.mostrarControles();
  }
}

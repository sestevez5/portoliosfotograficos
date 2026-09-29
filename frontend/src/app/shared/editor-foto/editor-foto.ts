import { Component, ElementRef, OnDestroy, computed, effect, model, output, signal, viewChild } from '@angular/core';

// Lado del visor de encuadre (px) y de la foto que se exporta (px, cuadrada: la web la muestra
// en un círculo).
const VISOR = 288;
const SALIDA = 512;
const ZOOM_MAXIMO = 4;

type Paso = 'origen' | 'camara' | 'encuadre';

// play() devuelve una promesa que puede rechazarse (p. ej. si se interrumpe); no es un error.
function reproducir(video: HTMLVideoElement): void {
  try {
    void video.play()?.catch(() => undefined);
  } catch {
    // Entornos sin reproducción (p. ej. los tests).
  }
}

// Editor de la foto de perfil (diálogo modal). 1) Origen: un archivo o la cámara (con vista en
// vivo y "Capturar"). 2) Encuadre: la imagen bajo una máscara circular; se mueve arrastrando
// (ratón o dedo) y se amplía con el deslizador o la rueda, sin dejar nunca hueco dentro del
// círculo. 3) "Aceptar" recorta en el navegador lo que se ve en el círculo y emite un JPEG
// cuadrado de SALIDA × SALIDA px. Se abre mientras "abierto" es true ([(abierto)]).
@Component({
  selector: 'app-editor-foto',
  styleUrl: './editor-foto.scss',
  templateUrl: './editor-foto.html',
  host: { '(document:keydown.escape)': 'cancelar()' },
})
export class EditorFoto implements OnDestroy {
  readonly abierto = model(false);
  // La foto recortada, lista para subir.
  readonly aceptada = output<Blob>();

  protected readonly visor = VISOR;
  protected readonly zoomMaximo = ZOOM_MAXIMO;
  protected readonly paso = signal<Paso>('origen');
  protected readonly error = signal<string | null>(null);

  // Imagen cargada y su encuadre: zoom (1 = cubre justo el círculo) y desplazamiento (px del
  // visor) respecto al centro.
  protected readonly imagen = signal<HTMLImageElement | null>(null);
  protected readonly zoom = signal(1);
  protected readonly desplazamiento = signal({ x: 0, y: 0 });

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  // La cámara abierta y si ya da imagen (hasta entonces no se puede capturar).
  private readonly camara = signal<MediaStream | null>(null);
  protected readonly camaraLista = signal(false);
  private abriendoCamara = false;
  private arrastre: { x: number; y: number; inicio: { x: number; y: number } } | null = null;

  // Escala para que la imagen cubra justo el visor, y la real con el zoom.
  private readonly escalaMinima = computed(() => {
    const img = this.imagen();
    return img ? Math.max(VISOR / img.naturalWidth, VISOR / img.naturalHeight) : 1;
  });
  protected readonly escala = computed(() => this.escalaMinima() * this.zoom());

  // Posición y tamaño de la imagen dentro del visor, para pintarla y para recortarla.
  protected readonly caja = computed(() => {
    const img = this.imagen();
    if (!img) return { izquierda: 0, arriba: 0, ancho: 0, alto: 0 };
    const ancho = img.naturalWidth * this.escala();
    const alto = img.naturalHeight * this.escala();
    const { x, y } = this.desplazamiento();
    return { izquierda: VISOR / 2 - ancho / 2 + x, arriba: VISOR / 2 - alto / 2 + y, ancho, alto };
  });

  constructor() {
    // showModal()/close() pueden no existir fuera de un navegador real (p. ej. en los tests).
    effect(() => {
      const dialogo = this.dialogo().nativeElement;
      if (this.abierto() && !dialogo.open) {
        this.reiniciar();
        if (typeof dialogo.showModal === 'function') dialogo.showModal();
        else dialogo.setAttribute('open', '');
      } else if (!this.abierto() && dialogo.open) {
        this.pararCamara();
        if (typeof dialogo.close === 'function') dialogo.close();
        else dialogo.removeAttribute('open');
      }
    });

    // La cámara se conecta al <video> en cuanto los dos existen: el <video> aparece al pasar al
    // paso "camara", después de que Angular lo pinte (no justo al cambiar de paso).
    effect(() => {
      const video = this.video()?.nativeElement;
      const camara = this.camara();
      if (video && camara && video.srcObject !== camara) {
        video.srcObject = camara;
        reproducir(video);
      }
    });
  }

  ngOnDestroy(): void {
    this.pararCamara();
  }

  private reiniciar(): void {
    this.paso.set('origen');
    this.error.set(null);
    this.imagen.set(null);
  }

  // ---------------- Origen ----------------

  protected elegirArchivo(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) {
      this.error.set('El archivo elegido no es una imagen.');
      return;
    }
    const url = URL.createObjectURL(archivo);
    this.cargarImagen(url, () => URL.revokeObjectURL(url));
  }

  protected async usarCamara(): Promise<void> {
    // Una sola cámara a la vez (p. ej. si se pulsa dos veces mientras se pide permiso).
    if (this.abriendoCamara || this.camara()) return;
    this.error.set(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set('Este navegador no permite usar la cámara aquí (hace falta una conexión segura: https o localhost).');
      return;
    }
    this.abriendoCamara = true;
    try {
      const camara = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      // Si mientras se daba permiso se cerró el editor, se apaga enseguida.
      if (!this.abierto()) {
        camara.getTracks().forEach((pista) => pista.stop());
        return;
      }
      this.camaraLista.set(false);
      this.camara.set(camara);
      this.paso.set('camara');
    } catch {
      this.error.set('No se ha podido usar la cámara: comprueba que hay una, que no la está usando otra aplicación y que has dado permiso.');
    } finally {
      this.abriendoCamara = false;
    }
  }

  // El <video> ya da imagen: se puede capturar.
  protected alTenerImagen(): void {
    this.camaraLista.set(true);
  }

  // La vista de la cámara se ve como en un espejo; la captura se hace igual, para que la foto
  // sea la que se estaba viendo.
  protected capturar(): void {
    const video = this.video()?.nativeElement;
    if (!video || !video.videoWidth) {
      this.error.set('La cámara aún no da imagen. Espera un momento y vuelve a intentarlo.');
      return;
    }
    const lienzo = document.createElement('canvas');
    lienzo.width = video.videoWidth;
    lienzo.height = video.videoHeight;
    const contexto = lienzo.getContext('2d')!;
    contexto.translate(lienzo.width, 0);
    contexto.scale(-1, 1);
    contexto.drawImage(video, 0, 0);
    this.pararCamara();
    this.cargarImagen(lienzo.toDataURL('image/jpeg', 0.95));
  }

  protected volverAlOrigen(): void {
    this.pararCamara();
    this.reiniciar();
  }

  // Apaga la cámara (se apaga su luz) y la desconecta del <video>.
  private pararCamara(): void {
    this.camara()?.getTracks().forEach((pista) => pista.stop());
    this.camara.set(null);
    this.camaraLista.set(false);
    const video = this.video()?.nativeElement;
    if (video) {
      video.srcObject = null;
    }
  }

  private cargarImagen(url: string, alTerminar?: () => void): void {
    const img = new Image();
    img.onload = () => {
      this.imagen.set(img);
      this.zoom.set(1);
      this.desplazamiento.set({ x: 0, y: 0 });
      this.paso.set('encuadre');
      this.error.set(null);
    };
    img.onerror = () => {
      this.error.set('No se ha podido abrir la imagen.');
      alTerminar?.();
    };
    img.src = url;
  }

  // ---------------- Encuadre ----------------

  // La imagen siempre cubre el círculo: el desplazamiento se limita a lo que sobra por cada lado.
  private limitar(x: number, y: number): { x: number; y: number } {
    const img = this.imagen();
    if (!img) return { x: 0, y: 0 };
    const margenX = (img.naturalWidth * this.escala() - VISOR) / 2;
    const margenY = (img.naturalHeight * this.escala() - VISOR) / 2;
    // "|| 0" evita el -0 que da limitar un valor negativo a un margen de 0.
    return { x: Math.max(-margenX, Math.min(margenX, x)) || 0, y: Math.max(-margenY, Math.min(margenY, y)) || 0 };
  }

  protected cambiarZoom(valor: number): void {
    this.zoom.set(Math.max(1, Math.min(ZOOM_MAXIMO, valor)));
    const { x, y } = this.desplazamiento();
    this.desplazamiento.set(this.limitar(x, y));
  }

  protected alGirarRueda(evento: WheelEvent): void {
    evento.preventDefault();
    this.cambiarZoom(this.zoom() * (1 - evento.deltaY * 0.0015));
  }

  protected empezarArrastre(evento: PointerEvent): void {
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    this.arrastre = { x: evento.clientX, y: evento.clientY, inicio: this.desplazamiento() };
  }

  protected arrastrar(evento: PointerEvent): void {
    if (!this.arrastre) return;
    const { x, y, inicio } = this.arrastre;
    this.desplazamiento.set(this.limitar(inicio.x + evento.clientX - x, inicio.y + evento.clientY - y));
  }

  protected terminarArrastre(): void {
    this.arrastre = null;
  }

  // Con el teclado: flechas para mover, + y - para ampliar.
  protected alPulsarTecla(evento: KeyboardEvent): void {
    const paso = 8;
    const { x, y } = this.desplazamiento();
    const movimientos: Record<string, [number, number]> = {
      ArrowLeft: [-paso, 0],
      ArrowRight: [paso, 0],
      ArrowUp: [0, -paso],
      ArrowDown: [0, paso],
    };
    if (movimientos[evento.key]) {
      evento.preventDefault();
      const [dx, dy] = movimientos[evento.key];
      this.desplazamiento.set(this.limitar(x + dx, y + dy));
    } else if (evento.key === '+' || evento.key === '-') {
      evento.preventDefault();
      this.cambiarZoom(this.zoom() + (evento.key === '+' ? 0.1 : -0.1));
    }
  }

  // Recorta lo que se ve en el círculo (el cuadrado del visor) a SALIDA × SALIDA px.
  protected aceptar(): void {
    const img = this.imagen();
    if (!img) return;
    const { izquierda, arriba } = this.caja();
    const escala = this.escala();
    const lienzo = document.createElement('canvas');
    lienzo.width = SALIDA;
    lienzo.height = SALIDA;
    const contexto = lienzo.getContext('2d')!;
    contexto.imageSmoothingQuality = 'high';
    contexto.drawImage(img, -izquierda / escala, -arriba / escala, VISOR / escala, VISOR / escala, 0, 0, SALIDA, SALIDA);
    lienzo.toBlob(
      (foto) => {
        if (foto) {
          this.aceptada.emit(foto);
          this.abierto.set(false);
        } else {
          this.error.set('No se ha podido preparar la foto.');
        }
      },
      'image/jpeg',
      0.9,
    );
  }

  protected cancelar(): void {
    if (this.abierto()) {
      this.abierto.set(false);
    }
  }
}

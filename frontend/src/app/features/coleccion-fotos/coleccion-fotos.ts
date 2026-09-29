import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ColeccionDetalle, Foto, ReglaNegocioIncumplida } from '../../core/models/catalogo.model';
import { CatalogoService } from '../../core/services/catalogo';
import { Confirmacion } from '../../shared/confirmacion/confirmacion';
import { OrdenPorArrastre } from '../../shared/orden-arrastre/orden-arrastre';
import { FotoReducida } from '../../shared/foto-reducida/foto-reducida';

// Formatos y tamaño que admite el backend (FOTO_FORMATO_NO_VALIDO): se comprueban también aquí para
// avisar sin llegar a subir el archivo.
const TIPOS_ADMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANYO_MAXIMO_MB = 25;

// El título de una foto tiene menos de 20 caracteres (FOTO_TITULO_DEMASIADO_LARGO); sin título, se
// muestra "Sin título".
const LONGITUD_MAXIMA_TITULO = 19;
const SIN_TITULO = 'Sin título';

interface Subida {
  id: number;
  archivo: File;
  estado: 'pendiente' | 'subiendo' | 'error';
  mensaje?: string;
}

// "Gestionar fotos" de una colección, para su fotógrafo propietario
// (/gestion/:fotografo/portfolios/:portfolio/colecciones/:coleccion/fotos): añadir varias fotos a la
// vez, eligiéndolas o arrastrándolas, ordenarlas arrastrándolas dentro de la cuadrícula, elegir la
// portada (la estrella), cambiar su título y eliminarlas. Las fotos se suben de una en una y en el orden
// en que se eligieron (el backend las añade al final); las que fallan se quedan en la lista con el
// motivo (la regla incumplida).
@Component({
  imports: [RouterLink, Confirmacion, FotoReducida],
  selector: 'app-coleccion-fotos',
  styleUrl: './coleccion-fotos.scss',
  templateUrl: './coleccion-fotos.html',
  host: {
    // Soltar un archivo fuera de la zona no debe hacer que el navegador lo abra.
    '(dragover)': '$event.preventDefault()',
    '(drop)': '$event.preventDefault()',
  },
})
export class ColeccionFotos {
  private readonly catalogoService = inject(CatalogoService);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly fotografo = this.params.get('fotografo')!;
  protected readonly portfolio = this.params.get('portfolio')!;
  protected readonly coleccionSegmento = this.params.get('coleccion')!;

  protected readonly tiposAdmitidos = TIPOS_ADMITIDOS.join(',');
  protected readonly tamanyoMaximoMB = TAMANYO_MAXIMO_MB;
  protected readonly longitudMaximaTitulo = LONGITUD_MAXIMA_TITULO;
  protected readonly sinTitulo = SIN_TITULO;

  // undefined = cargando, null = no encontrada
  protected readonly coleccion = signal<ColeccionDetalle | null | undefined>(undefined);
  protected readonly fotos = signal<Foto[]>([]);

  protected readonly subidas = signal<Subida[]>([]);
  protected readonly pendientes = computed(() => this.subidas().filter((s) => s.estado !== 'error').length);
  protected readonly errores = computed(() => this.subidas().filter((s) => s.estado === 'error').length);
  protected readonly arrastrando = signal(false);

  protected readonly fotoAEliminar = signal<Foto | null>(null);
  protected readonly eliminando = signal<string | null>(null);
  // Error al eliminar, al guardar el orden o al cambiar la portada.
  protected readonly aviso = signal<string | null>(null);

  // Foto elegida como portada (su nombreFichero), o null si no hay ninguna (la portada es entonces la
  // primera). Se marca con la estrella de cada foto; pulsar la de la portada la quita.
  protected readonly portada = signal<string | null>(null);
  protected readonly cambiandoPortada = signal(false);

  // Mientras se escribe un título no se arrastran las tarjetas (para poder seleccionar el texto).
  protected readonly editandoTitulo = signal(false);
  // Fotos cuyo título se está guardando (su nombreFichero).
  protected readonly guardandoTitulo = signal<ReadonlySet<string>>(new Set());

  // Ordenar arrastrando las fotos dentro de la cuadrícula (ver OrdenPorArrastre). Al soltar se
  // guarda el orden nuevo; si no se puede, vuelve al anterior.
  protected readonly guardandoOrden = signal(false);
  protected readonly orden = new OrdenPorArrastre(
    this.fotos,
    (foto) => foto.nombreFichero,
    (ahora, antes) => this.guardarOrden(ahora, antes),
  );
  // Mientras se sube o se elimina una foto no se reordena: el orden que se enviaría no incluiría
  // exactamente las fotos dla colección.
  protected readonly puedeOrdenar = computed(
    () => this.fotos().length > 1 && this.pendientes() === 0 && this.eliminando() === null && !this.guardandoOrden(),
  );

  private siguienteId = 0;
  private subidaEnCurso: Subscription | null = null;

  constructor() {
    this.catalogoService.getColeccionDePortfolio(this.fotografo, this.portfolio, this.coleccionSegmento).subscribe({
      next: (coleccion) => {
        this.coleccion.set(coleccion);
        this.fotos.set(coleccion.fotos);
        this.portada.set(coleccion.fotoPortada ?? null);
      },
      error: () => this.coleccion.set(null),
    });
    // Al salir de la página se cancela la subida en curso y no se empiezan más.
    inject(DestroyRef).onDestroy(() => {
      this.subidas.set([]);
      this.subidaEnCurso?.unsubscribe();
    });
  }

  protected readonly volver = ['/', this.fotografo, this.portfolio, this.coleccionSegmento];

  // ---------------- Añadir ----------------

  protected alElegir(input: HTMLInputElement): void {
    this.anyadir(input.files);
    input.value = ''; // para poder volver a elegir los mismos archivos
  }

  // La zona solo reacciona a archivos del equipo, no a una foto que se está reordenando.
  private traeArchivos = (evento: DragEvent) => evento.dataTransfer?.types.includes('Files') ?? false;

  protected alArrastrarEncima(evento: DragEvent): void {
    if (!this.traeArchivos(evento)) {
      return;
    }
    evento.preventDefault();
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'copy';
    this.arrastrando.set(true);
  }

  protected alSalir(evento: DragEvent): void {
    // dragleave salta también al pasar sobre un elemento hijo: solo cuenta si sale de la zona.
    const zona = evento.currentTarget as HTMLElement;
    if (!zona.contains(evento.relatedTarget as Node | null)) {
      this.arrastrando.set(false);
    }
  }

  protected alSoltar(evento: DragEvent): void {
    evento.preventDefault();
    if (!this.traeArchivos(evento)) {
      return;
    }
    this.arrastrando.set(false);
    this.anyadir(evento.dataTransfer?.files ?? null);
  }

  private anyadir(archivos: FileList | null): void {
    const nuevas = Array.from(archivos ?? []).map((archivo): Subida => {
      const motivo = !TIPOS_ADMITIDOS.includes(archivo.type)
        ? 'No es una imagen JPEG, PNG o WebP.'
        : archivo.size > TAMANYO_MAXIMO_MB * 1024 * 1024
          ? `Ocupa más de ${TAMANYO_MAXIMO_MB} MB.`
          : undefined;
      return { id: this.siguienteId++, archivo, estado: motivo ? 'error' : 'pendiente', mensaje: motivo };
    });
    this.subidas.update((subidas) => [...subidas, ...nuevas]);
    this.subirSiguiente();
  }

  // Sube la primera pendiente si no hay otra subiendo; al terminar, sigue con la siguiente.
  private subirSiguiente(): void {
    const subidas = this.subidas();
    const siguiente = subidas.find((s) => s.estado === 'pendiente');
    if (!siguiente || subidas.some((s) => s.estado === 'subiendo')) {
      return;
    }

    this.actualizar(siguiente.id, { estado: 'subiendo' });
    this.subidaEnCurso = this.catalogoService
      .anyadirFoto(this.fotografo, this.portfolio, this.coleccionSegmento, siguiente.archivo)
      .subscribe({
        next: (foto) => {
          this.fotos.update((fotos) => [...fotos, foto]);
          this.subidas.update((subidas) => subidas.filter((s) => s.id !== siguiente.id));
          this.subirSiguiente();
        },
        error: (respuesta: HttpErrorResponse) => {
          this.actualizar(siguiente.id, { estado: 'error', mensaje: mensajeDeError(respuesta, 'No se ha podido subir.') });
          this.subirSiguiente();
        },
      });
  }

  private actualizar(id: number, cambios: Partial<Subida>): void {
    this.subidas.update((subidas) => subidas.map((s) => (s.id === id ? { ...s, ...cambios } : s)));
  }

  protected descartarErrores(): void {
    this.subidas.update((subidas) => subidas.filter((s) => s.estado !== 'error'));
  }

  // ---------------- Ordenar ----------------

  private guardarOrden(ahora: Foto[], antes: Foto[]): void {
    this.aviso.set(null);
    this.guardandoOrden.set(true);
    const nombres = ahora.map((f) => f.nombreFichero);
    this.catalogoService.ordenarFotos(this.fotografo, this.portfolio, this.coleccionSegmento, nombres).subscribe({
      next: () => this.guardandoOrden.set(false),
      error: (respuesta: HttpErrorResponse) => {
        this.guardandoOrden.set(false);
        this.fotos.set(antes);
        this.aviso.set(mensajeDeError(respuesta, 'No se ha podido guardar el nuevo orden.'));
      },
    });
  }

  // ---------------- Portada ----------------

  protected alternarPortada(foto: Foto): void {
    const antes = this.portada();
    const nueva = antes === foto.nombreFichero ? null : foto.nombreFichero;
    this.portada.set(nueva); // se marca ya; si no se puede guardar, vuelve a como estaba
    this.cambiandoPortada.set(true);
    this.aviso.set(null);
    this.catalogoService.cambiarPortada(this.fotografo, this.portfolio, this.coleccionSegmento, nueva).subscribe({
      next: () => this.cambiandoPortada.set(false),
      error: (respuesta: HttpErrorResponse) => {
        this.cambiandoPortada.set(false);
        this.portada.set(antes);
        this.aviso.set(mensajeDeError(respuesta, 'No se ha podido cambiar la portada.'));
      },
    });
  }

  // ---------------- Título ----------------

  // Guarda el título al salir del cuadro (o con Intro) si ha cambiado. Vacío o "Sin título" es no
  // tener título. Si no se puede guardar, el cuadro vuelve al título anterior.
  protected guardarTitulo(foto: Foto, input: HTMLInputElement): void {
    const limpio = input.value.trim();
    const nuevo = limpio && limpio !== SIN_TITULO ? limpio : null;
    const antes = foto.titulo ?? null;
    input.value = nuevo ?? '';
    if (nuevo === antes) {
      return;
    }

    this.aviso.set(null);
    this.marcarGuardandoTitulo(foto.nombreFichero, true);
    this.catalogoService
      .cambiarTituloFoto(this.fotografo, this.portfolio, this.coleccionSegmento, foto.nombreFichero, nuevo)
      .subscribe({
        next: (guardada) => {
          this.marcarGuardandoTitulo(foto.nombreFichero, false);
          this.fotos.update((fotos) =>
            fotos.map((f) => (f.nombreFichero === foto.nombreFichero ? { ...f, titulo: guardada.titulo } : f)),
          );
          input.value = guardada.titulo ?? '';
        },
        error: (respuesta: HttpErrorResponse) => {
          this.marcarGuardandoTitulo(foto.nombreFichero, false);
          input.value = antes ?? '';
          this.aviso.set(mensajeDeError(respuesta, 'No se ha podido cambiar el título.'));
        },
      });
  }

  // Escape deshace lo escrito y sale del cuadro (sin guardar nada).
  protected descartarTitulo(foto: Foto, input: HTMLInputElement): void {
    input.value = foto.titulo ?? '';
    input.blur();
  }

  private marcarGuardandoTitulo(nombreFichero: string, guardando: boolean): void {
    this.guardandoTitulo.update((actuales) => {
      const nuevos = new Set(actuales);
      if (guardando) nuevos.add(nombreFichero);
      else nuevos.delete(nombreFichero);
      return nuevos;
    });
  }

  // ---------------- Eliminar ----------------

  protected confirmarEliminar(): void {
    const foto = this.fotoAEliminar();
    this.fotoAEliminar.set(null);
    if (!foto) {
      return;
    }
    this.eliminando.set(foto.nombreFichero);
    this.aviso.set(null);
    this.catalogoService.eliminarFoto(this.fotografo, this.portfolio, this.coleccionSegmento, foto.nombreFichero).subscribe({
      next: () => {
        this.eliminando.set(null);
        this.fotos.update((fotos) => fotos.filter((f) => f.nombreFichero !== foto.nombreFichero));
        // Si era la portada, la colección se queda sin portada elegida (el backend hace lo mismo).
        if (this.portada() === foto.nombreFichero) {
          this.portada.set(null);
        }
      },
      error: (respuesta: HttpErrorResponse) => {
        this.eliminando.set(null);
        this.aviso.set(mensajeDeError(respuesta, `No se ha podido eliminar "${foto.nombreFichero}".`));
      },
    });
  }
}

// El motivo de una regla incumplida (422) o el mensaje del backend; si no hay, el texto indicado.
function mensajeDeError(respuesta: HttpErrorResponse, porDefecto: string): string {
  if (respuesta.status === 422 && respuesta.error?.tipo === 'reglaNegocioIncumplida') {
    return (respuesta.error as ReglaNegocioIncumplida).regla.mensaje;
  }
  if (respuesta.status === 413) {
    return `Ocupa más de ${TAMANYO_MAXIMO_MB} MB.`;
  }
  return respuesta.error?.message ?? (respuesta.status === 0 ? 'No se ha podido conectar con el servidor.' : porDefecto);
}

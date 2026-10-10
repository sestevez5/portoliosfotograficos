import { Component, OnDestroy, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, catchError, map, of, switchMap, tap } from 'rxjs';
import { FotografoAlta, FotografoPublico, ReglaNegocioIncumplida } from '../../core/models/catalogo.model';
import { CatalogoService } from '../../core/services/catalogo';
import { SesionService } from '../../core/services/sesion';
import { Avatar } from '../../shared/avatar/avatar';
import { EditorFoto } from '../../shared/editor-foto/editor-foto';
import { AvisoVisible } from '../../shared/aviso-visible/aviso-visible';

// Debe coincidir con LONGITUD_MINIMA_CONTRASENYA del backend (reglas/validaciones.ts).
const LONGITUD_MINIMA_CONTRASENYA = 8;

// Las dos contraseñas deben coincidir (solo en el navegador: el backend recibe una).
function contrasenyasIguales(grupo: AbstractControl): ValidationErrors | null {
  const { contrasenya, repetirContrasenya } = grupo.value as { contrasenya: string; repetirContrasenya: string };
  return contrasenya === repetirContrasenya ? null : { contrasenyasDistintas: true };
}

// Nombre de usuario elegido al registrarse; debe coincidir con la regla del backend
// (reglas/validaciones.ts), que es quien decide. Se guarda en minúsculas y sin los espacios de los
// extremos (por eso aquí se admiten).
const USUARIO = /^\s*[a-zA-Z0-9][a-zA-Z0-9._-]{2,29}\s*$/;

// Alta y edición de un fotógrafo (/admin/fotografos/nuevo y /admin/fotografos/:fotografo/editar)
// y registro de un usuario fotógrafo (/registro, ruta con data.modo = 'registro'). El registro
// añade el nombre de usuario y hace obligatorios el correo y la contraseña (con ellos se inicia
// sesión); al terminar, la sesión queda iniciada. El formulario hace comprobaciones básicas para
// avisar pronto, pero quien decide es el backend: si incumple una regla de negocio se muestra qué
// se intentaba y por qué no se ha podido. El nombreInformalNormalizado (dirección y carpeta) lo
// calcula el backend y no se muestra. Al editar, una contraseña vacía conserva la actual.
@Component({
  imports: [ReactiveFormsModule, RouterLink, Avatar, EditorFoto, AvisoVisible],
  selector: 'app-fotografo-form',
  styleUrl: './fotografo-form.scss',
  templateUrl: './fotografo-form.html',
})
export class FotografoForm implements OnDestroy {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly catalogoService = inject(CatalogoService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute).snapshot;

  // Fotógrafo que se edita (su nombreInformalNormalizado en la URL); null en el alta y el registro.
  protected readonly fotografoEditado = this.ruta.paramMap.get('fotografo');
  protected readonly editando = this.fotografoEditado !== null;
  protected readonly registro = this.ruta.data['modo'] === 'registro';
  protected readonly cargando = signal(this.editando);

  protected readonly longitudMinima = LONGITUD_MINIMA_CONTRASENYA;

  protected readonly formulario = this.fb.group(
    {
      // Solo en el registro (ver constructor).
      usuario: [''],
      nombreInformal: ['', Validators.required],
      nombre: ['', Validators.required],
      primerApellido: ['', Validators.required],
      segundoApellido: [''],
      email: ['', Validators.email],
      descripcion: [''],
      contrasenya: ['', Validators.minLength(LONGITUD_MINIMA_CONTRASENYA)],
      repetirContrasenya: [''],
    },
    { validators: contrasenyasIguales },
  );

  protected readonly enviando = signal(false);
  protected readonly reglaIncumplida = signal<ReglaNegocioIncumplida | null>(null);
  protected readonly errorGeneral = signal<string | null>(null);

  // Foto de perfil. Al editar se sube (o se quita) en cuanto se acepta en el editor; en el alta y
  // el registro se guarda aquí (fotoPendiente) y se sube al crear el fotógrafo.
  protected readonly nombreParaAvatar = toSignal(this.formulario.controls.nombreInformal.valueChanges, { initialValue: '' });
  protected readonly fotoUrl = signal<string | undefined>(undefined);
  protected readonly editorAbierto = signal(false);
  protected readonly guardandoFoto = signal(false);
  protected readonly errorFoto = signal<string | null>(null);
  private fotoPendiente: Blob | null = null;

  constructor() {
    if (this.registro) {
      const { usuario, email, contrasenya } = this.formulario.controls;
      usuario.setValidators([Validators.required, Validators.pattern(USUARIO)]);
      email.setValidators([Validators.required, Validators.email]);
      contrasenya.setValidators([Validators.required, Validators.minLength(LONGITUD_MINIMA_CONTRASENYA)]);
    }
    if (this.fotografoEditado) {
      this.catalogoService.getFotografoEdicion(this.fotografoEditado).subscribe({
        next: (datos) => {
          // La contraseña no se edita aquí, sino en "Editar cuenta".
          const { tieneContrasenya: _, fotoUrl, ...valores } = datos;
          this.formulario.patchValue(valores);
          this.fotoUrl.set(fotoUrl);
          this.cargando.set(false);
        },
        error: (respuesta: HttpErrorResponse) => {
          this.cargando.set(false);
          this.errorGeneral.set(respuesta.error?.message ?? 'No se han podido cargar los datos del fotógrafo.');
        },
      });
    }
  }

  ngOnDestroy(): void {
    this.soltarVistaPrevia();
  }

  // La vista previa de una foto pendiente es una URL local (blob:) que hay que liberar.
  private soltarVistaPrevia(): void {
    const url = this.fotoUrl();
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  // Si el fotógrafo es el que tiene la sesión iniciada, sus datos del menú (foto, nombre informal,
  // correo) se actualizan.
  private refrescarSesionSiEsSuya(fotografo: string): void {
    if (this.sesion.usuario()?.fotografo?.nombreInformalNormalizado === fotografo) {
      this.sesion.cargar();
    }
  }

  protected fotoAceptada(foto: Blob): void {
    this.errorFoto.set(null);
    if (!this.fotografoEditado) {
      this.soltarVistaPrevia();
      this.fotoPendiente = foto;
      this.fotoUrl.set(URL.createObjectURL(foto));
      return;
    }
    const fotografo = this.fotografoEditado;
    this.guardandoFoto.set(true);
    this.catalogoService.subirFotoPerfil(fotografo, foto).subscribe({
      next: (url) => {
        this.guardandoFoto.set(false);
        this.fotoUrl.set(url);
        this.refrescarSesionSiEsSuya(fotografo);
      },
      error: (respuesta: HttpErrorResponse) => {
        this.guardandoFoto.set(false);
        this.errorFoto.set(respuesta.error?.regla?.mensaje ?? respuesta.error?.message ?? 'No se ha podido guardar la foto.');
      },
    });
  }

  protected quitarFoto(): void {
    this.errorFoto.set(null);
    if (!this.fotografoEditado) {
      this.soltarVistaPrevia();
      this.fotoPendiente = null;
      this.fotoUrl.set(undefined);
      return;
    }
    const fotografo = this.fotografoEditado;
    this.guardandoFoto.set(true);
    this.catalogoService.quitarFotoPerfil(fotografo).subscribe({
      next: () => {
        this.guardandoFoto.set(false);
        this.fotoUrl.set(undefined);
        this.refrescarSesionSiEsSuya(fotografo);
      },
      error: () => {
        this.guardandoFoto.set(false);
        this.errorFoto.set('No se ha podido quitar la foto.');
      },
    });
  }

  // Tras crear el fotógrafo (alta o registro), sube su foto pendiente, si la hay. Si falla, el
  // fotógrafo ya está creado: se sigue igualmente (podrá ponerla al editar).
  private subirFotoPendiente(fotografo: string): Observable<string> {
    if (!this.fotoPendiente) {
      return of(fotografo);
    }
    return this.catalogoService.subirFotoPerfil(fotografo, this.fotoPendiente).pipe(
      tap(() => this.refrescarSesionSiEsSuya(fotografo)),
      map(() => fotografo),
      catchError(() => of(fotografo)),
    );
  }

  // Muestra los errores de un campo solo cuando el usuario ya lo ha tocado o ha intentado enviar.
  protected mostrarError(campo: keyof typeof this.formulario.controls, error: string): boolean {
    const control = this.formulario.controls[campo];
    return control.hasError(error) && (control.touched || control.dirty);
  }

  protected enviar(): void {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.enviando()) {
      return;
    }

    const { repetirContrasenya: _, usuario, ...valores } = this.formulario.getRawValue();
    // Los opcionales vacíos no se envían (al editar, eso los deja vacíos). Al editar no hay
    // contraseña: se cambia en "Editar cuenta".
    const alta: FotografoAlta = {
      nombreInformal: valores.nombreInformal,
      nombre: valores.nombre,
      primerApellido: valores.primerApellido,
      ...(valores.segundoApellido.trim() && { segundoApellido: valores.segundoApellido }),
      ...(valores.email.trim() && { email: valores.email.trim() }),
      ...(valores.descripcion.trim() && { descripcion: valores.descripcion }),
      ...(valores.contrasenya && { contrasenya: valores.contrasenya }),
    };

    this.enviando.set(true);
    this.reglaIncumplida.set(null);
    this.errorGeneral.set(null);
    // Todas las respuestas llevan al final a la página del fotógrafo (su nombreInformalNormalizado).
    const peticion: Observable<string> = this.registro
      ? this.sesion
          .registrar({ ...alta, usuario: usuario.trim(), email: valores.email.trim(), contrasenya: valores.contrasenya })
          .pipe(map((registrado) => registrado.fotografo!.nombreInformalNormalizado))
      : (this.fotografoEditado
          ? this.catalogoService
              .editarFotografo(this.fotografoEditado, alta)
              // Su nombre informal y su correo del menú (con el nombre anterior: puede haber cambiado).
              .pipe(tap(() => this.refrescarSesionSiEsSuya(this.fotografoEditado!)))
          : this.catalogoService.crearFotografo(alta)
        ).pipe(map((fotografo: FotografoPublico) => fotografo.nombreInformalNormalizado));
    peticion.pipe(switchMap((fotografo) => (this.editando ? of(fotografo) : this.subirFotoPendiente(fotografo)))).subscribe({
      next: (fotografo) => this.router.navigate(['/', fotografo]),
      error: (respuesta: HttpErrorResponse) => {
        this.enviando.set(false);
        if (respuesta.status === 422 && respuesta.error?.tipo === 'reglaNegocioIncumplida') {
          this.reglaIncumplida.set(respuesta.error as ReglaNegocioIncumplida);
        } else {
          this.errorGeneral.set(respuesta.error?.message ?? 'No se ha podido conectar con el servidor.');
        }
      },
    });
  }
}

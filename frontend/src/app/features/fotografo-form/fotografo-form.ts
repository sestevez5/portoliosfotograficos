import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, map } from 'rxjs';
import { FotografoAlta, FotografoPublico, ReglaNegocioIncumplida } from '../../core/models/album.model';
import { AlbumService } from '../../core/services/album';
import { SesionService } from '../../core/services/sesion';

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
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-fotografo-form',
  styleUrl: './fotografo-form.scss',
  templateUrl: './fotografo-form.html',
})
export class FotografoForm {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly albumService = inject(AlbumService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute).snapshot;

  // Fotógrafo que se edita (su nombreInformalNormalizado en la URL); null en el alta y el registro.
  protected readonly fotografoEditado = this.ruta.paramMap.get('fotografo');
  protected readonly editando = this.fotografoEditado !== null;
  protected readonly registro = this.ruta.data['modo'] === 'registro';
  protected readonly tieneContrasenya = signal(false);
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

  constructor() {
    if (this.registro) {
      const { usuario, email, contrasenya } = this.formulario.controls;
      usuario.setValidators([Validators.required, Validators.pattern(USUARIO)]);
      email.setValidators([Validators.required, Validators.email]);
      contrasenya.setValidators([Validators.required, Validators.minLength(LONGITUD_MINIMA_CONTRASENYA)]);
    }
    if (this.fotografoEditado) {
      this.albumService.getFotografoEdicion(this.fotografoEditado).subscribe({
        next: (datos) => {
          const { tieneContrasenya, ...valores } = datos;
          this.formulario.patchValue(valores);
          this.tieneContrasenya.set(tieneContrasenya);
          this.cargando.set(false);
        },
        error: (respuesta: HttpErrorResponse) => {
          this.cargando.set(false);
          this.errorGeneral.set(respuesta.error?.message ?? 'No se han podido cargar los datos del fotógrafo.');
        },
      });
    }
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
    // Los opcionales vacíos no se envían (al editar, eso los deja vacíos; la contraseña vacía
    // conserva la actual).
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
          ? this.albumService.editarFotografo(this.fotografoEditado, alta)
          : this.albumService.crearFotografo(alta)
        ).pipe(map((fotografo: FotografoPublico) => fotografo.nombreInformalNormalizado));
    peticion.subscribe({
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

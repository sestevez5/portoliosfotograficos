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
import { Observable } from 'rxjs';
import { FotografoAlta, FotografoPublico, ReglaNegocioIncumplida } from '../../core/models/album.model';
import { AlbumService } from '../../core/services/album';

// Debe coincidir con LONGITUD_MINIMA_CONTRASENYA del backend (reglas/validaciones.ts).
const LONGITUD_MINIMA_CONTRASENYA = 8;

// Las dos contraseñas deben coincidir (solo en el navegador: el backend recibe una).
function contrasenyasIguales(grupo: AbstractControl): ValidationErrors | null {
  const { contrasenya, repetirContrasenya } = grupo.value as { contrasenya: string; repetirContrasenya: string };
  return contrasenya === repetirContrasenya ? null : { contrasenyasDistintas: true };
}

// Alta y edición de un fotógrafo (/admin/fotografos/nuevo y /admin/fotografos/:fotografo/editar).
// El formulario hace comprobaciones básicas para avisar pronto, pero quien decide es el backend:
// si incumple una regla de negocio se muestra qué se intentaba y por qué no se ha podido. El
// nombreInformalNormalizado (dirección y carpeta) lo calcula el backend y no se muestra. Al
// editar, una contraseña vacía conserva la actual.
@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-fotografo-form',
  styleUrl: './fotografo-form.scss',
  templateUrl: './fotografo-form.html',
})
export class FotografoForm {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly albumService = inject(AlbumService);
  private readonly router = inject(Router);

  // Fotógrafo que se edita (su nombreInformalNormalizado en la URL); null en el alta.
  protected readonly fotografoEditado = inject(ActivatedRoute).snapshot.paramMap.get('fotografo');
  protected readonly editando = this.fotografoEditado !== null;
  protected readonly tieneContrasenya = signal(false);
  protected readonly cargando = signal(this.editando);

  protected readonly longitudMinima = LONGITUD_MINIMA_CONTRASENYA;

  protected readonly formulario = this.fb.group(
    {
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

    const { repetirContrasenya: _, ...valores } = this.formulario.getRawValue();
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
    const peticion: Observable<FotografoPublico> = this.fotografoEditado
      ? this.albumService.editarFotografo(this.fotografoEditado, alta)
      : this.albumService.crearFotografo(alta);
    peticion.subscribe({
      next: (fotografo) => this.router.navigate(['/', fotografo.nombreInformalNormalizado]),
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

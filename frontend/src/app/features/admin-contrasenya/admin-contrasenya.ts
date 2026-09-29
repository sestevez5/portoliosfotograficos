import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ReglaNegocioIncumplida } from '../../core/models/catalogo.model';
import { AdministracionService } from '../../core/services/administracion';

// Debe coincidir con LONGITUD_MINIMA_CONTRASENYA del backend (reglas/validaciones.ts).
const LONGITUD_MINIMA_CONTRASENYA = 8;

function contrasenyasIguales(grupo: AbstractControl): ValidationErrors | null {
  const { contrasenyaNueva, repetirContrasenya } = grupo.value as { contrasenyaNueva: string; repetirContrasenya: string };
  return contrasenyaNueva === repetirContrasenya ? null : { contrasenyasDistintas: true };
}

// Cambio de la contraseña del administrador (/admin/contrasenya): pide la actual y la nueva dos
// veces. Si va bien, lo confirma y vacía el formulario.
@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-admin-contrasenya',
  styleUrl: './admin-contrasenya.scss',
  templateUrl: './admin-contrasenya.html',
})
export class AdminContrasenya {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly administracion = inject(AdministracionService);

  protected readonly longitudMinima = LONGITUD_MINIMA_CONTRASENYA;

  protected readonly formulario = this.fb.group(
    {
      contrasenyaActual: ['', Validators.required],
      contrasenyaNueva: ['', [Validators.required, Validators.minLength(LONGITUD_MINIMA_CONTRASENYA)]],
      repetirContrasenya: [''],
    },
    { validators: contrasenyasIguales },
  );

  protected readonly enviando = signal(false);
  protected readonly cambiada = signal(false);
  protected readonly reglaIncumplida = signal<ReglaNegocioIncumplida | null>(null);
  protected readonly errorGeneral = signal<string | null>(null);

  protected mostrarError(campo: keyof typeof this.formulario.controls, error: string): boolean {
    const control = this.formulario.controls[campo];
    return control.hasError(error) && (control.touched || control.dirty);
  }

  protected enviar(): void {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.enviando()) {
      return;
    }

    const { contrasenyaActual, contrasenyaNueva } = this.formulario.getRawValue();
    this.enviando.set(true);
    this.cambiada.set(false);
    this.reglaIncumplida.set(null);
    this.errorGeneral.set(null);
    this.administracion.cambiarContrasenya({ contrasenyaActual, contrasenyaNueva }).subscribe({
      next: () => {
        this.enviando.set(false);
        this.cambiada.set(true);
        this.formulario.reset();
      },
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

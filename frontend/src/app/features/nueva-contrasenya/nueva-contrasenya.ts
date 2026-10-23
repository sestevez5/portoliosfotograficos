import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReglaNegocioIncumplida } from '../../core/models/catalogo.model';
import { SesionService } from '../../core/services/sesion';
import { AvisoVisible } from '../../shared/aviso-visible/aviso-visible';

// Debe coincidir con LONGITUD_MINIMA_CONTRASENYA del backend (reglas/validaciones.ts).
const LONGITUD_MINIMA_CONTRASENYA = 8;

function contrasenyasIguales(grupo: AbstractControl): ValidationErrors | null {
  const { contrasenyaNueva, repetirContrasenya } = grupo.value as { contrasenyaNueva: string; repetirContrasenya: string };
  return contrasenyaNueva === repetirContrasenya ? null : { contrasenyasDistintas: true };
}

// Página del enlace del correo de "¿Has olvidado tu contraseña?" (/recuperar-contrasenya/nueva?token=…):
// comprueba al entrar que el enlace sigue sirviendo y pide la contraseña nueva dos veces. Al guardarla
// el backend cierra las demás sesiones del usuario y deja iniciada una nueva.
@Component({
  imports: [ReactiveFormsModule, RouterLink, AvisoVisible],
  selector: 'app-nueva-contrasenya',
  styleUrl: './nueva-contrasenya.scss',
  templateUrl: './nueva-contrasenya.html',
})
export class NuevaContrasenya {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly sesion = inject(SesionService);
  private readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';

  protected readonly longitudMinima = LONGITUD_MINIMA_CONTRASENYA;

  protected readonly formulario = this.fb.group(
    {
      contrasenyaNueva: ['', [Validators.required, Validators.minLength(LONGITUD_MINIMA_CONTRASENYA)]],
      repetirContrasenya: [''],
    },
    { validators: contrasenyasIguales },
  );

  // 'comprobando' el enlace, 'valido' (se muestra el formulario), 'noValido' o 'cambiada'.
  protected readonly estado = signal<'comprobando' | 'valido' | 'noValido' | 'cambiada'>('comprobando');
  protected readonly enviando = signal(false);
  protected readonly reglaIncumplida = signal<ReglaNegocioIncumplida | null>(null);
  protected readonly errorGeneral = signal<string | null>(null);

  constructor() {
    this.sesion.comprobarEnlaceRecuperacion(this.token).subscribe({
      next: () => this.estado.set('valido'),
      error: (respuesta: HttpErrorResponse) => this.alFallar(respuesta),
    });
  }

  protected mostrarError(campo: keyof typeof this.formulario.controls, error: string): boolean {
    const control = this.formulario.controls[campo];
    return control.hasError(error) && (control.touched || control.dirty);
  }

  protected enviar(): void {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.enviando()) {
      return;
    }
    this.enviando.set(true);
    this.reglaIncumplida.set(null);
    this.errorGeneral.set(null);
    this.sesion.restablecerContrasenya(this.token, this.formulario.getRawValue().contrasenyaNueva).subscribe({
      next: () => {
        this.enviando.set(false);
        this.estado.set('cambiada');
      },
      error: (respuesta: HttpErrorResponse) => {
        this.enviando.set(false);
        this.alFallar(respuesta);
      },
    });
  }

  // Un enlace que ya no sirve deja la página en 'noValido' (con el motivo); cualquier otra regla
  // incumplida (p. ej. una contraseña demasiado corta) se muestra sobre el formulario.
  private alFallar(respuesta: HttpErrorResponse): void {
    if (respuesta.status === 422 && respuesta.error?.tipo === 'reglaNegocioIncumplida') {
      const regla = respuesta.error as ReglaNegocioIncumplida;
      this.reglaIncumplida.set(regla);
      if (regla.regla.codigo === 'RECUPERACION_ENLACE_NO_VALIDO') {
        this.estado.set('noValido');
      }
    } else {
      this.errorGeneral.set(respuesta.error?.message ?? 'No se ha podido conectar con el servidor.');
      if (this.estado() === 'comprobando') {
        this.estado.set('noValido');
      }
    }
  }
}

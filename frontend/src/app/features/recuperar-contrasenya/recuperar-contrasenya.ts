import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ReglaNegocioIncumplida } from '../../core/models/catalogo.model';
import { SesionService } from '../../core/services/sesion';
import { AvisoVisible } from '../../shared/aviso-visible/aviso-visible';

// "¿Has olvidado tu contraseña?" (/recuperar-contrasenya, enlace en el panel de "Iniciar sesión"):
// pide el correo de la cuenta y el backend envía a él un enlace para elegir otra contraseña
// (/recuperar-contrasenya/nueva). Por seguridad, la respuesta es la misma exista o no la cuenta.
@Component({
  imports: [ReactiveFormsModule, RouterLink, AvisoVisible],
  selector: 'app-recuperar-contrasenya',
  styleUrl: './recuperar-contrasenya.scss',
  templateUrl: './recuperar-contrasenya.html',
})
export class RecuperarContrasenya {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly sesion = inject(SesionService);

  protected readonly formulario = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly enviando = signal(false);
  // El correo al que se ha pedido el enlace (null = aún no se ha pedido).
  protected readonly enviadoA = signal<string | null>(null);
  protected readonly reglaIncumplida = signal<ReglaNegocioIncumplida | null>(null);
  protected readonly errorGeneral = signal<string | null>(null);

  protected mostrarError(error: string): boolean {
    const control = this.formulario.controls.email;
    return control.hasError(error) && (control.touched || control.dirty);
  }

  protected enviar(): void {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.enviando()) {
      return;
    }
    const email = this.formulario.getRawValue().email.trim();
    this.enviando.set(true);
    this.reglaIncumplida.set(null);
    this.errorGeneral.set(null);
    this.sesion.solicitarRecuperacion(email).subscribe({
      next: () => {
        this.enviando.set(false);
        this.enviadoA.set(email);
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

  // "Enviar otro": vuelve al formulario con el mismo correo.
  protected otraVez(): void {
    this.enviadoA.set(null);
  }
}

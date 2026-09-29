import { Component, ElementRef, effect, inject, model, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ReglaNegocioIncumplida } from '../../core/models/catalogo.model';
import { SesionService } from '../../core/services/sesion';

// Panel de autenticación (diálogo modal): usuario o correo y contraseña, y "Regístrate", que lleva
// al registro. Se abre mientras "abierto" es true ([(abierto)]) y se cierra solo al entrar.
@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-panel-sesion',
  styleUrl: './panel-sesion.scss',
  templateUrl: './panel-sesion.html',
})
export class PanelSesion {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly sesion = inject(SesionService);

  readonly abierto = model(false);

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly formulario = this.fb.group({
    usuario: ['', Validators.required],
    contrasenya: ['', Validators.required],
  });

  private readonly panel = viewChild.required<ElementRef<HTMLDialogElement>>('panel');

  constructor() {
    // showModal()/close() pueden no existir fuera de un navegador real (p. ej. en los tests).
    effect(() => {
      const panel = this.panel().nativeElement;
      if (this.abierto() && !panel.open) {
        this.formulario.reset();
        this.error.set(null);
        if (typeof panel.showModal === 'function') panel.showModal();
        else panel.setAttribute('open', '');
      } else if (!this.abierto() && panel.open) {
        if (typeof panel.close === 'function') panel.close();
        else panel.removeAttribute('open');
      }
    });
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  // Ir al registro cierra el panel.
  protected registrarse(): void {
    this.abierto.set(false);
    this.router.navigate(['/registro']);
  }

  protected entrar(): void {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.enviando()) {
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    this.sesion.iniciar(this.formulario.getRawValue()).subscribe({
      next: () => {
        this.enviando.set(false);
        this.abierto.set(false);
      },
      error: (respuesta: HttpErrorResponse) => {
        this.enviando.set(false);
        const regla = respuesta.status === 422 ? (respuesta.error as ReglaNegocioIncumplida) : null;
        this.error.set(regla?.regla?.mensaje ?? 'No se ha podido conectar con el servidor.');
      },
    });
  }
}

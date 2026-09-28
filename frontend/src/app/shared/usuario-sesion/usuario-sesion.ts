import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ReglaNegocioIncumplida } from '../../core/models/album.model';
import { SesionService } from '../../core/services/sesion';

// Esquina superior de la página: quién tiene la sesión iniciada (con enlace a su página si es
// fotógrafo) y "Cerrar sesión"; o, sin sesión, "Iniciar sesión", que abre el panel de
// autenticación. El panel pide usuario (o correo) y contraseña, y ofrece registrarse (/registro).
@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-usuario-sesion',
  styleUrl: './usuario-sesion.scss',
  templateUrl: './usuario-sesion.html',
})
export class UsuarioSesion {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  protected readonly sesion = inject(SesionService);

  protected readonly panelAbierto = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly formulario = this.fb.group({
    usuario: ['', Validators.required],
    contrasenya: ['', Validators.required],
  });

  private readonly panel = viewChild.required<ElementRef<HTMLDialogElement>>('panel');

  constructor() {
    this.sesion.cargar();

    // showModal()/close() pueden no existir fuera de un navegador real (p. ej. en los tests).
    effect(() => {
      const panel = this.panel().nativeElement;
      if (this.panelAbierto() && !panel.open) {
        if (typeof panel.showModal === 'function') panel.showModal();
        else panel.setAttribute('open', '');
      } else if (!this.panelAbierto() && panel.open) {
        if (typeof panel.close === 'function') panel.close();
        else panel.removeAttribute('open');
      }
    });
  }

  protected abrirPanel(): void {
    this.formulario.reset();
    this.error.set(null);
    this.panelAbierto.set(true);
  }

  protected cerrarPanel(): void {
    this.panelAbierto.set(false);
  }

  // Ir al registro cierra el panel.
  protected registrarse(): void {
    this.panelAbierto.set(false);
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
        this.panelAbierto.set(false);
      },
      error: (respuesta: HttpErrorResponse) => {
        this.enviando.set(false);
        const regla = respuesta.status === 422 ? (respuesta.error as ReglaNegocioIncumplida) : null;
        this.error.set(regla?.regla?.mensaje ?? 'No se ha podido conectar con el servidor.');
      },
    });
  }

  protected salir(): void {
    this.sesion.cerrar().subscribe();
  }
}

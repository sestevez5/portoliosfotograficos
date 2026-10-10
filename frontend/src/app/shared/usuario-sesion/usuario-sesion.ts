import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SesionService } from '../../core/services/sesion';
import { Avatar } from '../avatar/avatar';
import { PanelSesion } from '../panel-sesion/panel-sesion';

// Esquina superior de la página. Con sesión: su foto de perfil (o sus iniciales), nombre (el nombre informal
// del fotógrafo, o "Administrador") y un menú desplegable con "Mi perfil" y "Salir"; se cierra al pulsar fuera, con Escape o al elegir una opción. Sin sesión: "Iniciar
// sesión", que abre el panel de autenticación (usuario o correo y contraseña; ofrece registrarse).
@Component({
  imports: [RouterLink, Avatar, PanelSesion],
  selector: 'app-usuario-sesion',
  styleUrl: './usuario-sesion.scss',
  templateUrl: './usuario-sesion.html',
  host: {
    '(document:click)': 'alPulsarFuera($event)',
    '(document:keydown.escape)': 'cerrarMenu()',
  },
})
export class UsuarioSesion {
  private readonly router = inject(Router);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly sesion = inject(SesionService);

  protected readonly menuAbierto = signal(false);

  protected readonly nombre = computed(() => {
    const usuario = this.sesion.usuario();
    if (!usuario) return '';
    return usuario.fotografo?.nombreInformal ?? (usuario.rol === 'administrador' ? 'Administrador' : usuario.usuario);
  });

  protected alternarMenu(): void {
    this.menuAbierto.update((abierto) => !abierto);
  }

  protected cerrarMenu(): void {
    this.menuAbierto.set(false);
  }

  protected alPulsarFuera(evento: Event): void {
    if (this.menuAbierto() && !this.elemento.nativeElement.contains(evento.target as Node)) {
      this.menuAbierto.set(false);
    }
  }

  // Panel de autenticación (sin sesión).
  protected readonly panelAbierto = signal(false);

  constructor() {
    this.sesion.cargar();
  }

  // Cierra la sesión y vuelve a la portada (por si estaba en una página del usuario).
  protected salir(): void {
    this.menuAbierto.set(false);
    this.sesion.cerrar().subscribe(() => this.router.navigate(['/']));
  }
}

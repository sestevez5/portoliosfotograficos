import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { SesionService } from '../../core/services/sesion';
import { Tema, TemaService } from '../../core/services/tema';

// "Configuración" (/configuracion, solo con sesión: guard conSesion). De momento, el tema que
// prefiere el usuario: se guarda en su usuario (BD) y se aplica cada vez que inicia sesión, en
// cualquier navegador. Al guardarlo se aplica también ya.
@Component({
  selector: 'app-configuracion',
  styleUrl: './configuracion.scss',
  templateUrl: './configuracion.html',
})
export class Configuracion {
  private readonly sesion = inject(SesionService);

  protected readonly opciones: { valor: Tema; texto: string; descripcion: string }[] = [
    { valor: 'oscuro', texto: 'Oscuro', descripcion: 'Fondo oscuro y neutro, para que las fotos destaquen.' },
    { valor: 'claro', texto: 'Claro', descripcion: 'Papel cálido y tinta casi negra.' },
  ];

  // Su preferencia guardada o, si no tiene, el tema que está viendo.
  protected readonly elegido = signal<Tema>(this.sesion.usuario()?.temaPreferido ?? inject(TemaService).tema());

  protected readonly guardando = signal(false);
  protected readonly guardado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected elegir(tema: Tema): void {
    this.elegido.set(tema);
    this.guardado.set(false);
  }

  protected guardar(): void {
    this.guardando.set(true);
    this.guardado.set(false);
    this.error.set(null);
    this.sesion.guardarTemaPreferido(this.elegido()).subscribe({
      next: () => {
        this.guardando.set(false);
        this.guardado.set(true);
      },
      error: (respuesta: HttpErrorResponse) => {
        this.guardando.set(false);
        this.error.set(respuesta.error?.message ?? 'No se ha podido guardar la configuración.');
      },
    });
  }
}

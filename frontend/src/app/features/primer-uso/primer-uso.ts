import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PrimerUso as DatosPrimerUso, ReglaNegocioIncumplida } from '../../core/models/catalogo.model';
import { AdministracionService } from '../../core/services/administracion';

// Debe coincidir con LONGITUD_MINIMA_CONTRASENYA del backend (reglas/validaciones.ts).
const LONGITUD_MINIMA_CONTRASENYA = 8;

// Si se quiere cambiar la contraseña, la nueva es obligatoria, con la longitud mínima, y debe
// repetirse igual. Si no, esos campos se ignoran.
function contrasenyaNuevaValida(grupo: AbstractControl): ValidationErrors | null {
  const { cambiarContrasenya, contrasenyaNueva, repetirContrasenya } = grupo.value as {
    cambiarContrasenya: boolean;
    contrasenyaNueva: string;
    repetirContrasenya: string;
  };
  if (!cambiarContrasenya) {
    return null;
  }
  if (contrasenyaNueva.length < LONGITUD_MINIMA_CONTRASENYA) {
    return { contrasenyaCorta: true };
  }
  return contrasenyaNueva === repetirContrasenya ? null : { contrasenyasDistintas: true };
}

// Bienvenida del primer uso (/admin/primer-uso): la aplicación se acaba de instalar y pide las
// credenciales del administrador (inicialmente admin / admin). Si se quiere, se cambia a la vez su
// contraseña. Al terminar lleva a la portada. Si el primer uso ya se completó, lleva a la portada.
@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-primer-uso',
  styleUrl: './primer-uso.scss',
  templateUrl: './primer-uso.html',
})
export class PrimerUso {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly administracion = inject(AdministracionService);
  private readonly router = inject(Router);

  protected readonly longitudMinima = LONGITUD_MINIMA_CONTRASENYA;

  protected readonly formulario = this.fb.group(
    {
      usuario: ['', Validators.required],
      contrasenya: ['', Validators.required],
      cambiarContrasenya: [true],
      contrasenyaNueva: [''],
      repetirContrasenya: [''],
    },
    { validators: contrasenyaNuevaValida },
  );

  protected readonly enviando = signal(false);
  protected readonly reglaIncumplida = signal<ReglaNegocioIncumplida | null>(null);
  protected readonly errorGeneral = signal<string | null>(null);

  constructor() {
    this.administracion.primerUsoPendiente().subscribe((pendiente) => {
      if (!pendiente) {
        this.router.navigate(['/']);
      }
    });
  }

  protected mostrarError(campo: keyof typeof this.formulario.controls, error: string): boolean {
    const control = this.formulario.controls[campo];
    return control.hasError(error) && (control.touched || control.dirty);
  }

  // Los errores de la contraseña nueva son del grupo: se muestran cuando se ha tocado su campo.
  protected mostrarErrorGrupo(error: string, campo: 'contrasenyaNueva' | 'repetirContrasenya'): boolean {
    return this.formulario.hasError(error) && this.formulario.controls[campo].touched;
  }

  protected enviar(): void {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.enviando()) {
      return;
    }

    const { usuario, contrasenya, cambiarContrasenya, contrasenyaNueva } = this.formulario.getRawValue();
    const datos: DatosPrimerUso = { usuario, contrasenya, ...(cambiarContrasenya && { contrasenyaNueva }) };

    this.enviando.set(true);
    this.reglaIncumplida.set(null);
    this.errorGeneral.set(null);
    this.administracion.completarPrimerUso(datos).subscribe({
      next: () => this.router.navigate(['/']),
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

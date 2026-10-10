import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CuentaEdicion, ReglaNegocioIncumplida } from '../../core/models/catalogo.model';
import { SesionService } from '../../core/services/sesion';
import { AvisoVisible } from '../../shared/aviso-visible/aviso-visible';

// Deben coincidir con las del backend (reglas/validaciones.ts).
const LONGITUD_MINIMA_CONTRASENYA = 8;
const USUARIO = /^[a-z0-9][a-z0-9._-]{2,29}$/;

type TemaElegido = 'oscuro' | 'claro' | 'ninguno';

// Como el backend, sin contar los espacios de los extremos (se quitan al guardar) ni las mayúsculas
// (se guarda en minúsculas).
function usuarioValido(control: AbstractControl): ValidationErrors | null {
  const usuario = (control.value as string).trim().toLowerCase();
  return usuario === '' || USUARIO.test(usuario) ? null : { pattern: true };
}

function contrasenyasIguales(grupo: AbstractControl): ValidationErrors | null {
  const { contrasenyaNueva, repetirContrasenya } = grupo.value as { contrasenyaNueva?: string; repetirContrasenya?: string };
  return contrasenyaNueva === repetirContrasenya ? null : { contrasenyasDistintas: true };
}

// "Editar cuenta" (/perfil/cuenta, solo con sesión), desde la sección "Cuenta" de "Mi perfil": el
// nombre de usuario (el del administrador no se puede cambiar), las preferencias de la cuenta (hoy,
// el tema preferido) y, si se despliega "Cambiar contraseña", la contraseña (la actual y la nueva,
// repetida). Un único "Guardar cambios" lo guarda todo junto, en una sola petición: o todo o nada, así
// que no puede quedar nada a medias sin guardar. Al cambiar la contraseña se cierran las demás
// sesiones del usuario. Quien decide es el backend: si incumple una regla se muestra el motivo.
@Component({
  imports: [ReactiveFormsModule, RouterLink, AvisoVisible],
  selector: 'app-cuenta-form',
  styleUrl: './cuenta-form.scss',
  templateUrl: './cuenta-form.html',
})
export class CuentaForm {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  protected readonly longitudMinima = LONGITUD_MINIMA_CONTRASENYA;
  protected readonly temas: { valor: TemaElegido; texto: string }[] = [
    { valor: 'ninguno', texto: 'Sin preferencia' },
    { valor: 'oscuro', texto: 'Oscuro' },
    { valor: 'claro', texto: 'Claro' },
  ];

  protected readonly cargando = signal(true);
  protected readonly esAdministrador = signal(false);

  // La contraseña es un grupo aparte que solo cuenta (y se valida) mientras está desplegado.
  protected readonly formulario = this.fb.group({
    usuario: ['', [Validators.required, usuarioValido]],
    temaPreferido: ['ninguno' as TemaElegido],
    contrasenya: this.fb.group(
      {
        contrasenyaActual: ['', Validators.required],
        contrasenyaNueva: ['', [Validators.required, Validators.minLength(LONGITUD_MINIMA_CONTRASENYA)]],
        repetirContrasenya: [''],
      },
      { validators: contrasenyasIguales },
    ),
  });
  protected readonly contrasenya = this.formulario.controls.contrasenya;
  protected readonly cambiandoContrasenya = signal(false);

  protected readonly guardando = signal(false);
  protected readonly reglaIncumplida = signal<ReglaNegocioIncumplida | null>(null);
  protected readonly errorGeneral = signal<string | null>(null);

  constructor() {
    this.contrasenya.disable();
    this.sesion.perfil().subscribe({
      next: (perfil) => {
        this.esAdministrador.set(perfil.rol === 'administrador');
        this.formulario.patchValue({ usuario: perfil.usuario, temaPreferido: perfil.temaPreferido ?? 'ninguno' });
        if (perfil.rol === 'administrador') {
          this.formulario.controls.usuario.disable();
        }
        this.cargando.set(false);
      },
      error: (respuesta: HttpErrorResponse) => {
        this.cargando.set(false);
        this.errorGeneral.set(respuesta.error?.message ?? 'No se han podido cargar los datos de la cuenta.');
      },
    });
  }

  protected mostrarError(control: AbstractControl, error: string): boolean {
    return control.hasError(error) && (control.touched || control.dirty);
  }

  protected abrirCambioContrasenya(): void {
    this.contrasenya.reset();
    this.contrasenya.enable();
    this.cambiandoContrasenya.set(true);
  }

  protected cancelarCambioContrasenya(): void {
    this.contrasenya.reset();
    this.contrasenya.disable();
    this.cambiandoContrasenya.set(false);
  }

  protected guardar(): void {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.guardando() || this.cargando()) {
      return;
    }
    const { usuario, temaPreferido, contrasenya } = this.formulario.getRawValue();
    const cuenta: CuentaEdicion = {
      usuario: usuario.trim(),
      temaPreferido: temaPreferido === 'ninguno' ? null : temaPreferido,
      ...(this.cambiandoContrasenya() && {
        contrasenya: { contrasenyaActual: contrasenya.contrasenyaActual, contrasenyaNueva: contrasenya.contrasenyaNueva },
      }),
    };
    this.guardando.set(true);
    this.reglaIncumplida.set(null);
    this.errorGeneral.set(null);
    this.sesion.editarCuenta(cuenta).subscribe({
      next: () => this.router.navigate(['/perfil']),
      error: (respuesta: HttpErrorResponse) => {
        this.guardando.set(false);
        if (respuesta.status === 422 && respuesta.error?.tipo === 'reglaNegocioIncumplida') {
          this.reglaIncumplida.set(respuesta.error as ReglaNegocioIncumplida);
        } else {
          this.errorGeneral.set(respuesta.error?.message ?? 'No se ha podido conectar con el servidor.');
        }
      },
    });
  }
}

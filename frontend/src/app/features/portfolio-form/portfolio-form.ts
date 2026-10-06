import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { PortfolioAlta, PortfolioDetalle, ReglaNegocioIncumplida } from '../../core/models/catalogo.model';
import { CatalogoService } from '../../core/services/catalogo';
import { AvisoVisible } from '../../shared/aviso-visible/aviso-visible';

// Alta y edición de un portfolio por su fotógrafo propietario
// (/gestion/:fotografo/portfolios/nuevo y /gestion/:fotografo/portfolios/:portfolio/editar).
// Igual que el formulario del fotógrafo: comprobaciones básicas para avisar pronto, pero quien
// decide es el backend; si incumple una regla de negocio se muestra qué se intentaba y por qué no
// se ha podido. El nombreNormalizado (dirección y carpeta) lo calcula el backend.
@Component({
  imports: [ReactiveFormsModule, RouterLink, AvisoVisible],
  selector: 'app-portfolio-form',
  styleUrl: './portfolio-form.scss',
  templateUrl: './portfolio-form.html',
})
export class PortfolioForm {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly catalogoService = inject(CatalogoService);
  private readonly router = inject(Router);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly fotografo = this.params.get('fotografo')!;
  // Portfolio que se edita (su nombreNormalizado en la URL); null en el alta.
  protected readonly portfolioEditado = this.params.get('portfolio');
  protected readonly editando = this.portfolioEditado !== null;
  protected readonly cargando = signal(this.editando);

  protected readonly formulario = this.fb.group({
    nombre: ['', Validators.required],
    descripcion: [''],
  });

  protected readonly enviando = signal(false);
  protected readonly reglaIncumplida = signal<ReglaNegocioIncumplida | null>(null);
  protected readonly errorGeneral = signal<string | null>(null);

  constructor() {
    if (this.portfolioEditado) {
      this.catalogoService.getPortfolio(this.fotografo, this.portfolioEditado).subscribe({
        next: ({ nombre, descripcion }) => {
          this.formulario.patchValue({ nombre, descripcion: descripcion ?? '' });
          this.cargando.set(false);
        },
        error: (respuesta: HttpErrorResponse) => {
          this.cargando.set(false);
          this.errorGeneral.set(respuesta.error?.message ?? 'No se han podido cargar los datos del portfolio.');
        },
      });
    }
  }

  // A dónde vuelve "Cancelar": al portfolio que se edita o a los portfolios del fotógrafo.
  protected readonly volver = this.portfolioEditado ? ['/', this.fotografo, this.portfolioEditado] : ['/', this.fotografo];

  protected mostrarError(campo: keyof typeof this.formulario.controls, error: string): boolean {
    const control = this.formulario.controls[campo];
    return control.hasError(error) && (control.touched || control.dirty);
  }

  protected enviar(): void {
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.enviando()) {
      return;
    }

    // Una descripción vacía no se envía (al editar, eso la borra).
    const { nombre, descripcion } = this.formulario.getRawValue();
    const alta: PortfolioAlta = { nombre, ...(descripcion.trim() && { descripcion }) };

    this.enviando.set(true);
    this.reglaIncumplida.set(null);
    this.errorGeneral.set(null);
    const peticion: Observable<PortfolioDetalle> = this.portfolioEditado
      ? this.catalogoService.editarPortfolio(this.fotografo, this.portfolioEditado, alta)
      : this.catalogoService.crearPortfolio(this.fotografo, alta);
    peticion.subscribe({
      next: (portfolio) => this.router.navigate(['/', this.fotografo, portfolio.nombreNormalizado]),
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

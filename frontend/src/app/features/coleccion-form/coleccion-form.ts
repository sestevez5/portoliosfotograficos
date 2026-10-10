import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ColeccionAlta, ColeccionDetalle, ReglaNegocioIncumplida } from '../../core/models/catalogo.model';
import { CatalogoService } from '../../core/services/catalogo';
import { AvisoVisible } from '../../shared/aviso-visible/aviso-visible';

// Alta y edición de una colección por su fotógrafo propietario
// (/gestion/:fotografo/portfolios/:portfolio/colecciones/nuevo y .../colecciones/:coleccion/editar).
// Igual que el formulario del portfolio: comprobaciones básicas para avisar pronto, pero quien
// decide es el backend; si incumple una regla de negocio se muestra qué se intentaba y por qué no
// se ha podido. El nombreNormalizado (dirección y carpeta) lo calcula el backend.
@Component({
  imports: [ReactiveFormsModule, RouterLink, AvisoVisible],
  selector: 'app-coleccion-form',
  styleUrl: './coleccion-form.scss',
  templateUrl: './coleccion-form.html',
})
export class ColeccionForm {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly catalogoService = inject(CatalogoService);
  private readonly router = inject(Router);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly fotografo = this.params.get('fotografo')!;
  protected readonly portfolio = this.params.get('portfolio')!;
  // Colección que se edita (su nombreNormalizado en la URL); null en el alta.
  protected readonly coleccionEditada = this.params.get('coleccion');
  protected readonly editando = this.coleccionEditada !== null;
  protected readonly cargando = signal(this.editando);

  // Los tags (separados por comas) no se muestran: la web oculta todo lo relativo a ellos. El
  // control se mantiene para que al editar se conserven los que ya tenga la colección (un PUT sin
  // tags los borraría); una colección nueva se crea sin tags.
  protected readonly formulario = this.fb.group({
    nombre: ['', Validators.required],
    descripcion: [''],
    tags: [''],
  });

  protected readonly enviando = signal(false);
  protected readonly reglaIncumplida = signal<ReglaNegocioIncumplida | null>(null);
  protected readonly errorGeneral = signal<string | null>(null);

  constructor() {
    if (this.coleccionEditada) {
      this.catalogoService.getColeccionDePortfolio(this.fotografo, this.portfolio, this.coleccionEditada).subscribe({
        next: ({ nombre, descripcion, tags }) => {
          this.formulario.patchValue({ nombre, descripcion: descripcion ?? '', tags: tags.join(', ') });
          this.cargando.set(false);
        },
        error: (respuesta: HttpErrorResponse) => {
          this.cargando.set(false);
          this.errorGeneral.set(respuesta.error?.message ?? 'No se han podido cargar los datos dla colección.');
        },
      });
    }
  }

  // A dónde vuelve "Cancelar": a la colección que se edita o a las colecciones del portfolio.
  protected readonly volver = this.coleccionEditada
    ? ['/', this.fotografo, this.portfolio, this.coleccionEditada]
    : ['/', this.fotografo, this.portfolio];

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
    const { nombre, descripcion, tags } = this.formulario.getRawValue();
    const alta: ColeccionAlta = {
      nombre,
      ...(descripcion.trim() && { descripcion }),
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    };

    this.enviando.set(true);
    this.reglaIncumplida.set(null);
    this.errorGeneral.set(null);
    const peticion: Observable<ColeccionDetalle> = this.coleccionEditada
      ? this.catalogoService.editarColeccion(this.fotografo, this.portfolio, this.coleccionEditada, alta)
      : this.catalogoService.crearColeccion(this.fotografo, this.portfolio, alta);
    peticion.subscribe({
      next: (coleccion) =>
        this.router.navigate(['/', this.fotografo, coleccion.portfolio.nombreNormalizado, coleccion.nombreNormalizado]),
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

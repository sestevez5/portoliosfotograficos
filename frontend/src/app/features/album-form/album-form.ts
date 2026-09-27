import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { AlbumAlta, AlbumDetalle, ReglaNegocioIncumplida } from '../../core/models/album.model';
import { AlbumService } from '../../core/services/album';

// Alta y edición de un álbum por su fotógrafo propietario
// (/gestion/:fotografo/portfolios/:portfolio/albumes/nuevo y .../albumes/:album/editar).
// Igual que el formulario del portfolio: comprobaciones básicas para avisar pronto, pero quien
// decide es el backend; si incumple una regla de negocio se muestra qué se intentaba y por qué no
// se ha podido. El nombreNormalizado (dirección y carpeta) lo calcula el backend.
@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-album-form',
  styleUrl: './album-form.scss',
  templateUrl: './album-form.html',
})
export class AlbumForm {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly albumService = inject(AlbumService);
  private readonly router = inject(Router);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly fotografo = this.params.get('fotografo')!;
  protected readonly portfolio = this.params.get('portfolio')!;
  // Álbum que se edita (su nombreNormalizado en la URL); null en el alta.
  protected readonly albumEditado = this.params.get('album');
  protected readonly editando = this.albumEditado !== null;
  protected readonly cargando = signal(this.editando);

  // Los tags se escriben separados por comas.
  protected readonly formulario = this.fb.group({
    nombre: ['', Validators.required],
    descripcion: [''],
    tags: [''],
  });

  protected readonly enviando = signal(false);
  protected readonly reglaIncumplida = signal<ReglaNegocioIncumplida | null>(null);
  protected readonly errorGeneral = signal<string | null>(null);

  constructor() {
    if (this.albumEditado) {
      this.albumService.getAlbumDePortfolio(this.fotografo, this.portfolio, this.albumEditado).subscribe({
        next: ({ nombre, descripcion, tags }) => {
          this.formulario.patchValue({ nombre, descripcion: descripcion ?? '', tags: tags.join(', ') });
          this.cargando.set(false);
        },
        error: (respuesta: HttpErrorResponse) => {
          this.cargando.set(false);
          this.errorGeneral.set(respuesta.error?.message ?? 'No se han podido cargar los datos del álbum.');
        },
      });
    }
  }

  // A dónde vuelve "Cancelar": al álbum que se edita o a los álbumes del portfolio.
  protected readonly volver = this.albumEditado
    ? ['/', this.fotografo, this.portfolio, this.albumEditado]
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
    const alta: AlbumAlta = {
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
    const peticion: Observable<AlbumDetalle> = this.albumEditado
      ? this.albumService.editarAlbum(this.fotografo, this.portfolio, this.albumEditado, alta)
      : this.albumService.crearAlbum(this.fotografo, this.portfolio, alta);
    peticion.subscribe({
      next: (album) =>
        this.router.navigate(['/', this.fotografo, album.portfolio.nombreNormalizado, album.nombreNormalizado]),
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

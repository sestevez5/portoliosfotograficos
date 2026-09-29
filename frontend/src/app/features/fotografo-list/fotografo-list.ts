import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FotografoResumen, nombreCompleto } from '../../core/models/catalogo.model';
import { CatalogoService } from '../../core/services/catalogo';
import { FotografoAcciones } from '../../shared/fotografo-acciones/fotografo-acciones';

const MAX_DESCRIPCION_TARJETA = 70;

@Component({
  imports: [RouterLink, FotografoAcciones],
  selector: 'app-fotografo-list',
  styleUrl: './fotografo-list.scss',
  templateUrl: './fotografo-list.html',
})
export class FotografoList {
  private readonly catalogoService = inject(CatalogoService);

  protected readonly fotografos = signal<FotografoResumen[]>([]);
  protected readonly nombreCompleto = nombreCompleto;

  // En la tarjeta la descripción se muestra como mucho con 70 caracteres (la completa, en su página).
  protected recortar(descripcion: string | undefined): string {
    const texto = (descripcion ?? '').trim();
    return texto.length > MAX_DESCRIPCION_TARJETA ? `${texto.slice(0, MAX_DESCRIPCION_TARJETA - 1).trimEnd()}…` : texto;
  }

  constructor() {
    this.cargar();
  }

  // También tras eliminar un fotógrafo, para quitarlo de la lista.
  protected cargar(): void {
    this.catalogoService.getFotografos().subscribe((fotografos) => this.fotografos.set(fotografos));
  }
}

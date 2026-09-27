import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FotografoResumen, nombreCompleto } from '../../core/models/album.model';
import { AlbumService } from '../../core/services/album';
import { FotografoAcciones } from '../../shared/fotografo-acciones/fotografo-acciones';

@Component({
  imports: [RouterLink, FotografoAcciones],
  selector: 'app-fotografo-list',
  styleUrl: './fotografo-list.scss',
  templateUrl: './fotografo-list.html',
})
export class FotografoList {
  private readonly albumService = inject(AlbumService);

  protected readonly fotografos = signal<FotografoResumen[]>([]);
  protected readonly nombreCompleto = nombreCompleto;

  constructor() {
    this.cargar();
  }

  // También tras eliminar un fotógrafo, para quitarlo de la lista.
  protected cargar(): void {
    this.albumService.getFotografos().subscribe((fotografos) => this.fotografos.set(fotografos));
  }
}

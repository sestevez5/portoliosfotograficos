import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AlbumService } from '../../core/services/album';

@Component({
  imports: [RouterLink],
  selector: 'app-fotografo-list',
  styleUrl: './fotografo-list.scss',
  templateUrl: './fotografo-list.html',
})
export class FotografoList {
  private readonly albumService = inject(AlbumService);

  protected readonly fotografos = toSignal(this.albumService.getFotografos(), { initialValue: [] });
}

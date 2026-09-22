import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/fotografo-list/fotografo-list').then((m) => m.FotografoList),
  },
  {
    path: ':fotografo',
    pathMatch: 'full',
    loadComponent: () => import('./features/album-list/album-list').then((m) => m.AlbumList),
  },
  {
    path: ':fotografo/albums/:id',
    loadComponent: () => import('./features/album-detail/album-detail').then((m) => m.AlbumDetail),
  },
  {
    path: '**',
    redirectTo: '',
  },
];

import { Routes } from '@angular/router';
import { urlCanonica } from './core/guards/url-canonica';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/fotografo-list/fotografo-list').then((m) => m.FotografoList),
  },
  // Rutas de administración: antes que las de parámetros. "admin" está reservado en el backend
  // (ningún fotógrafo puede tener esa dirección).
  {
    path: 'admin/fotografos/nuevo',
    loadComponent: () => import('./features/fotografo-form/fotografo-form').then((m) => m.FotografoForm),
  },
  {
    path: 'admin/fotografos/:fotografo/editar',
    loadComponent: () => import('./features/fotografo-form/fotografo-form').then((m) => m.FotografoForm),
  },
  // Mantenimiento de los portfolios por su fotógrafo propietario (no es cosa del administrador).
  // También antes de las rutas de parámetros; "gestion" está reservado igual que "admin".
  {
    path: 'gestion/:fotografo/portfolios/nuevo',
    canActivate: [urlCanonica],
    loadComponent: () => import('./features/portfolio-form/portfolio-form').then((m) => m.PortfolioForm),
  },
  {
    path: 'gestion/:fotografo/portfolios/:portfolio/editar',
    canActivate: [urlCanonica],
    loadComponent: () => import('./features/portfolio-form/portfolio-form').then((m) => m.PortfolioForm),
  },
  // Mantenimiento de los álbumes de un portfolio, también por su fotógrafo propietario.
  {
    path: 'gestion/:fotografo/portfolios/:portfolio/albumes/nuevo',
    canActivate: [urlCanonica],
    loadComponent: () => import('./features/album-form/album-form').then((m) => m.AlbumForm),
  },
  {
    path: 'gestion/:fotografo/portfolios/:portfolio/albumes/:album/editar',
    canActivate: [urlCanonica],
    loadComponent: () => import('./features/album-form/album-form').then((m) => m.AlbumForm),
  },
  {
    path: ':fotografo',
    canActivate: [urlCanonica],
    pathMatch: 'full',
    loadComponent: () => import('./features/portfolio-list/portfolio-list').then((m) => m.PortfolioList),
  },
  {
    path: ':fotografo/:portfolio',
    canActivate: [urlCanonica],
    pathMatch: 'full',
    loadComponent: () => import('./features/album-list/album-list').then((m) => m.AlbumList),
  },
  {
    path: ':fotografo/:portfolio/:album',
    canActivate: [urlCanonica],
    loadComponent: () => import('./features/album-detail/album-detail').then((m) => m.AlbumDetail),
  },
  {
    path: '**',
    redirectTo: '',
  },
];

import { Routes } from '@angular/router';
import { primerUsoPendiente } from './core/guards/primer-uso';
import { urlCanonica } from './core/guards/url-canonica';

export const routes: Routes = [
  // Bienvenida del primer uso: fuera del guard primerUsoPendiente, que lleva aquí mientras el
  // administrador no haya entrado nunca.
  {
    path: 'admin/primer-uso',
    loadComponent: () => import('./features/primer-uso/primer-uso').then((m) => m.PrimerUso),
  },
  {
    path: '',
    canActivateChild: [primerUsoPendiente],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/fotografo-list/fotografo-list').then((m) => m.FotografoList),
      },
      // Registro de un usuario fotógrafo: el formulario del fotógrafo con sus datos de acceso. Antes
      // que las rutas de parámetros; "registro" está reservado igual que "admin".
      {
        path: 'registro',
        data: { modo: 'registro' },
        loadComponent: () => import('./features/fotografo-form/fotografo-form').then((m) => m.FotografoForm),
      },
      // Rutas de administración: antes que las de parámetros. "admin" está reservado en el backend
      // (ningún fotógrafo puede tener esa dirección).
      {
        path: 'admin/contrasenya',
        loadComponent: () => import('./features/admin-contrasenya/admin-contrasenya').then((m) => m.AdminContrasenya),
      },
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
    ],
  },
];

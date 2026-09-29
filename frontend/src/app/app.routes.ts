import { Routes } from '@angular/router';
import { conSesion } from './core/guards/con-sesion';
import { puedeGestionarFotografo, soloAdministrador } from './core/guards/permisos';
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
      // Páginas del usuario con la sesión iniciada (menú del usuario). Sin sesión, a la portada.
      // "perfil" y "configuracion" están reservados igual que "admin".
      {
        path: 'perfil',
        canActivate: [conSesion],
        loadComponent: () => import('./features/perfil/perfil').then((m) => m.Perfil),
      },
      {
        path: 'configuracion',
        canActivate: [conSesion],
        loadComponent: () => import('./features/configuracion/configuracion').then((m) => m.Configuracion),
      },
      // Rutas de administración: antes que las de parámetros. "admin" está reservado en el backend
      // (ningún fotógrafo puede tener esa dirección).
      {
        path: 'admin/contrasenya',
        canActivate: [soloAdministrador],
        loadComponent: () => import('./features/admin-contrasenya/admin-contrasenya').then((m) => m.AdminContrasenya),
      },
      {
        path: 'admin/fotografos/nuevo',
        canActivate: [soloAdministrador],
        loadComponent: () => import('./features/fotografo-form/fotografo-form').then((m) => m.FotografoForm),
      },
      {
        path: 'admin/fotografos/:fotografo/editar',
        canActivate: [puedeGestionarFotografo],
        loadComponent: () => import('./features/fotografo-form/fotografo-form').then((m) => m.FotografoForm),
      },
      // Mantenimiento de los portfolios por su fotógrafo propietario (no es cosa del administrador).
      // También antes de las rutas de parámetros; "gestion" está reservado igual que "admin".
      {
        path: 'gestion/:fotografo/portfolios/nuevo',
        canActivate: [urlCanonica, puedeGestionarFotografo],
        loadComponent: () => import('./features/portfolio-form/portfolio-form').then((m) => m.PortfolioForm),
      },
      // "Ordenar portfolios" de un fotógrafo (arrastrándolos), por el propio fotógrafo.
      {
        path: 'gestion/:fotografo/portfolios/ordenar',
        canActivate: [urlCanonica, puedeGestionarFotografo],
        loadComponent: () => import('./features/portfolio-orden/portfolio-orden').then((m) => m.PortfolioOrden),
      },
      {
        path: 'gestion/:fotografo/portfolios/:portfolio/editar',
        canActivate: [urlCanonica, puedeGestionarFotografo],
        loadComponent: () => import('./features/portfolio-form/portfolio-form').then((m) => m.PortfolioForm),
      },
      // Mantenimiento de las colecciones de un portfolio, también por su fotógrafo propietario.
      {
        path: 'gestion/:fotografo/portfolios/:portfolio/colecciones/nuevo',
        canActivate: [urlCanonica, puedeGestionarFotografo],
        loadComponent: () => import('./features/coleccion-form/coleccion-form').then((m) => m.ColeccionForm),
      },
      // "Gestionar colecciones" de un portfolio (ordenarlas arrastrándolas y elegir la de portada),
      // también por su fotógrafo propietario.
      {
        path: 'gestion/:fotografo/portfolios/:portfolio/colecciones/gestionar',
        canActivate: [urlCanonica, puedeGestionarFotografo],
        loadComponent: () => import('./features/coleccion-gestion/coleccion-gestion').then((m) => m.ColeccionGestion),
      },
      {
        path: 'gestion/:fotografo/portfolios/:portfolio/colecciones/:coleccion/editar',
        canActivate: [urlCanonica, puedeGestionarFotografo],
        loadComponent: () => import('./features/coleccion-form/coleccion-form').then((m) => m.ColeccionForm),
      },
      // "Gestionar fotos" de una colección (añadir y eliminar), también por su fotógrafo propietario.
      {
        path: 'gestion/:fotografo/portfolios/:portfolio/colecciones/:coleccion/fotos',
        canActivate: [urlCanonica, puedeGestionarFotografo],
        loadComponent: () => import('./features/coleccion-fotos/coleccion-fotos').then((m) => m.ColeccionFotos),
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
        loadComponent: () => import('./features/coleccion-list/coleccion-list').then((m) => m.ColeccionList),
      },
      {
        path: ':fotografo/:portfolio/:coleccion',
        canActivate: [urlCanonica],
        loadComponent: () => import('./features/coleccion-detail/coleccion-detail').then((m) => m.ColeccionDetail),
      },
      {
        path: '**',
        redirectTo: '',
      },
    ],
  },
];

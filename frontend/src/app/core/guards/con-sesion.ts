import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { SesionService } from '../services/sesion';

// Páginas del propio usuario ("Mi perfil", "Editar cuenta"): sin sesión iniciada, a la portada.
export const conSesion: CanActivateFn = () => {
  const router = inject(Router);
  return inject(SesionService)
    .comprobar()
    .pipe(map((usuario) => (usuario ? true : router.createUrlTree(['/']))));
};

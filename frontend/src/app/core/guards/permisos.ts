import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { SesionService } from '../services/sesion';

// Permisos de las páginas de mantenimiento. Si alguien llega a ellas sin permiso (p. ej.
// escribiendo la dirección), vuelve a la portada. El backend comprueba los mismos permisos en cada
// operación: esto solo evita mostrar un formulario que no podría guardar.

// /gestion/:fotografo/… y /admin/fotografos/:fotografo/editar: el propio fotógrafo o el administrador.
export const puedeGestionarFotografo: CanActivateFn = (ruta) => {
  const router = inject(Router);
  const sesion = inject(SesionService);
  return sesion
    .comprobar()
    .pipe(map(() => (sesion.puedeGestionar(ruta.paramMap.get('fotografo')) ? true : router.createUrlTree(['/']))));
};

// /admin/fotografos/nuevo y /admin/contrasenya: solo el administrador.
export const soloAdministrador: CanActivateFn = () => {
  const router = inject(Router);
  const sesion = inject(SesionService);
  return sesion.comprobar().pipe(map(() => (sesion.esAdministrador() ? true : router.createUrlTree(['/']))));
};

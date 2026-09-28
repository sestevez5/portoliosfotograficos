import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AdministracionService } from '../services/administracion';

// Mientras la aplicación esté en su primer uso (el administrador no ha entrado nunca), cualquier
// página lleva a la bienvenida (/admin/primer-uso), que pide las credenciales del administrador.
export const primerUsoPendiente: CanActivateChildFn = () => {
  const router = inject(Router);
  return inject(AdministracionService)
    .primerUsoPendiente()
    .pipe(map((pendiente) => (pendiente ? router.createUrlTree(['/admin/primer-uso']) : true)));
};

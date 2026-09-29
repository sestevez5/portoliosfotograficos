import { HttpInterceptorFn } from '@angular/common/http';

// Todas las peticiones a la API llevan la cookie de sesión. En desarrollo la API está en otro
// puerto (localhost:3000) y sin esto el navegador no la enviaría; en Docker es el mismo origen.
export const conCredenciales: HttpInterceptorFn = (peticion, siguiente) =>
  siguiente(peticion.clone({ withCredentials: true }));

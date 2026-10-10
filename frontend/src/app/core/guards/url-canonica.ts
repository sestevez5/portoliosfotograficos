import { inject } from '@angular/core';
import { CanActivateFn, PRIMARY_OUTLET, Router } from '@angular/router';
import { normalizarNombre } from '../utils/normalizar-nombre';

// En las URL nunca hay mayúsculas ni espacios: si se entra escribiendo alguna de esas formas
// (/SEST/Proyectos Personales), se redirige a la forma canónica (/sest/proyectos-personales).
// Se comparan los segmentos ya decodificados, no la URL en bruto, para no confundir la
// codificación %C3%B1 de la "ñ" con mayúsculas.
export const urlCanonica: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const url = router.parseUrl(state.url);
  const segmentos = (url.root.children[PRIMARY_OUTLET]?.segments ?? []).map((s) => s.path);
  const canonicos = segmentos.map(normalizarNombre);
  if (canonicos.every((s, i) => s === segmentos[i])) {
    return true;
  }
  // Conserva los parámetros de consulta (p. ej. ?limpia=true, la vista limpia).
  return router.createUrlTree(['/', ...canonicos], { queryParams: url.queryParams });
};

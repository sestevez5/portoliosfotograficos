// Forma normalizada de un nombre: la que se usa en las URL y como nombre de carpeta. Es la única
// función que normaliza nombres en el backend: fotografos.nombreInformalNormalizado (a partir de
// nombreInformal) y portfolios.nombreNormalizado y colecciones.nombreNormalizado (a partir de nombre).
//
// Quita los espacios de los extremos, pasa a minúsculas, escribe "ñ" como "ny", quita las tildes y
// sustituye cada grupo de espacios intermedios por un único guion:
// "  Lucía   Martín " -> "lucia-martin", "Montaña" -> "montanya".
//
// Debe coincidir con normalizarNombre() del frontend (core/utils/normalizar-nombre.ts). Se
// registra como función SQL en la conexión (ver db/conexion.ts) para buscar por segmento de URL.
// Si se cambia, hay que recalcular las columnas normalizadas y renombrar las carpetas.
export function normalizarNombre(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .replace(/ñ/g, 'ny') // antes de quitar tildes: NFD separaría la ñ en "n" + virgulilla
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-');
}

// Un nombre normalizado se usa como nombre de carpeta: debe ser un único segmento de ruta (sin
// "/" ni "\", para que nunca apunte fuera de fotos) y no empezar por "." (las carpetas con
// punto son internas, como la papelera, y no se sirven en /photos).
export function esNombreNormalizadoValido(normalizado: string): boolean {
  return !!normalizado && !/[\\/]/.test(normalizado) && !normalizado.startsWith('.');
}

// Forma normalizada de un nombre, la que se usa en las URL: quita los espacios de los extremos,
// pasa a minúsculas, escribe "ñ" como "ny", quita las tildes y sustituye cada grupo de espacios
// intermedios por un único guion ("  Lucía   Martín " -> "lucia-martin", "Montaña" -> "montanya").
// La API ya devuelve los nombres normalizados para construir los enlaces; aquí solo hace falta para
// llevar a su forma canónica una URL escrita a mano (guards/url-canonica.ts).
// Debe coincidir con normalizarNombre() del backend (backend/src/utils/normalizar-nombre.ts).
export function normalizarNombre(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .replace(/ñ/g, 'ny') // antes de quitar tildes: NFD separaría la ñ en "n" + virgulilla
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-');
}

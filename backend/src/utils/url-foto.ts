// /photos/<fotógrafo>/<portfolio>/<colección>/<nombreFichero>, con los nombres normalizados (que son
// los de sus carpetas). El nombre del fichero se codifica: las fotos subidas desde la web conservan
// el nombre original, que puede llevar espacios, "#", "?"…
export function photoUrl(carpetaFotografo: string, carpetaPortfolio: string, carpetaColeccion: string, nombreFichero: string): string {
  return `/photos/${carpetaFotografo}/${carpetaPortfolio}/${carpetaColeccion}/${encodeURIComponent(nombreFichero)}`;
}

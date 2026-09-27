import { existsSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

// Las carpetas de datos/fotos se llaman como el nombre normalizado de su fotógrafo, portfolio o
// álbum, y se renombran cuando este cambia.

function mismaCarpeta(a: string, b: string): boolean {
  const sa = statSync(a);
  const sb = statSync(b);
  return sa.dev === sb.dev && sa.ino === sb.ino;
}

// Si al renombrar "actual" a "destino" se pisaría otra carpeta. En sistemas de archivos que no
// distinguen mayúsculas (Windows, macOS) "Viajes" y "viajes" son la misma carpeta: no cuenta como
// ocupada.
export function carpetaOcupada(actual: string, destino: string): boolean {
  if (!existsSync(destino)) {
    return false;
  }
  return !(existsSync(actual) && mismaCarpeta(actual, destino));
}

// Renombra la carpeta si existe y si el nombre cambia. Devuelve si se ha renombrado.
export function renombrarCarpeta(actual: string, destino: string): boolean {
  if (actual === destino || !existsSync(actual)) {
    return false;
  }
  renameSync(actual, destino);
  return true;
}

// Para eliminar una carpeta junto con su registro en la BD: dentro de la transacción se aparta a
// una "papelera" oculta en dirPapelera (renombrarla es instantáneo y reversible si la BD falla) y,
// solo cuando el borrado en la BD está confirmado, se borra de verdad con vaciarPapelera(). Las
// carpetas que empiezan por "." no se sirven en /photos. Devuelve null si la carpeta no existía.
export function apartarCarpeta(carpeta: string, dirPapelera: string): string | null {
  if (!existsSync(carpeta)) {
    return null;
  }
  const papelera = path.join(dirPapelera, `.papelera-${path.basename(carpeta)}-${Date.now()}`);
  renameSync(carpeta, papelera);
  return papelera;
}

export function vaciarPapelera(papelera: string | null): void {
  if (!papelera) {
    return;
  }
  try {
    rmSync(papelera, { recursive: true, force: true });
  } catch (error) {
    // El registro ya está eliminado; si la carpeta no se puede borrar ahora (p. ej. un fichero
    // abierto en Windows), queda apartada y oculta y se puede borrar a mano.
    console.warn(`Aviso: no se ha podido borrar ${papelera}:`, (error as Error).message);
  }
}

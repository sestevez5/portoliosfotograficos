import { renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fotosDir } from '../config/rutas.js';
import {
  cambiarOrdenFoto,
  cambiarTituloFoto as cambiarTituloFotoBD,
  eliminarFoto as eliminarFotoBD,
  enTransaccion,
  insertarFoto,
  listarFotos,
  obtenerFoto,
  validar,
  type ColeccionFila,
  type FotoFila,
} from '../db/catalogo.repository.js';
import { RecursoNoEncontrado } from '../errores.js';
import { enOperacion } from '../reglas/index.js';
import { apartarCarpeta, vaciarPapelera } from '../utils/carpetas.js';
import { leerImagen } from '../utils/imagen.js';
import { cargarColeccion } from './coleccion.service.js';
import { borrarMiniaturas } from './miniatura.service.js';

// Alta y eliminación de las fotos de una colección desde la web ("Gestionar fotos"). Cada foto es
// un fichero en la carpeta dla colección (datos/fotos/<fotógrafo>/<portfolio>/<colección>/<nombreFichero>)
// y una fila en la tabla fotos; las dos cosas se hacen en la misma transacción (si falla el
// fichero, la BD no cambia). Los parámetros fotografo, portfolio y coleccion son segmentos de URL.
//
// Como las colecciones, las fotos las mantiene su fotógrafo propietario.

export const TAMANYO_MAXIMO_FOTO_MB = 25;

const carpetaDe = (coleccion: ColeccionFila) =>
  path.join(coleccion.carpetaFotografo, coleccion.carpetaPortfolio, coleccion.nombreNormalizado);

// Añade una foto al final de las dla colección. El nombre de fichero es el del archivo original
// (se guarda tal cual; ver FOTO_NOMBRE_FICHERO_NO_VALIDO). Devuelve la foto guardada.
export function anyadirFoto(fotografo: string, portfolio: string, coleccion: string, nombreFichero: string, datos: Buffer): FotoFila {
  const { actual } = cargarColeccion(fotografo, portfolio, coleccion);
  const carpeta = carpetaDe(actual);
  const imagen = leerImagen(datos);
  enOperacion('ANYADIR_FOTO', { nombreFichero, coleccion: actual.nombre, portfolio: actual.nombrePortfolio }, () =>
    validar.altaFoto(
      actual.idColeccion,
      carpeta,
      nombreFichero,
      imagen !== null && datos.length <= TAMANYO_MAXIMO_FOTO_MB * 1024 * 1024,
      TAMANYO_MAXIMO_FOTO_MB,
    ),
  );

  // Se escribe a un fichero temporal (con punto: no se sirve en /photos) y se renombra, para no
  // dejar nunca una foto a medias.
  const ruta = path.join(fotosDir, carpeta, nombreFichero);
  const temporal = path.join(fotosDir, carpeta, `.subiendo-${Date.now()}-${nombreFichero}`);
  enTransaccion(() => {
    insertarFoto(actual.idColeccion, { nombreFichero, ancho: imagen!.ancho, alto: imagen!.alto });
    try {
      writeFileSync(temporal, datos);
      renameSync(temporal, ruta);
    } catch (error) {
      rmSync(temporal, { force: true });
      throw error;
    }
  });
  return obtenerFoto(actual.idColeccion, nombreFichero)!;
}

// Cambia el orden de las fotos de una colección: nuevoOrden son los nombres de fichero de todas sus
// fotos en el orden en que deben quedar (0, 1, 2…). Si no son exactamente sus fotos (p. ej. porque
// entretanto se ha añadido o eliminado alguna) no cambia nada (regla FOTO_ORDEN_NO_VALIDO).
export function ordenarFotos(fotografo: string, portfolio: string, coleccion: string, nuevoOrden: string[]): void {
  const { actual } = cargarColeccion(fotografo, portfolio, coleccion);
  const fotos = listarFotos(actual.idColeccion);
  enOperacion('ORDENAR_FOTOS', { coleccion: actual.nombre, portfolio: actual.nombrePortfolio }, () =>
    validar.ordenFotos(
      actual.nombre,
      fotos.map((foto) => foto.nombreFichero),
      nuevoOrden,
    ),
  );

  const idPorFichero = new Map(fotos.map((foto) => [foto.nombreFichero, foto.idFoto]));
  enTransaccion(() => nuevoOrden.forEach((nombreFichero, orden) => cambiarOrdenFoto(idPorFichero.get(nombreFichero)!, orden)));
}

// Título que se muestra cuando una foto no tiene ninguno (en la BD, NULL).
export const SIN_TITULO = 'Sin título';

// Cambia el título de una foto. Se guarda sin los espacios de los extremos; vacío o "Sin título"
// es no tener título (NULL). Debe tener menos de LIMITE_TITULO_FOTO caracteres (regla
// FOTO_TITULO_DEMASIADO_LARGO). Devuelve la foto con su nuevo título.
export function cambiarTituloFoto(
  fotografo: string,
  portfolio: string,
  coleccion: string,
  nombreFichero: string,
  titulo: string | null,
): FotoFila {
  const { actual } = cargarColeccion(fotografo, portfolio, coleccion);
  const foto = obtenerFoto(actual.idColeccion, nombreFichero);
  if (!foto) {
    throw new RecursoNoEncontrado(`Foto '${nombreFichero}' no encontrada en '${fotografo}/${portfolio}/${coleccion}'`);
  }

  const limpio = titulo?.trim() || null;
  const nuevo = limpio === SIN_TITULO ? null : limpio;
  enOperacion('CAMBIAR_TITULO_FOTO', { nombreFichero, coleccion: actual.nombre, portfolio: actual.nombrePortfolio }, () =>
    validar.tituloFoto(nuevo),
  );
  cambiarTituloFotoBD(foto.idFoto, nuevo);
  return obtenerFoto(actual.idColeccion, nombreFichero)!;
}

// Elimina una foto (su fila y su fichero). Si era la portada dla colección, la portada pasa a ser
// la primera foto. El fichero se aparta dentro de la transacción y se borra cuando el borrado en
// la BD está confirmado (ver apartarCarpeta).
export function eliminarFoto(fotografo: string, portfolio: string, coleccion: string, nombreFichero: string): void {
  const { actual } = cargarColeccion(fotografo, portfolio, coleccion);
  const foto = obtenerFoto(actual.idColeccion, nombreFichero);
  if (!foto) {
    throw new RecursoNoEncontrado(`Foto '${nombreFichero}' no encontrada en '${fotografo}/${portfolio}/${coleccion}'`);
  }

  enOperacion('ELIMINAR_FOTO', { nombreFichero, coleccion: actual.nombre, portfolio: actual.nombrePortfolio }, () => {
    const papelera = enTransaccion(() => {
      eliminarFotoBD(foto.idFoto);
      return apartarCarpeta(path.join(fotosDir, carpetaDe(actual), nombreFichero), fotosDir);
    });
    vaciarPapelera(papelera);
  });
  borrarMiniaturas(path.join(carpetaDe(actual), nombreFichero));
}

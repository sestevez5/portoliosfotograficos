import { existsSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fotosDir } from '../config/rutas.js';
import {
  cambiarFicheroFoto,
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
  type FotoSinConvertir,
} from '../db/catalogo.repository.js';
import { RecursoNoEncontrado } from '../errores.js';
import { enOperacion, incumplir } from '../reglas/index.js';
import { apartarCarpeta, vaciarPapelera } from '../utils/carpetas.js';
import { convertirAAvif, nombreAvif } from '../utils/foto-avif.js';
import { leerImagen } from '../utils/imagen.js';
import { cargarColeccion } from './coleccion.service.js';
import { borrarMiniaturas, prepararMiniatura } from './miniatura.service.js';

// Alta y eliminación de las fotos de una colección desde la web ("Gestionar fotos"). Cada foto es
// un fichero en la carpeta dla colección (fotos/<fotógrafo>/<portfolio>/<colección>/<nombreFichero>)
// y una fila en la tabla fotos; las dos cosas se hacen en la misma transacción (si falla el
// fichero, la BD no cambia). Los parámetros fotografo, portfolio y coleccion son segmentos de URL.
// Las fotos no se guardan tal como llegan, sino convertidas a AVIF de alta resolución (ver
// utils/foto-avif.ts): la original no se conserva.
//
// Como las colecciones, las fotos las mantiene su fotógrafo propietario.

export const TAMANYO_MAXIMO_FOTO_MB = 25;

const carpetaDe = (coleccion: ColeccionFila) =>
  path.join(coleccion.carpetaFotografo, coleccion.carpetaPortfolio, coleccion.nombreNormalizado);

// Escribe un fichero a través de uno temporal (con punto: no se sirve en /photos) que después se
// renombra, para no dejar nunca una foto a medias.
function escribirFoto(ruta: string, datos: Buffer): void {
  const temporal = path.join(path.dirname(ruta), `.subiendo-${Date.now()}-${path.basename(ruta)}`);
  try {
    writeFileSync(temporal, datos);
    renameSync(temporal, ruta);
  } catch (error) {
    rmSync(temporal, { force: true });
    throw error;
  }
}

// Añade una foto al final de las dla colección, convertida a AVIF. Se guarda con el nombre del archivo
// original y la extensión .avif ("Playa.jpg" -> "Playa.avif"; ver FOTO_NOMBRE_FICHERO_NO_VALIDO), y con
// el ancho y el alto de la versión guardada. Devuelve la foto guardada.
export async function anyadirFoto(
  fotografo: string,
  portfolio: string,
  coleccion: string,
  nombreFichero: string,
  datos: Buffer,
): Promise<FotoFila> {
  const { actual } = cargarColeccion(fotografo, portfolio, coleccion);
  const carpeta = carpetaDe(actual);
  const nombreGuardado = nombreAvif(nombreFichero);
  const operacion = { nombreFichero, coleccion: actual.nombre, portfolio: actual.nombrePortfolio };
  const esImagen = leerImagen(datos) !== null && datos.length <= TAMANYO_MAXIMO_FOTO_MB * 1024 * 1024;
  const comprobar = () =>
    enOperacion('ANYADIR_FOTO', operacion, () =>
      validar.altaFoto(actual.idColeccion, carpeta, nombreFichero, nombreGuardado, esImagen, TAMANYO_MAXIMO_FOTO_MB),
    );
  comprobar();

  let avif: Awaited<ReturnType<typeof convertirAAvif>>;
  try {
    avif = await convertirAAvif(datos);
  } catch {
    // La cabecera parecía de una imagen, pero no se puede decodificar (fichero dañado o incompleto).
    return enOperacion('ANYADIR_FOTO', operacion, () =>
      incumplir('FOTO_FORMATO_NO_VALIDO', { nombreFichero, maximo: TAMANYO_MAXIMO_FOTO_MB }),
    );
  }
  // Mientras se convertía ha podido llegar otra foto con el mismo nombre.
  comprobar();

  enTransaccion(() => {
    insertarFoto(actual.idColeccion, { nombreFichero: nombreGuardado, ancho: avif.ancho, alto: avif.alto, metadatos: avif.metadatos });
    escribirFoto(path.join(fotosDir, carpeta, nombreGuardado), avif.datos);
  });
  // La miniatura, ya ahora: así se ve al instante en las cuadrículas.
  await prepararMiniatura(path.join(carpeta, nombreGuardado));
  return obtenerFoto(actual.idColeccion, nombreGuardado)!;
}

// Convierte a AVIF una foto guardada antes de que las fotos se guardaran así (npm run fotos:convertir):
// sustituye su fichero por la versión AVIF ("Playa.jpg" -> "Playa.avif", o "Playa-2.avif" si ya hay otra
// foto con ese nombre en la colección), actualiza su nombre, ancho y alto, y borra la original y sus
// miniaturas. Devuelve el peso del fichero antes y después, o null si el fichero no existe.
export async function convertirFotoGuardada(foto: FotoSinConvertir): Promise<{ antes: number; despues: number } | null> {
  const carpeta = path.join(foto.carpetaFotografo, foto.carpetaPortfolio, foto.carpetaColeccion);
  const original = path.join(fotosDir, carpeta, foto.nombreFichero);
  if (!existsSync(original)) {
    console.warn(`Aviso: no existe el fichero de la foto fotos/${carpeta}/${foto.nombreFichero}; no se convierte.`);
    return null;
  }
  const operacion = { nombreFichero: foto.nombreFichero, coleccion: foto.coleccion, portfolio: foto.portfolio };
  const avif = await convertirAAvif(original);

  const base = nombreAvif(foto.nombreFichero).slice(0, -'.avif'.length);
  const libre = (nombre: string) => !obtenerFoto(foto.idColeccion, nombre) && !existsSync(path.join(fotosDir, carpeta, nombre));
  let nombre = `${base}.avif`;
  for (let n = 2; !libre(nombre); n++) {
    nombre = `${base}-${n}.avif`;
  }

  const antes = statSync(original).size;
  enOperacion('CONVERTIR_FOTO', operacion, () =>
    enTransaccion(() => {
      cambiarFicheroFoto(foto.idFoto, { nombreFichero: nombre, ancho: avif.ancho, alto: avif.alto, metadatos: avif.metadatos });
      escribirFoto(path.join(fotosDir, carpeta, nombre), avif.datos);
    }),
  );
  rmSync(original, { force: true });
  borrarMiniaturas(path.join(carpeta, foto.nombreFichero));
  return { antes, despues: avif.datos.length };
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

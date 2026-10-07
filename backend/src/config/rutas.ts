import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Dos carpetas hermanas dentro de una carpeta "contenido", como en el NAS:
// - datos: los datos internos de la aplicación, base de datos (BD/), logos, miniaturas y fotos de
//   perfil. Por defecto backend/contenido/datos; se puede cambiar con DATOS_DIR.
// - fotos: las fotos de las colecciones (<fotógrafo>/<portfolio>/<colección>/<fichero>). Por defecto
//   backend/contenido/fotos; se puede cambiar con FOTOS_DIR (en Docker, /app/fotos, montada desde el host).
// Si se indica DATOS_DIR pero no FOTOS_DIR (los tests, con una carpeta temporal), las fotos van dentro
// de esa carpeta de datos, para que cada uno tenga las suyas.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const datosDir = process.env.DATOS_DIR
  ? path.resolve(process.env.DATOS_DIR)
  : path.resolve(__dirname, '../../contenido/datos');

export const fotosDir = process.env.FOTOS_DIR
  ? path.resolve(process.env.FOTOS_DIR)
  : process.env.DATOS_DIR
    ? path.join(datosDir, 'fotos')
    : path.resolve(__dirname, '../../contenido/fotos');
export const logosDir = path.join(datosDir, 'logos');
// Fotos de perfil de los usuarios (u<idUsuario>.jpg), internas como los logos.
export const avataresDir = path.join(datosDir, 'avatares');
// Versiones reducidas de las fotos (ver services/miniatura.service.ts): una caché interna, como los
// logos; se pueden borrar sin perder nada, porque se regeneran al pedirlas.
export const miniaturasDir = path.join(datosDir, 'miniaturas');

// Base de datos SQLite con todo el catálogo. Se puede cambiar con la variable DB_PATH.
export const dbPath = process.env.DB_PATH ?? path.join(datosDir, 'BD/portfolio.db');

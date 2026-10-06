import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Datos de la aplicación: base de datos (BD/) y logos, y por defecto también las fotos. Se puede
// cambiar con la variable DATOS_DIR (p. ej. para pruebas con una carpeta de datos temporal). En
// Docker, los datos (/app/datos) y las fotos (otra ruta, FOTOS_DIR) se montan por separado desde
// el host.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const datosDir = process.env.DATOS_DIR
  ? path.resolve(process.env.DATOS_DIR)
  : path.resolve(__dirname, '../../datos');

export const fotosDir = process.env.FOTOS_DIR ? path.resolve(process.env.FOTOS_DIR) : path.join(datosDir, 'fotos');
export const logosDir = path.join(datosDir, 'logos');
// Fotos de perfil de los usuarios (u<idUsuario>.jpg), internas como los logos.
export const avataresDir = path.join(datosDir, 'avatares');
// Versiones reducidas de las fotos (ver services/miniatura.service.ts): una caché interna, como los
// logos; se pueden borrar sin perder nada, porque se regeneran al pedirlas.
export const miniaturasDir = path.join(datosDir, 'miniaturas');

// Base de datos SQLite con todo el catálogo. Se puede cambiar con la variable DB_PATH.
export const dbPath = process.env.DB_PATH ?? path.join(datosDir, 'BD/portfolio.db');

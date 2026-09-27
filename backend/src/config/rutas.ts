import path from 'node:path';
import { fileURLToPath } from 'node:url';

// backend/datos se monta como volumen externo en Docker (fotos, logos, base de datos). Se puede
// cambiar con la variable DATOS_DIR (p. ej. para pruebas con una carpeta de datos temporal).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const datosDir = process.env.DATOS_DIR
  ? path.resolve(process.env.DATOS_DIR)
  : path.resolve(__dirname, '../../datos');

export const fotosDir = path.join(datosDir, 'fotos');
export const logosDir = path.join(datosDir, 'logos');

// Base de datos SQLite con todo el catálogo. Se puede cambiar con la variable DB_PATH.
export const dbPath = process.env.DB_PATH ?? path.join(datosDir, 'estructura/portfolio.db');

// JSON del que se importa el catálogo cuando la base de datos está vacía.
export const organizacionJsonPath = path.join(datosDir, 'estructura/organizacionFotos.json');

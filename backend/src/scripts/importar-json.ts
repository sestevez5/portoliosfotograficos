// Importa un catálogo en JSON (forma OrganizacionFotos[], ver types/album.ts) en la base de datos
// SQLite. La BD es la única fuente de verdad: esto solo sirve para cargas masivas puntuales (p. ej.
// fotos, mientras no se puedan subir desde la web). Las carpetas de datos/fotos ya deben existir
// con los nombres normalizados.
//
//   npm run db:importar -- ruta/al/fichero.json                -> solo si la base de datos está vacía
//   npm run db:importar -- ruta/al/fichero.json --reemplazar   -> borra el catálogo actual antes
//
// En el contenedor Docker: node dist/scripts/importar-json.js <ruta> [--reemplazar]
import { dbPath } from '../config/rutas.js';
import { abrirBaseDatos } from '../db/conexion.js';
import { estaVacia, importarOrganizacion, leerOrganizacionJson } from '../db/importar.js';
import { ReglaNegocioIncumplida } from '../reglas/index.js';

const args = process.argv.slice(2);
const reemplazar = args.includes('--reemplazar');
const ruta = args.find((a) => !a.startsWith('--'));
if (!ruta) {
  console.error('Uso: npm run db:importar -- <ruta/al/fichero.json> [--reemplazar]');
  process.exit(1);
}

const db = abrirBaseDatos();
if (!reemplazar && !estaVacia(db)) {
  console.error(`La base de datos ${dbPath} ya tiene datos. Usa --reemplazar para sustituirlos.`);
  process.exit(1);
}

let totales;
try {
  totales = importarOrganizacion(db, leerOrganizacionJson(ruta), { reemplazar });
} catch (error) {
  if (error instanceof ReglaNegocioIncumplida) {
    console.error(`No se ha importado nada.\n${error.aTexto()}`);
    process.exit(1);
  }
  throw error;
}
console.log(
  `Importado ${ruta} en ${dbPath}: ${totales.fotografos} fotógrafos, ${totales.portfolios} portfolios, ` +
    `${totales.albumes} álbumes, ${totales.fotos} fotos.`,
);
db.close();

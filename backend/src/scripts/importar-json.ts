// Importa organizacionFotos.json (u otro JSON con la misma forma) en la base de datos SQLite.
//
//   npm run db:importar                          -> solo si la base de datos está vacía
//   npm run db:importar -- --reemplazar          -> borra el catálogo actual y lo vuelve a importar
//   npm run db:importar -- ruta/al/fichero.json
//
// En el contenedor Docker: node dist/scripts/importar-json.js [--reemplazar] [ruta]
import { dbPath, organizacionJsonPath } from '../config/rutas.js';
import { abrirBaseDatos } from '../db/conexion.js';
import { estaVacia, importarOrganizacion, leerOrganizacionJson } from '../db/importar.js';
import { ReglaNegocioIncumplida } from '../reglas/index.js';

const args = process.argv.slice(2);
const reemplazar = args.includes('--reemplazar');
const ruta = args.find((a) => !a.startsWith('--')) ?? organizacionJsonPath;

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

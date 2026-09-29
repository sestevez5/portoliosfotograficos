// Cambia el nombre de un portfolio o de una colección y, si cambia su nombre normalizado, renombra su
// carpeta en datos/fotos (ver services/portfolio.service.ts y services/coleccion.service.ts).
//
//   npm run portfolio:renombrar -- <fotógrafo> <portfolio> "<nuevo nombre>"
//   npm run coleccion:renombrar -- <fotógrafo> <portfolio> <colección> "<nuevo nombre>"
//   npm run coleccion:renombrar -- marta-vidal encargos montanya "Alta montaña"
//
// En el contenedor Docker: node dist/scripts/renombrar-portfolio.js [--coleccion] <...>
// Puede ejecutarse con el backend en marcha: el backend lee la BD en cada petición.
import { RecursoNoEncontrado } from '../errores.js';
import { ReglaNegocioIncumplida } from '../reglas/index.js';
import { renombrarColeccion } from '../services/coleccion.service.js';
import { renombrarPortfolio } from '../services/portfolio.service.js';

const argumentos = process.argv.slice(2);
const esColeccion = argumentos[0] === '--coleccion';
const [fotografo, portfolio, ...resto] = esColeccion ? argumentos.slice(1) : argumentos;
const [coleccion, nuevo] = esColeccion ? resto : [undefined, resto[0]];
if (!fotografo || !portfolio || !nuevo || (esColeccion && !coleccion)) {
  console.error(
    esColeccion
      ? 'Uso: npm run coleccion:renombrar -- <fotógrafo> <portfolio> <colección> "<nuevo nombre>"'
      : 'Uso: npm run portfolio:renombrar -- <fotógrafo> <portfolio> "<nuevo nombre>"',
  );
  process.exit(1);
}

try {
  const { antes, despues, carpetaRenombrada } = esColeccion
    ? renombrarColeccion(fotografo, portfolio, coleccion!, nuevo)
    : renombrarPortfolio(fotografo, portfolio, nuevo);
  console.log(`'${antes.nombre}' -> '${despues.nombre}'`);
  console.log(
    carpetaRenombrada
      ? `Carpeta renombrada: ${antes.nombreNormalizado} -> ${despues.nombreNormalizado}`
      : `La carpeta no cambia (${despues.nombreNormalizado})`,
  );
} catch (error) {
  if (error instanceof ReglaNegocioIncumplida) {
    console.error(error.aTexto());
    process.exit(1);
  }
  if (error instanceof RecursoNoEncontrado) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

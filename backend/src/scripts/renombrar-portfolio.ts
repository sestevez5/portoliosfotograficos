// Cambia el nombre de un portfolio o de un álbum y, si cambia su nombre normalizado, renombra su
// carpeta en datos/fotos (ver services/portfolio.service.ts y services/album.service.ts).
//
//   npm run portfolio:renombrar -- <fotógrafo> <portfolio> "<nuevo nombre>"
//   npm run album:renombrar -- <fotógrafo> <portfolio> <álbum> "<nuevo nombre>"
//   npm run album:renombrar -- marta-vidal encargos montanya "Alta montaña"
//
// En el contenedor Docker: node dist/scripts/renombrar-portfolio.js [--album] <...>
// Puede ejecutarse con el backend en marcha: el backend lee la BD en cada petición.
import { RecursoNoEncontrado } from '../errores.js';
import { ReglaNegocioIncumplida } from '../reglas/index.js';
import { renombrarAlbum } from '../services/album.service.js';
import { renombrarPortfolio } from '../services/portfolio.service.js';

const argumentos = process.argv.slice(2);
const esAlbum = argumentos[0] === '--album';
const [fotografo, portfolio, ...resto] = esAlbum ? argumentos.slice(1) : argumentos;
const [album, nuevo] = esAlbum ? resto : [undefined, resto[0]];
if (!fotografo || !portfolio || !nuevo || (esAlbum && !album)) {
  console.error(
    esAlbum
      ? 'Uso: npm run album:renombrar -- <fotógrafo> <portfolio> <álbum> "<nuevo nombre>"'
      : 'Uso: npm run portfolio:renombrar -- <fotógrafo> <portfolio> "<nuevo nombre>"',
  );
  process.exit(1);
}

try {
  const { antes, despues, carpetaRenombrada } = esAlbum
    ? renombrarAlbum(fotografo, portfolio, album!, nuevo)
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

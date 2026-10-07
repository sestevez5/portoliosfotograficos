// Cambia el nombreInformal de un fotógrafo y, si cambia su forma normalizada, renombra su
// carpeta en fotos (ver services/fotografo.service.ts).
//
//   npm run fotografo:renombrar -- <fotógrafo actual> "<nuevo nombre informal>"
//   npm run fotografo:renombrar -- santi-estevez "Santiago Estévez"
//
// En el contenedor Docker: node dist/scripts/renombrar-fotografo.js <actual> "<nuevo>"
// Puede ejecutarse con el backend en marcha: el backend lee la BD en cada petición.
import { RecursoNoEncontrado } from '../errores.js';
import { ReglaNegocioIncumplida } from '../reglas/index.js';
import { cambiarNombreInformal } from '../services/fotografo.service.js';

const [actual, nuevo] = process.argv.slice(2);
if (!actual || !nuevo) {
  console.error('Uso: npm run fotografo:renombrar -- <fotógrafo actual> "<nuevo nombre informal>"');
  process.exit(1);
}

try {
  const { antes, despues, carpetaRenombrada } = cambiarNombreInformal(actual, nuevo);
  console.log(`'${antes.nombreInformal}' -> '${despues.nombreInformal}'`);
  console.log(
    carpetaRenombrada
      ? `Carpeta renombrada: fotos/${antes.nombreInformalNormalizado} -> fotos/${despues.nombreInformalNormalizado}`
      : `La carpeta no cambia (fotos/${despues.nombreInformalNormalizado})`,
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

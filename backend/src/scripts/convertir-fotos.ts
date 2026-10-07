// Convierte a AVIF de alta resolución las fotos guardadas antes de que se guardaran así (ver
// utils/foto-avif.ts y convertirFotoGuardada() en services/foto.service.ts): sustituye cada fichero
// por su versión AVIF, actualiza la BD y BORRA LA ORIGINAL. No se puede deshacer: haz antes una copia
// de seguridad de la carpeta de fotos y de la base de datos.
//
//   npm run fotos:convertir
//
// En el contenedor Docker: node dist/scripts/convertir-fotos.js
// Puede ejecutarse con el backend en marcha. Si se interrumpe, basta con volver a ejecutarlo: solo
// convierte las fotos que aún no son AVIF.
import { availableParallelism } from 'node:os';
import { listarFotosSinConvertir } from '../db/catalogo.repository.js';
import { ReglaNegocioIncumplida } from '../reglas/index.js';
import { convertirFotoGuardada } from '../services/foto.service.js';

const pendientes = listarFotosSinConvertir();
if (pendientes.length === 0) {
  console.log('Todas las fotos están ya en AVIF.');
  process.exit(0);
}
console.log(`Fotos por convertir: ${pendientes.length}`);

const total = pendientes.length;
const pesos = { antes: 0, despues: 0 };
let hechas = 0;
let fallidas = 0;
const inicio = Date.now();

// Varias a la vez (la codificación AVIF es lenta), sin ocupar todos los núcleos.
async function trabajador(): Promise<void> {
  for (let foto = pendientes.shift(); foto; foto = pendientes.shift()) {
    try {
      const resultado = await convertirFotoGuardada(foto);
      if (resultado) {
        pesos.antes += resultado.antes;
        pesos.despues += resultado.despues;
      } else {
        fallidas++;
      }
    } catch (error) {
      fallidas++;
      console.error(error instanceof ReglaNegocioIncumplida ? error.aTexto() : `${foto.nombreFichero}: ${(error as Error).message}`);
    }
    if (++hechas % 25 === 0 || hechas === total) {
      console.log(`${hechas}/${total}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2))) }, trabajador));

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
console.log(`Convertidas: ${total - fallidas} en ${Math.round((Date.now() - inicio) / 1000)} s; sin convertir: ${fallidas}`);
if (pesos.antes > 0) {
  console.log(`Antes: ${mb(pesos.antes)}; ahora: ${mb(pesos.despues)} (${Math.round((100 * pesos.despues) / pesos.antes)} %)`);
}
process.exit(fallidas > 0 ? 1 : 0);

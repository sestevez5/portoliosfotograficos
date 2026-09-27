// Reglas de negocio: catálogo (qué no se permite y con qué mensaje), el error que se lanza al
// incumplirlas y las validaciones que las comprueban contra la base de datos.
export { OPERACIONES, REGLAS, type CodigoOperacion, type CodigoRegla } from './catalogo.js';
export {
  enOperacion,
  exigir,
  incumplir,
  ReglaNegocioIncumplida,
  type DatosRegla,
  type OperacionIntentada,
} from './regla-incumplida.js';
export { validadorCatalogo, type ValidadorCatalogo } from './validaciones.js';

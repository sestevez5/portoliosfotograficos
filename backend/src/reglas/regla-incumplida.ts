import { OPERACIONES, REGLAS, type CodigoOperacion, type CodigoRegla } from './catalogo.js';

export type DatosRegla = Record<string, string | number>;

export interface OperacionIntentada {
  codigo: CodigoOperacion;
  descripcion: string;
}

// Error que se lanza cuando se intenta algo que una regla de negocio no permite. Lleva el
// código de la regla, su mensaje ya redactado, los datos con los que se ha incumplido y, si se
// ha lanzado dentro de enOperacion(), la operación que se intentaba realizar.
export class ReglaNegocioIncumplida extends Error {
  readonly mensajeRegla: string;
  operacion?: OperacionIntentada;

  constructor(
    readonly codigo: CodigoRegla,
    readonly datos: DatosRegla = {},
  ) {
    const mensajeRegla = redactar(REGLAS[codigo], datos);
    super(mensajeRegla);
    this.name = 'ReglaNegocioIncumplida';
    this.mensajeRegla = mensajeRegla;
  }

  // Asocia la operación que se intentaba y rehace el mensaje completo:
  // 'No se ha podido crear el portfolio "Viajes"… Ya existe otro portfolio…'.
  enOperacion(operacion: OperacionIntentada): this {
    this.operacion = operacion;
    const accion = operacion.descripcion.charAt(0).toLowerCase() + operacion.descripcion.slice(1);
    this.message = `No se ha podido ${accion}. ${this.mensajeRegla}`;
    return this;
  }

  // Texto para la consola (comandos y arranque del backend).
  aTexto(): string {
    const lineas = ['Regla de negocio incumplida.'];
    if (this.operacion) {
      lineas.push(`  Se intentaba: ${this.operacion.descripcion} [${this.operacion.codigo}]`);
    }
    lineas.push(`  Regla:        ${this.mensajeRegla} [${this.codigo}]`);
    return lineas.join('\n');
  }

  // Forma en que se devuelve al cliente de la API (respuesta 422).
  toJSON() {
    return {
      tipo: 'reglaNegocioIncumplida',
      ...(this.operacion && { operacion: this.operacion }),
      regla: { codigo: this.codigo, mensaje: this.mensajeRegla },
      message: this.message,
    };
  }
}

// Sustituye los marcadores {campo} del texto por los datos.
function redactar(texto: string, datos: DatosRegla): string {
  return texto.replace(/\{(\w+)\}/g, (marcador, campo: string) => (campo in datos ? String(datos[campo]) : marcador));
}

export function incumplir(codigo: CodigoRegla, datos?: DatosRegla): never {
  throw new ReglaNegocioIncumplida(codigo, datos);
}

// Comprueba una condición que debe cumplirse; si no, lanza la regla incumplida.
export function exigir(condicion: unknown, codigo: CodigoRegla, datos?: DatosRegla): asserts condicion {
  if (!condicion) {
    incumplir(codigo, datos);
  }
}

// Ejecuta fn como parte de una operación (catálogo OPERACIONES). Si dentro se incumple una
// regla, la regla sale acompañada de la descripción de lo que se intentaba hacer. Si ya traía
// una operación (operaciones anidadas), se conserva la más concreta, la interior.
export function enOperacion<T>(codigo: CodigoOperacion, datos: DatosRegla, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ReglaNegocioIncumplida && !error.operacion) {
      error.enOperacion({ codigo, descripcion: redactar(OPERACIONES[codigo], datos) });
    }
    throw error;
  }
}

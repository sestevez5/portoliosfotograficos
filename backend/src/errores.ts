// El elemento pedido no existe (no es una regla de negocio incumplida: ver reglas/). La API lo
// responde con 404.
export class RecursoNoEncontrado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'RecursoNoEncontrado';
  }
}

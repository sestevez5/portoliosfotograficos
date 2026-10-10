// El elemento pedido no existe (no es una regla de negocio incumplida: ver reglas/). La API lo
// responde con 404.
export class RecursoNoEncontrado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'RecursoNoEncontrado';
  }
}

// Hay sesión, pero el usuario no puede hacer esa operación (no es suyo lo que intenta modificar y
// no es el administrador). La API lo responde con 403.
export class SinPermiso extends Error {
  constructor(mensaje = 'No tienes permiso para modificar datos de otro usuario.') {
    super(mensaje);
    this.name = 'SinPermiso';
  }
}

// Un portfolio o una colección bloqueados (visibilidad 'bloqueado'): quien no es su fotógrafo ni el
// administrador ve que existen, pero no puede entrar. La API lo responde con 403 y tipo
// "accesoRestringido", para que la web muestre "Acceso restringido" en vez de "no encontrado".
export class AccesoRestringido extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'AccesoRestringido';
  }
}

// La operación necesita la sesión iniciada y no la hay (o ha caducado). La API lo responde con 401.
export class SinSesion extends Error {
  constructor(mensaje = 'Hay que iniciar sesión.') {
    super(mensaje);
    this.name = 'SinSesion';
  }
}

// Quita tildes y cualquier carácter que no sea letra o número ASCII: "Estévez" -> "estevez", "Íñigo" -> "inigo".
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// usuario de un fotógrafo: inicial del nombre + tres primeras letras del primer apellido
// ("Santi Estévez" -> "sest"). Si ya está ocupado se añade un número: "sest2", "sest3"...
// Se calcula una sola vez al dar de alta al fotógrafo y queda guardado, porque es el nombre
// de su carpeta en fotos. Es interno: no se muestra ni forma parte de las URL.
export function generarUsuario(
  nombre: string,
  primerApellido: string,
  ocupado: (usuario: string) => boolean,
): string {
  const base = normalizar(nombre).slice(0, 1) + normalizar(primerApellido).slice(0, 3);
  if (!base) {
    throw new Error(`No se puede generar un usuario para "${nombre} ${primerApellido}"`);
  }

  let usuario = base;
  for (let n = 2; ocupado(usuario); n++) {
    usuario = `${base}${n}`;
  }
  return usuario;
}

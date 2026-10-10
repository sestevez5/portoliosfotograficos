import { readFileSync } from 'node:fs';

// Versión de la aplicación, su fecha, su autor y sus colaboradores, de backend/package.json (una única versión para todo
// el monorepo; ver "Versionado" en CLAUDE.md). fechaVersion es el día en que se publicó y se actualiza
// con la versión. package.json está dos carpetas por encima tanto de src/config como de dist/config, y
// también se copia a la imagen Docker.
const paquete = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
  fechaVersion: string;
  author: string;
  // Campo estándar de npm: nombres ("Ana Uno <ana@x.com>") u objetos { name, email?, url? }.
  contributors?: (string | { name: string })[];
};

export const VERSION_APLICACION = paquete.version;
export const FECHA_VERSION_APLICACION = paquete.fechaVersion;
export const AUTOR = paquete.author;
// Solo el nombre de cada uno (sin correo ni web).
export const COLABORADORES = (paquete.contributors ?? []).map((c) => (typeof c === 'string' ? c.replace(/\s*[<(].*$/, '') : c.name).trim());

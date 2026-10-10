import { readFileSync } from 'node:fs';

// Versión de la aplicación, su fecha y su autor, de backend/package.json (una única versión para todo
// el monorepo; ver "Versionado" en CLAUDE.md). fechaVersion es el día en que se publicó y se actualiza
// con la versión. package.json está dos carpetas por encima tanto de src/config como de dist/config, y
// también se copia a la imagen Docker.
const paquete = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
  fechaVersion: string;
  author: string;
};

export const VERSION_APLICACION = paquete.version;
export const FECHA_VERSION_APLICACION = paquete.fechaVersion;
export const AUTOR = paquete.author;

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { OrganizacionFotos } from '../types/album.js';

// Se lee en runtime (no se importa como módulo ESM) porque "datos" se monta como
// volumen externo en Docker y no está presente en el contexto de build de la imagen.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const datosDir = path.resolve(__dirname, '../../datos');
const organizacionFotosPath = path.join(datosDir, 'estructura/organizacionFotos.json');

export const organizacionFotos = JSON.parse(readFileSync(organizacionFotosPath, 'utf-8')) as OrganizacionFotos[];

// Mismo formato que el fichero escrito a mano: indentación de 2 espacios, listas de
// valores simples (tags) en una línea y cada foto en una sola línea.
function formatear(valor: unknown, sangria = '', enFotos = false): string {
  if (Array.isArray(valor)) {
    if (valor.every((v) => v === null || typeof v !== 'object')) {
      return `[${valor.map((v) => JSON.stringify(v)).join(', ')}]`;
    }
    const interior = sangria + '  ';
    return `[\n${valor.map((v) => interior + formatear(v, interior, enFotos)).join(',\n')}\n${sangria}]`;
  }
  if (valor !== null && typeof valor === 'object') {
    const entradas = Object.entries(valor).filter(([, v]) => v !== undefined);
    if (enFotos) {
      return `{ ${entradas.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;
    }
    const interior = sangria + '  ';
    const lineas = entradas.map(([k, v]) => `${interior}${JSON.stringify(k)}: ${formatear(v, interior, k === 'photos')}`);
    return `{\n${lineas.join(',\n')}\n${sangria}}`;
  }
  return JSON.stringify(valor);
}

// Escritura atómica (fichero temporal + rename) para no dejar nunca el JSON a medias.
// Las operaciones son síncronas, así que dos peticiones no pueden intercalar escrituras.
export function guardarOrganizacion(): void {
  const temporal = `${organizacionFotosPath}.tmp`;
  writeFileSync(temporal, formatear(organizacionFotos) + '\n', 'utf-8');
  renameSync(temporal, organizacionFotosPath);
}

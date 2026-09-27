import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Las contraseñas nunca se guardan en claro: se guarda "scrypt$<sal>$<hash>" (hex) en
// fotografos.passwordHash. scrypt está en node:crypto, sin dependencias externas.
const LONGITUD_HASH = 64;

export function hashContrasenya(contrasenya: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(contrasenya, sal, LONGITUD_HASH);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

// Para el futuro login: comprueba una contraseña contra el hash guardado.
export function verificarContrasenya(contrasenya: string, guardado: string): boolean {
  const [algoritmo, salHex, hashHex] = guardado.split('$');
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) {
    return false;
  }
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = scryptSync(contrasenya, Buffer.from(salHex, 'hex'), esperado.length);
  return timingSafeEqual(calculado, esperado);
}

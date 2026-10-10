import assert from 'node:assert/strict';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ReglaNegocioIncumplida } from '../reglas/index.js';
import { apartarCarpeta, renombrarCarpeta } from './carpetas.js';

const base = mkdtempSync(path.join(tmpdir(), 'portfolio-carpetas-'));

test('renombra la carpeta si existe y el nombre cambia', () => {
  mkdirSync(path.join(base, 'ana'));
  assert.equal(renombrarCarpeta(path.join(base, 'ana'), path.join(base, 'ana-uno')), true);
  assert.ok(existsSync(path.join(base, 'ana-uno')) && !existsSync(path.join(base, 'ana')));
  assert.equal(renombrarCarpeta(path.join(base, 'nadie'), path.join(base, 'otro')), false);
});

// En Windows, un fichero abierto dentro de la carpeta impide renombrarla o moverla (EPERM), como
// cuando el explorador de archivos o un editor la están usando.
test('si otro programa usa la carpeta, se rechaza con la regla CARPETA_EN_USO', { skip: process.platform !== 'win32' }, () => {
  const carpeta = path.join(base, 'el-machango');
  mkdirSync(carpeta);
  writeFileSync(path.join(carpeta, 'foto.avif'), 'x');
  const abierto = openSync(path.join(carpeta, 'foto.avif'), 'r');
  try {
    for (const intentar of [() => renombrarCarpeta(carpeta, path.join(base, 'santi-estevez')), () => apartarCarpeta(carpeta, base)]) {
      assert.throws(intentar, (error) => error instanceof ReglaNegocioIncumplida && error.codigo === 'CARPETA_EN_USO');
    }
    assert.ok(existsSync(carpeta));
  } finally {
    closeSync(abierto);
    rmSync(base, { recursive: true, force: true });
  }
});

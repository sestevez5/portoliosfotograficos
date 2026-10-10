import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { RecursoNoEncontrado } from './errores.js';
import { ERROR_INESPERADO, gestionarErrores } from './gestionar-errores.js';
import { enOperacion, incumplir } from './reglas/index.js';

test('la API responde 422 con la operación intentada y la regla incumplida, y 404 si no existe', async () => {
  const app = express();
  app.post('/portfolios', () =>
    enOperacion('CREAR_PORTFOLIO', { nombre: 'Viajes', fotografo: 'Ana Uno' }, () =>
      incumplir('PORTFOLIO_NOMBRE_DUPLICADO', { nombre: 'Viajes' }),
    ),
  );
  app.get('/nada', () => {
    throw new RecursoNoEncontrado('Fotógrafo "nadie" no encontrado');
  });
  app.use(gestionarErrores);

  const servidor = app.listen(0);
  const base = `http://localhost:${(servidor.address() as AddressInfo).port}`;
  try {
    const regla = await fetch(`${base}/portfolios`, { method: 'POST' });
    assert.equal(regla.status, 422);
    assert.deepEqual(await regla.json(), {
      tipo: 'reglaNegocioIncumplida',
      operacion: { codigo: 'CREAR_PORTFOLIO', descripcion: 'Crear el portfolio "Viajes" del fotógrafo "Ana Uno"' },
      regla: {
        codigo: 'PORTFOLIO_NOMBRE_DUPLICADO',
        mensaje: 'Ya existe otro portfolio con el mismo nombre ("Viajes") para este fotógrafo.',
      },
      message:
        'No se ha podido crear el portfolio "Viajes" del fotógrafo "Ana Uno". Ya existe otro portfolio con el mismo nombre ("Viajes") para este fotógrafo.',
    });

    const noExiste = await fetch(`${base}/nada`);
    assert.equal(noExiste.status, 404);
    assert.deepEqual(await noExiste.json(), { message: 'Fotógrafo "nadie" no encontrado' });
  } finally {
    servidor.close();
  }
});

test('un error inesperado responde 500 con un mensaje en JSON (no una página de error)', async () => {
  const app = express();
  app.get('/falla', () => {
    throw new Error('algo raro');
  });
  app.use(gestionarErrores);
  const servidor = app.listen(0);
  const base = `http://localhost:${(servidor.address() as AddressInfo).port}`;
  const consola = console.error;
  console.error = () => {};
  try {
    const respuesta = await fetch(`${base}/falla`);
    assert.equal(respuesta.status, 500);
    assert.deepEqual(await respuesta.json(), { message: ERROR_INESPERADO });
  } finally {
    console.error = consola;
    servidor.close();
  }
});

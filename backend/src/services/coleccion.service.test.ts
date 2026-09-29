import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

// El repositorio abre la BD al importarse: se apunta antes a una carpeta de datos temporal
// (cada fichero de test se ejecuta en su propio proceso).
const datos = mkdtempSync(path.join(tmpdir(), 'portfolio-datos-'));
process.env.DATOS_DIR = datos;
const fotos = path.join(datos, 'fotos');

const { crearColeccion, editarColeccion, eliminarColeccion } = await import('./coleccion.service.js');
const { ReglaNegocioIncumplida } = await import('../reglas/index.js');
const { RecursoNoEncontrado } = await import('../errores.js');
const { abrirBaseDatos } = await import('../db/conexion.js');
const { importarOrganizacion } = await import('../db/importar.js');

const db = abrirBaseDatos();
importarOrganizacion(db, [
  {
    fotografo: { nombreInformal: 'Ana Uno', nombre: 'Ana', primerApellido: 'Uno', descripcion: '' },
    portfolios: [
      {
        nombre: 'Viajes',
        colecciones: [
          { nombre: 'Mar', tags: ['agua'], fotos: [{ nombreFichero: '01.jpg', orden: 1 }] },
          { nombre: 'Costa', tags: [], fotos: [] },
        ],
      },
    ],
  },
]);
mkdirSync(path.join(fotos, 'ana-uno', 'viajes', 'mar'), { recursive: true });
writeFileSync(path.join(fotos, 'ana-uno', 'viajes', 'mar', '01.jpg'), 'x');
mkdirSync(path.join(fotos, 'ana-uno', 'viajes', 'costa'));
mkdirSync(path.join(fotos, 'ana-uno', 'viajes', 'carpeta-suelta'));

after(() => {
  db.close();
  try {
    rmSync(datos, { recursive: true, force: true });
  } catch {
    // se limpiará con el resto de temporales del sistema
  }
});

const esRegla = (codigo: string) => (error: unknown) =>
  error instanceof ReglaNegocioIncumplida && error.codigo === codigo && error.operacion !== undefined;

const coleccion = (nombreNormalizado: string) => {
  const fila = db
    .prepare('SELECT idColeccion, nombre, descripcion, orden FROM colecciones WHERE nombreNormalizado = ?')
    .get(nombreNormalizado) as { idColeccion: number; nombre: string; descripcion: string | null; orden: number } | undefined;
  if (!fila) {
    return undefined;
  }
  const tags = (db.prepare('SELECT tag FROM coleccionTags WHERE idColeccion = ? ORDER BY orden').all(fila.idColeccion) as { tag: string }[]).map(
    (t) => t.tag,
  );
  const { idColeccion: _, ...resto } = fila;
  return { ...resto, tags };
};

test('el alta crea la colección al final de los del portfolio, con sus tags y su carpeta', () => {
  const normalizado = crearColeccion('ana-uno', 'viajes', { nombre: ' Montaña Ñandú ', descripcion: ' ', tags: [' nieve ', '', 'roca'] });
  assert.equal(normalizado, 'montanya-nyandu');
  assert.deepEqual(coleccion('montanya-nyandu'), { nombre: 'Montaña Ñandú', descripcion: null, orden: 2, tags: ['nieve', 'roca'] });
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'montanya-nyandu')));
});

test('reglas del alta, con la operación CREAR_COLECCION', () => {
  assert.throws(() => crearColeccion('ana-uno', 'viajes', { nombre: 'MAR' }), esRegla('COLECCION_NOMBRE_DUPLICADO'));
  assert.throws(() => crearColeccion('ana-uno', 'viajes', { nombre: ' ' }), esRegla('COLECCION_NOMBRE_OBLIGATORIO'));
  assert.throws(() => crearColeccion('ana-uno', 'viajes', { nombre: 'Carpeta suelta' }), esRegla('COLECCION_CARPETA_OCUPADA'));
  assert.throws(() => crearColeccion('ana-uno', 'viajes', { nombre: 'a/b' }), esRegla('NOMBRE_NO_VALIDO'));
  assert.throws(() => crearColeccion('ana-uno', 'viajes', { nombre: 'X', tags: ['a', 'a'] }), esRegla('COLECCION_TAG_DUPLICADO'));
  assert.throws(() => crearColeccion('ana-uno', 'nada', { nombre: 'X' }), RecursoNoEncontrado);
  assert.equal(coleccion('carpeta-suelta'), undefined);
  assert.equal(coleccion('x'), undefined);
});

test('editar cambia nombre, descripción y tags y renombra la carpeta con sus fotos', () => {
  const resultado = editarColeccion('ana-uno', 'viajes', 'mar', { nombre: 'Mar del Norte', descripcion: 'Frío', tags: ['olas'] });
  assert.equal(resultado.despues.nombreNormalizado, 'mar-del-norte');
  assert.ok(resultado.carpetaRenombrada);
  assert.deepEqual(coleccion('mar-del-norte'), { nombre: 'Mar del Norte', descripcion: 'Frío', orden: 0, tags: ['olas'] });
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'mar-del-norte', '01.jpg')));
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'viajes', 'mar')));

  // Mismo nombre: no choca consigo mismo ni mueve la carpeta; sin tags ni descripción, los borra.
  assert.equal(editarColeccion('ana-uno', 'viajes', 'mar-del-norte', { nombre: 'mar del norte' }).carpetaRenombrada, false);
  assert.deepEqual(coleccion('mar-del-norte'), { nombre: 'mar del norte', descripcion: null, orden: 0, tags: [] });
});

test('reglas de la edición, con la operación EDITAR_COLECCION, sin cambiar nada', () => {
  assert.throws(() => editarColeccion('ana-uno', 'viajes', 'costa', { nombre: 'Mar del norte' }), (error: unknown) => {
    assert.ok(error instanceof ReglaNegocioIncumplida);
    assert.equal(error.codigo, 'COLECCION_NOMBRE_DUPLICADO');
    assert.equal(error.operacion?.descripcion, 'Modificar la colección "Costa" del portfolio "Viajes"');
    return true;
  });
  assert.throws(() => editarColeccion('ana-uno', 'viajes', 'costa', { nombre: 'Carpeta suelta' }), esRegla('COLECCION_CARPETA_OCUPADA'));
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'costa')));
  assert.equal(coleccion('costa')?.nombre, 'Costa');
  assert.throws(() => editarColeccion('ana-uno', 'viajes', 'nada', { nombre: 'X' }), RecursoNoEncontrado);
});

test('eliminar una colección sin fotos lo borra con su carpeta', () => {
  eliminarColeccion('ana-uno', 'viajes', 'costa', false);
  assert.equal(coleccion('costa'), undefined);
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'viajes', 'costa')));
});

test('eliminar una colección con fotos exige confirmación y después lo borra todo', () => {
  assert.throws(() => eliminarColeccion('ana-uno', 'viajes', 'mar-del-norte', false), (error: unknown) => {
    assert.ok(error instanceof ReglaNegocioIncumplida);
    assert.equal(error.codigo, 'COLECCION_ELIMINAR_CON_FOTOS');
    assert.equal(error.operacion?.descripcion, 'Eliminar la colección "mar del norte" del portfolio "Viajes"');
    assert.match(error.mensajeRegla, /contiene fotos.*¿Desea continuar?/);
    return true;
  });
  assert.ok(coleccion('mar-del-norte'));
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'mar-del-norte', '01.jpg')));

  eliminarColeccion('ana-uno', 'viajes', 'mar-del-norte', true);
  assert.equal(coleccion('mar-del-norte'), undefined);
  assert.equal((db.prepare('SELECT count(*) AS n FROM fotos').get() as { n: number }).n, 0);
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'viajes', 'mar-del-norte')));
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'montanya-nyandu')));
  assert.deepEqual(readdirSync(fotos).filter((d) => d.startsWith('.papelera')), []);
  assert.throws(() => eliminarColeccion('ana-uno', 'viajes', 'mar-del-norte', true), RecursoNoEncontrado);
});

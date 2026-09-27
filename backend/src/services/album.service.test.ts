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

const { crearAlbum, editarAlbum, eliminarAlbum } = await import('./album.service.js');
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
        albumes: [
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

const album = (nombreNormalizado: string) => {
  const fila = db
    .prepare('SELECT idAlbum, nombre, descripcion, orden FROM albumes WHERE nombreNormalizado = ?')
    .get(nombreNormalizado) as { idAlbum: number; nombre: string; descripcion: string | null; orden: number } | undefined;
  if (!fila) {
    return undefined;
  }
  const tags = (db.prepare('SELECT tag FROM albumTags WHERE idAlbum = ? ORDER BY orden').all(fila.idAlbum) as { tag: string }[]).map(
    (t) => t.tag,
  );
  const { idAlbum: _, ...resto } = fila;
  return { ...resto, tags };
};

test('el alta crea el álbum al final de los del portfolio, con sus tags y su carpeta', () => {
  const normalizado = crearAlbum('ana-uno', 'viajes', { nombre: ' Montaña Ñandú ', descripcion: ' ', tags: [' nieve ', '', 'roca'] });
  assert.equal(normalizado, 'montanya-nyandu');
  assert.deepEqual(album('montanya-nyandu'), { nombre: 'Montaña Ñandú', descripcion: null, orden: 2, tags: ['nieve', 'roca'] });
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'montanya-nyandu')));
});

test('reglas del alta, con la operación CREAR_ALBUM', () => {
  assert.throws(() => crearAlbum('ana-uno', 'viajes', { nombre: 'MAR' }), esRegla('ALBUM_NOMBRE_DUPLICADO'));
  assert.throws(() => crearAlbum('ana-uno', 'viajes', { nombre: ' ' }), esRegla('ALBUM_NOMBRE_OBLIGATORIO'));
  assert.throws(() => crearAlbum('ana-uno', 'viajes', { nombre: 'Carpeta suelta' }), esRegla('ALBUM_CARPETA_OCUPADA'));
  assert.throws(() => crearAlbum('ana-uno', 'viajes', { nombre: 'a/b' }), esRegla('NOMBRE_NO_VALIDO'));
  assert.throws(() => crearAlbum('ana-uno', 'viajes', { nombre: 'X', tags: ['a', 'a'] }), esRegla('ALBUM_TAG_DUPLICADO'));
  assert.throws(() => crearAlbum('ana-uno', 'nada', { nombre: 'X' }), RecursoNoEncontrado);
  assert.equal(album('carpeta-suelta'), undefined);
  assert.equal(album('x'), undefined);
});

test('editar cambia nombre, descripción y tags y renombra la carpeta con sus fotos', () => {
  const resultado = editarAlbum('ana-uno', 'viajes', 'mar', { nombre: 'Mar del Norte', descripcion: 'Frío', tags: ['olas'] });
  assert.equal(resultado.despues.nombreNormalizado, 'mar-del-norte');
  assert.ok(resultado.carpetaRenombrada);
  assert.deepEqual(album('mar-del-norte'), { nombre: 'Mar del Norte', descripcion: 'Frío', orden: 0, tags: ['olas'] });
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'mar-del-norte', '01.jpg')));
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'viajes', 'mar')));

  // Mismo nombre: no choca consigo mismo ni mueve la carpeta; sin tags ni descripción, los borra.
  assert.equal(editarAlbum('ana-uno', 'viajes', 'mar-del-norte', { nombre: 'mar del norte' }).carpetaRenombrada, false);
  assert.deepEqual(album('mar-del-norte'), { nombre: 'mar del norte', descripcion: null, orden: 0, tags: [] });
});

test('reglas de la edición, con la operación EDITAR_ALBUM, sin cambiar nada', () => {
  assert.throws(() => editarAlbum('ana-uno', 'viajes', 'costa', { nombre: 'Mar del norte' }), (error: unknown) => {
    assert.ok(error instanceof ReglaNegocioIncumplida);
    assert.equal(error.codigo, 'ALBUM_NOMBRE_DUPLICADO');
    assert.equal(error.operacion?.descripcion, 'Modificar el álbum "Costa" del portfolio "Viajes"');
    return true;
  });
  assert.throws(() => editarAlbum('ana-uno', 'viajes', 'costa', { nombre: 'Carpeta suelta' }), esRegla('ALBUM_CARPETA_OCUPADA'));
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'costa')));
  assert.equal(album('costa')?.nombre, 'Costa');
  assert.throws(() => editarAlbum('ana-uno', 'viajes', 'nada', { nombre: 'X' }), RecursoNoEncontrado);
});

test('eliminar un álbum sin fotos lo borra con su carpeta', () => {
  eliminarAlbum('ana-uno', 'viajes', 'costa', false);
  assert.equal(album('costa'), undefined);
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'viajes', 'costa')));
});

test('eliminar un álbum con fotos exige confirmación y después lo borra todo', () => {
  assert.throws(() => eliminarAlbum('ana-uno', 'viajes', 'mar-del-norte', false), (error: unknown) => {
    assert.ok(error instanceof ReglaNegocioIncumplida);
    assert.equal(error.codigo, 'ALBUM_ELIMINAR_CON_FOTOS');
    assert.equal(error.operacion?.descripcion, 'Eliminar el álbum "mar del norte" del portfolio "Viajes"');
    assert.match(error.mensajeRegla, /contiene fotos.*¿Desea continuar?/);
    return true;
  });
  assert.ok(album('mar-del-norte'));
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'mar-del-norte', '01.jpg')));

  eliminarAlbum('ana-uno', 'viajes', 'mar-del-norte', true);
  assert.equal(album('mar-del-norte'), undefined);
  assert.equal((db.prepare('SELECT count(*) AS n FROM fotos').get() as { n: number }).n, 0);
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'viajes', 'mar-del-norte')));
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'montanya-nyandu')));
  assert.deepEqual(readdirSync(fotos).filter((d) => d.startsWith('.papelera')), []);
  assert.throws(() => eliminarAlbum('ana-uno', 'viajes', 'mar-del-norte', true), RecursoNoEncontrado);
});

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

const { crearPortfolio, editarPortfolio, eliminarPortfolio, renombrarPortfolio } = await import('./portfolio.service.js');
const { renombrarAlbum } = await import('./album.service.js');
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
          { nombre: 'Mar', tags: [], fotos: [{ nombreFichero: '01.jpg', orden: 1 }] },
          { nombre: 'Costa', tags: [], fotos: [] },
        ],
      },
      { nombre: 'Retratos', albumes: [] },
    ],
  },
]);
mkdirSync(path.join(fotos, 'ana-uno', 'viajes', 'mar'), { recursive: true });
writeFileSync(path.join(fotos, 'ana-uno', 'viajes', 'mar', '01.jpg'), 'x');
mkdirSync(path.join(fotos, 'ana-uno', 'retratos'));
mkdirSync(path.join(fotos, 'ana-uno', 'carpeta-suelta'));

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

test('renombrar un portfolio recalcula su nombre normalizado y renombra su carpeta', () => {
  const resultado = renombrarPortfolio('ana-uno', 'viajes', '  Viajes   por España ');
  assert.equal(resultado.despues.nombre, 'Viajes   por España');
  assert.equal(resultado.despues.nombreNormalizado, 'viajes-por-espanya');
  assert.ok(resultado.carpetaRenombrada);
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes-por-espanya', 'mar', '01.jpg')));
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'viajes')));
  renombrarPortfolio('ana-uno', 'viajes-por-espanya', 'Viajes');
});

test('renombrar un álbum renombra su carpeta dentro de la del portfolio', () => {
  const resultado = renombrarAlbum('ana-uno', 'Viajes', 'Mar', 'Mar del Norte');
  assert.equal(resultado.despues.nombreNormalizado, 'mar-del-norte');
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes', 'mar-del-norte', '01.jpg')));
  assert.deepEqual(db.prepare("SELECT nombre, nombreNormalizado FROM albumes WHERE nombre LIKE 'Mar%'").get(), {
    nombre: 'Mar del Norte',
    nombreNormalizado: 'mar-del-norte',
  });
});

test('si solo cambian mayúsculas o espacios, la carpeta no cambia', () => {
  const resultado = renombrarPortfolio('ana-uno', 'retratos', 'RETRATOS');
  assert.equal(resultado.carpetaRenombrada, false);
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'retratos')));
});

test('no se puede renombrar a un nombre que ya usa otro portfolio o álbum', () => {
  assert.throws(() => renombrarPortfolio('ana-uno', 'viajes', 'retratos'), esRegla('PORTFOLIO_NOMBRE_DUPLICADO'));
  assert.throws(() => renombrarAlbum('ana-uno', 'viajes', 'costa', 'Mar del norte'), esRegla('ALBUM_NOMBRE_DUPLICADO'));
});

test('no se puede renombrar a una carpeta que ya existe, y entonces no cambia nada', () => {
  assert.throws(() => renombrarPortfolio('ana-uno', 'viajes', 'Carpeta suelta'), esRegla('PORTFOLIO_CARPETA_OCUPADA'));
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes')));
  assert.equal((db.prepare("SELECT count(*) AS n FROM portfolios WHERE nombre = 'Viajes'").get() as { n: number }).n, 1);
});

test('los nombres que no sirven como carpeta no se admiten', () => {
  assert.throws(() => renombrarAlbum('ana-uno', 'viajes', 'costa', '../fuera'), esRegla('NOMBRE_NO_VALIDO'));
});

test('portfolio o álbum inexistente', () => {
  assert.throws(() => renombrarPortfolio('ana-uno', 'nada', 'X'), RecursoNoEncontrado);
  assert.throws(() => renombrarAlbum('ana-uno', 'viajes', 'nada', 'X'), RecursoNoEncontrado);
});

const portfolio = (nombreNormalizado: string) =>
  db.prepare('SELECT nombre, descripcion, orden FROM portfolios WHERE nombreNormalizado = ?').get(nombreNormalizado) as
    | { nombre: string; descripcion: string | null; orden: number }
    | undefined;

test('el alta crea el portfolio al final de los del fotógrafo y su carpeta', () => {
  const normalizado = crearPortfolio('ana-uno', { nombre: ' Bodas en Galicia ', descripcion: '  ' });
  assert.equal(normalizado, 'bodas-en-galicia');
  assert.deepEqual(portfolio('bodas-en-galicia'), { nombre: 'Bodas en Galicia', descripcion: null, orden: 2 });
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'bodas-en-galicia')));
});

test('reglas del alta, con la operación CREAR_PORTFOLIO', () => {
  assert.throws(() => crearPortfolio('ana-uno', { nombre: 'VIAJES' }), esRegla('PORTFOLIO_NOMBRE_DUPLICADO'));
  assert.throws(() => crearPortfolio('ana-uno', { nombre: ' ' }), esRegla('PORTFOLIO_NOMBRE_OBLIGATORIO'));
  assert.throws(() => crearPortfolio('ana-uno', { nombre: 'Carpeta suelta' }), esRegla('PORTFOLIO_CARPETA_OCUPADA'));
  assert.throws(() => crearPortfolio('ana-uno', { nombre: '.oculto' }), esRegla('NOMBRE_NO_VALIDO'));
  assert.throws(() => crearPortfolio('nadie', { nombre: 'X' }), RecursoNoEncontrado);
  assert.equal(portfolio('carpeta-suelta'), undefined);
});

test('editar cambia nombre y descripción y renombra la carpeta', () => {
  crearPortfolio('ana-uno', { nombre: 'Paisaje' });
  const resultado = editarPortfolio('ana-uno', 'paisaje', { nombre: 'Paisaje nocturno', descripcion: 'De noche' });
  assert.equal(resultado.despues.nombreNormalizado, 'paisaje-nocturno');
  assert.deepEqual(portfolio('paisaje-nocturno'), { nombre: 'Paisaje nocturno', descripcion: 'De noche', orden: 3 });
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'paisaje-nocturno')));
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'paisaje')));

  // Sin descripción, la borra; mismo nombre, no choca consigo mismo.
  editarPortfolio('ana-uno', 'paisaje-nocturno', { nombre: 'Paisaje nocturno' });
  assert.equal(portfolio('paisaje-nocturno')?.descripcion, null);
  assert.throws(() => editarPortfolio('ana-uno', 'paisaje-nocturno', { nombre: 'Retratos' }), esRegla('PORTFOLIO_NOMBRE_DUPLICADO'));
});

test('eliminar un portfolio sin álbumes lo borra con su carpeta', () => {
  crearPortfolio('ana-uno', { nombre: 'Vacío' });
  eliminarPortfolio('ana-uno', 'vacio', false);
  assert.equal(portfolio('vacio'), undefined);
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'vacio')));
});

test('eliminar un portfolio con álbumes exige confirmación y después lo borra todo', () => {
  assert.throws(() => eliminarPortfolio('ana-uno', 'viajes', false), (error: unknown) => {
    assert.ok(error instanceof ReglaNegocioIncumplida);
    assert.equal(error.codigo, 'PORTFOLIO_ELIMINAR_CON_ALBUMES');
    assert.equal(error.operacion?.descripcion, 'Eliminar el portfolio "Viajes" del fotógrafo "Ana Uno"');
    assert.match(error.mensajeRegla, /contiene álbumes.*¿Desea continuar?/);
    return true;
  });
  assert.ok(portfolio('viajes'));
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'viajes')));

  eliminarPortfolio('ana-uno', 'viajes', true);
  assert.equal(portfolio('viajes'), undefined);
  assert.equal((db.prepare('SELECT count(*) AS n FROM albumes').get() as { n: number }).n, 0);
  assert.equal((db.prepare('SELECT count(*) AS n FROM fotos').get() as { n: number }).n, 0);
  assert.ok(!existsSync(path.join(fotos, 'ana-uno', 'viajes')));
  assert.ok(existsSync(path.join(fotos, 'ana-uno', 'retratos')));
  assert.deepEqual(readdirSync(fotos).filter((d) => d.startsWith('.papelera')), []);
  assert.throws(() => eliminarPortfolio('ana-uno', 'viajes', true), RecursoNoEncontrado);
});

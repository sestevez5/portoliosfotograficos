import assert from 'node:assert/strict';
import { test } from 'node:test';
import { abrirBaseDatos } from '../db/conexion.js';
import { importarOrganizacion } from '../db/importar.js';
import type { ColeccionJson, OrganizacionFotos, PortfolioJson } from '../types/catalogo.js';
import { OPERACIONES, REGLAS, type CodigoRegla } from './catalogo.js';
import { ReglaNegocioIncumplida } from './regla-incumplida.js';
import { validadorCatalogo } from './validaciones.js';

// Cada prueba importa un catálogo en una BD en memoria y comprueba qué regla se incumple.

const coleccion = (nombre: string, extra: Partial<ColeccionJson> = {}): ColeccionJson => ({
  nombre,
  tags: [],
  fotos: [{ nombreFichero: '01.jpg', orden: 1 }],
  ...extra,
});

const portfolio = (nombre: string, colecciones: ColeccionJson[] = [], extra: Partial<PortfolioJson> = {}): PortfolioJson => ({
  nombre,
  colecciones,
  ...extra,
});

const fotografo = (nombreInformal: string, portfolios: PortfolioJson[] = [], extra = {}): OrganizacionFotos => ({
  fotografo: { nombreInformal, nombre: nombreInformal.split(' ')[0], primerApellido: 'Apellido', descripcion: 'x', ...extra },
  portfolios,
});

function importar(catalogo: OrganizacionFotos[]) {
  const db = abrirBaseDatos(':memory:');
  return { db, totales: importarOrganizacion(db, catalogo) };
}

function esperaRegla(catalogo: OrganizacionFotos[], codigo: CodigoRegla) {
  const db = abrirBaseDatos(':memory:');
  assert.throws(
    () => importarOrganizacion(db, catalogo),
    (error: unknown) => error instanceof ReglaNegocioIncumplida && error.codigo === codigo,
  );
  // La importación es una transacción: al incumplirse una regla no queda nada guardado.
  assert.equal((db.prepare('SELECT count(*) AS n FROM fotografos').get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT count(*) AS n FROM usuarios WHERE rol <> 'administrador'").get() as { n: number }).n, 0);
}

test('un catálogo válido se importa entero, con un usuario por fotógrafo', () => {
  const { db, totales } = importar([
    fotografo('Ana Uno', [portfolio('Viajes', [coleccion('Mar'), coleccion('Montaña')]), portfolio('Retratos')], { email: 'ana@x.com' }),
    fotografo('Bea Dos', [portfolio('Viajes', [coleccion('Mar')])]),
  ]);
  assert.deepEqual(totales, { fotografos: 2, portfolios: 3, colecciones: 3, fotos: 3 });
  assert.deepEqual(
    db
      .prepare(
        `SELECT f.nombreInformal, u.usuario, u.email, u.passwordHash
         FROM fotografos f JOIN usuarios u ON u.idUsuario = f.idUsuario ORDER BY f.idFotografo`,
      )
      .all(),
    [
      { nombreInformal: 'Ana Uno', usuario: 'aape', email: 'ana@x.com', passwordHash: null },
      { nombreInformal: 'Bea Dos', usuario: 'bape', email: null, passwordHash: null },
    ],
  );
});

test('el mensaje se redacta con los datos de la regla', () => {
  const error = new ReglaNegocioIncumplida('PORTFOLIO_NOMBRE_DUPLICADO', { nombre: 'Viajes' });
  assert.equal(error.message, 'Ya existe otro portfolio con el mismo nombre ("Viajes") para este fotógrafo.');
});

test('todas las reglas del catálogo tienen mensaje', () => {
  for (const [codigo, mensaje] of Object.entries(REGLAS)) {
    assert.ok(mensaje.trim().length > 0, codigo);
  }
});

test('un fotógrafo no puede tener dos portfolios con el mismo nombre', () => {
  esperaRegla([fotografo('Ana Uno', [portfolio('Viajes'), portfolio('Viajes')])], 'PORTFOLIO_NOMBRE_DUPLICADO');
});

test('los nombres se comparan en su forma de URL (mayúsculas, espacios y tildes)', () => {
  esperaRegla(
    [fotografo('Ana Uno', [portfolio('Ciudad de noche'), portfolio('  ciudad-de   NOCHE ')])],
    'PORTFOLIO_NOMBRE_DUPLICADO',
  );
  esperaRegla([fotografo('Ana Uno', [portfolio('P', [coleccion('Montaña'), coleccion('montanya')])])], 'COLECCION_NOMBRE_DUPLICADO');
});

test('un portfolio no puede tener dos colecciones con el mismo nombre', () => {
  esperaRegla([fotografo('Ana Uno', [portfolio('P', [coleccion('Mar'), coleccion('Mar')])])], 'COLECCION_NOMBRE_DUPLICADO');
});

test('el nombre normalizado se calcula al importar y es el de la carpeta', () => {
  const { db } = importar([fotografo('Ana Uno', [portfolio('  Proyectos   Personales ', [coleccion('Montaña Ñandú')])])]);
  assert.deepEqual(db.prepare('SELECT nombre, nombreNormalizado FROM portfolios').get(), {
    nombre: 'Proyectos   Personales',
    nombreNormalizado: 'proyectos-personales',
  });
  assert.deepEqual(db.prepare('SELECT nombreNormalizado FROM colecciones').get(), { nombreNormalizado: 'montanya-nyandu' });
});

test('los nombres que no sirven como carpeta no se admiten', () => {
  for (const nombre of ['a/b', 'a\\b', '..', '../fuera', '.oculta']) {
    esperaRegla([fotografo('Ana Uno', [portfolio(nombre)])], 'NOMBRE_NO_VALIDO');
    esperaRegla([fotografo('Ana Uno', [portfolio('P', [coleccion(nombre)])])], 'NOMBRE_NO_VALIDO');
  }
  esperaRegla([fotografo('Ana/Uno')], 'NOMBRE_NO_VALIDO');
});

test('nombres obligatorios', () => {
  esperaRegla([fotografo('Ana Uno', [portfolio('  ')])], 'PORTFOLIO_NOMBRE_OBLIGATORIO');
  esperaRegla([fotografo('Ana Uno', [portfolio('P', [coleccion(' ')])])], 'COLECCION_NOMBRE_OBLIGATORIO');
  esperaRegla([fotografo('   ', [], { nombre: 'Ana' })], 'FOTOGRAFO_NOMBRE_INFORMAL_OBLIGATORIO');
  esperaRegla([fotografo('Ana Uno', [], { nombre: '', primerApellido: '' })], 'FOTOGRAFO_NOMBRE_OBLIGATORIO');
  esperaRegla([fotografo('Ana Uno', [], { primerApellido: '' })], 'FOTOGRAFO_PRIMER_APELLIDO_OBLIGATORIO');
  esperaRegla([fotografo('Ana Uno', [], { nombre: '' })], 'FOTOGRAFO_NOMBRE_OBLIGATORIO');
});

test('dos fotógrafos no pueden tener el mismo nombre informal normalizado', () => {
  esperaRegla([fotografo('Íñigo Pérez'), fotografo('inyigo perez')], 'FOTOGRAFO_NOMBRE_INFORMAL_DUPLICADO');
});

test('el correo y el nombre de usuario no pueden repetirse entre usuarios', () => {
  esperaRegla([fotografo('Ana Uno', [], { email: 'a@x.com' }), fotografo('Bea Dos', [], { email: 'A@X.COM' })], 'USUARIO_EMAIL_DUPLICADO');
  esperaRegla([fotografo('Ana Uno', [], { usuario: 'ana' }), fotografo('Bea Dos', [], { usuario: 'ana' })], 'USUARIO_DUPLICADO');
});

test('reglas de las fotos y los tags de una colección', () => {
  const dosFotos = { fotos: [{ nombreFichero: '01.jpg', orden: 1 }, { nombreFichero: '01.jpg', orden: 2 }] };
  esperaRegla([fotografo('Ana Uno', [portfolio('P', [coleccion('Mar', dosFotos)])])], 'FOTO_FICHERO_DUPLICADO');
  esperaRegla([fotografo('Ana Uno', [portfolio('P', [coleccion('Mar', { fotoPortada: '99.jpg' })])])], 'COLECCION_FOTO_PORTADA_INEXISTENTE');
  esperaRegla([fotografo('Ana Uno', [portfolio('P', [coleccion('Mar')], { coleccionPortada: 'Río' })])], 'PORTFOLIO_COLECCION_PORTADA_INEXISTENTE');
  esperaRegla([fotografo('Ana Uno', [portfolio('P', [coleccion('Mar', { tags: ['a', 'b', 'a'] })])])], 'COLECCION_TAG_DUPLICADO');
  const tituloLargo = { fotos: [{ nombreFichero: '01.jpg', titulo: 'x'.repeat(20), orden: 1 }] };
  esperaRegla([fotografo('Ana Uno', [portfolio('P', [coleccion('Mar', tituloLargo)])])], 'FOTO_TITULO_DEMASIADO_LARGO');
});

test('eliminar con contenido exige confirmación', () => {
  const validar = validadorCatalogo(abrirBaseDatos(':memory:'));
  const incumple = (codigo: CodigoRegla) => (error: unknown) =>
    error instanceof ReglaNegocioIncumplida && error.codigo === codigo;
  assert.throws(() => validar.eliminacionPortfolio(2, false), incumple('PORTFOLIO_ELIMINAR_CON_COLECCIONES'));
  assert.throws(() => validar.eliminacionColeccion(3, false), incumple('COLECCION_ELIMINAR_CON_FOTOS'));
  assert.doesNotThrow(() => validar.eliminacionColeccion(3, true));
  assert.doesNotThrow(() => validar.eliminacionColeccion(0, false));
});

test('una foto subida desde la web necesita un nombre de fichero válido y ser una imagen', () => {
  const validar = validadorCatalogo(abrirBaseDatos(':memory:'));
  const incumple = (codigo: CodigoRegla) => (error: unknown) =>
    error instanceof ReglaNegocioIncumplida && error.codigo === codigo;
  const alta = (nombreFichero: string, esImagen = true) => () =>
    validar.altaFoto(1, 'carpeta-de-prueba-inexistente', nombreFichero, 'foto.avif', esImagen, 25);
  for (const nombre of ['', ' foto.jpg', 'a/b.jpg', 'a\\b.jpg', '.oculta.jpg', `${'x'.repeat(201)}.jpg`]) {
    assert.throws(alta(nombre), incumple('FOTO_NOMBRE_FICHERO_NO_VALIDO'), nombre);
  }
  assert.throws(alta('foto.jpg', false), incumple('FOTO_FORMATO_NO_VALIDO'));
  assert.doesNotThrow(alta('Mi foto (1).JPG'));
});

test('un nuevo orden de las fotos nombra todas las de la colección, una vez cada una', () => {
  const validar = validadorCatalogo(abrirBaseDatos(':memory:'));
  const actuales = ['a.jpg', 'b.jpg', 'c.jpg'];
  assert.doesNotThrow(() => validar.ordenFotos('Mar', actuales, ['c.jpg', 'a.jpg', 'b.jpg']));
  for (const nuevo of [['a.jpg', 'b.jpg'], ['a.jpg', 'a.jpg', 'b.jpg'], ['a.jpg', 'b.jpg', 'x.jpg'], [...actuales, 'x.jpg']]) {
    assert.throws(
      () => validar.ordenFotos('Mar', actuales, nuevo),
      (error: unknown) => error instanceof ReglaNegocioIncumplida && error.codigo === 'FOTO_ORDEN_NO_VALIDO',
    );
  }
  // Los portfolios de un fotógrafo y las colecciones de un portfolio siguen la misma regla, con su
  // propio código.
  assert.throws(
    () => validar.ordenPortfolios('Ana Uno', ['viajes', 'bodas'], ['viajes', 'viajes']),
    (error: unknown) => error instanceof ReglaNegocioIncumplida && error.codigo === 'PORTFOLIO_ORDEN_NO_VALIDO',
  );
  assert.doesNotThrow(() => validar.ordenColecciones('Viajes', ['mar', 'rio'], ['rio', 'mar']));
  assert.throws(
    () => validar.ordenColecciones('Viajes', ['mar', 'rio'], ['mar']),
    (error: unknown) => error instanceof ReglaNegocioIncumplida && error.codigo === 'COLECCION_ORDEN_NO_VALIDO',
  );
});

test('al modificar un elemento no choca consigo mismo', () => {
  const { db } = importar([fotografo('Ana Uno', [portfolio('Viajes')])]);
  const validar = validadorCatalogo(db);
  const { idFotografo } = db.prepare('SELECT idFotografo FROM fotografos').get() as { idFotografo: number };
  const { idPortfolio } = db.prepare('SELECT idPortfolio FROM portfolios').get() as { idPortfolio: number };
  assert.doesNotThrow(() => validar.portfolio(idFotografo, 'VIAJES', idPortfolio));
  assert.doesNotThrow(() => validar.nombreInformal('ANA UNO', idFotografo));
  assert.throws(() => validar.portfolio(idFotografo, 'viajes'), /Ya existe otro portfolio/);
});

test('la regla incumplida indica qué se intentaba hacer', () => {
  const db = abrirBaseDatos(':memory:');
  const catalogo = [fotografo('Ana Uno', [portfolio('Viajes'), portfolio('viajes')])];
  try {
    importarOrganizacion(db, catalogo);
    assert.fail('debía incumplirse una regla');
  } catch (error) {
    assert.ok(error instanceof ReglaNegocioIncumplida);
    assert.deepEqual(error.toJSON(), {
      tipo: 'reglaNegocioIncumplida',
      operacion: { codigo: 'CREAR_PORTFOLIO', descripcion: 'Crear el portfolio "viajes" del fotógrafo "Ana Uno"' },
      regla: {
        codigo: 'PORTFOLIO_NOMBRE_DUPLICADO',
        mensaje: 'Ya existe otro portfolio con el mismo nombre ("viajes") para este fotógrafo.',
      },
      message:
        'No se ha podido crear el portfolio "viajes" del fotógrafo "Ana Uno". Ya existe otro portfolio con el mismo nombre ("viajes") para este fotógrafo.',
    });
  }
});

test('se conserva la operación más concreta (la foto, no la colección que la contiene)', () => {
  const dosFotos = { fotos: [{ nombreFichero: '01.jpg', orden: 1 }, { nombreFichero: '01.jpg', orden: 2 }] };
  assert.throws(
    () => importarOrganizacion(abrirBaseDatos(':memory:'), [fotografo('Ana Uno', [portfolio('P', [coleccion('Mar', dosFotos)])])]),
    (error: unknown) =>
      error instanceof ReglaNegocioIncumplida &&
      error.operacion?.codigo === 'ANYADIR_FOTO' &&
      error.operacion.descripcion === 'Añadir la foto "01.jpg" a la colección "Mar" del portfolio "P"',
  );
});

test('todas las operaciones del catálogo tienen texto', () => {
  for (const [codigo, texto] of Object.entries(OPERACIONES)) {
    assert.ok(texto.trim().length > 0, codigo);
  }
});

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

// El repositorio abre la BD al importarse: se apunta antes a una carpeta de datos temporal
// (cada fichero de test se ejecuta en su propio proceso).
const datos = mkdtempSync(path.join(tmpdir(), 'portfolio-datos-'));
mkdirSync(path.join(datos, 'fotos', 'carpeta-ocupada'), { recursive: true });
process.env.DATOS_DIR = datos;

const { crearFotografo, cambiarNombreInformal, editarFotografo, eliminarFotografo } = await import('./fotografo.service.js');
const { RecursoNoEncontrado } = await import('../errores.js');
const { ReglaNegocioIncumplida } = await import('../reglas/index.js');
const { verificarContrasenya } = await import('../utils/contrasenya.js');
const { abrirBaseDatos } = await import('../db/conexion.js');

// Conexión propia del test para consultar lo guardado.
const db = abrirBaseDatos();

// En Windows la carpeta no se puede borrar mientras la BD del servicio siga abierta; al estar en
// la carpeta temporal del sistema, si no se puede borrar se deja.
after(() => {
  db.close();
  try {
    rmSync(datos, { recursive: true, force: true });
  } catch {
    // se limpiará con el resto de temporales del sistema
  }
});

// El fotógrafo junto con su usuario (usuario, email y passwordHash están en usuarios).
const fila = (normalizado: string) =>
  db
    .prepare(
      `SELECT u.idUsuario, u.usuario, f.segundoApellido, u.email, u.passwordHash
       FROM fotografos f JOIN usuarios u ON u.idUsuario = f.idUsuario WHERE f.nombreInformalNormalizado = ?`,
    )
    .get(normalizado) as
    | { idUsuario: number; usuario: string; segundoApellido: string | null; email: string | null; passwordHash: string | null }
    | undefined;

const numeroUsuarios = () => (db.prepare('SELECT count(*) AS n FROM usuarios').get() as { n: number }).n;

const esRegla = (codigo: string) => (error: unknown) =>
  error instanceof ReglaNegocioIncumplida && error.codigo === codigo && error.operacion !== undefined;

test('el alta crea el fotógrafo, su usuario y su carpeta, y guarda solo el hash de la contraseña', () => {
  const creado = crearFotografo({
    nombreInformal: ' Ana Núñez ',
    nombre: 'Ana',
    primerApellido: 'Núñez',
    segundoApellido: '   ',
    email: 'ana@example.com',
    contrasenya: 'secreta123',
  });
  assert.equal(creado.nombreInformal, 'Ana Núñez');
  assert.equal(creado.nombreInformalNormalizado, 'ana-nunyez');
  assert.ok(existsSync(path.join(datos, 'fotos', 'ana-nunyez')));

  const guardado = fila('ana-nunyez')!;
  assert.equal(creado.idUsuario, guardado.idUsuario);
  assert.equal(guardado.usuario, 'anun');
  assert.equal(guardado.email, 'ana@example.com');
  assert.equal(guardado.segundoApellido, null);
  assert.ok(guardado.passwordHash?.startsWith('scrypt$'));
  assert.ok(!guardado.passwordHash?.includes('secreta123'));
  assert.ok(verificarContrasenya('secreta123', guardado.passwordHash!));
  assert.ok(!verificarContrasenya('otra', guardado.passwordHash!));
});

test('reglas del alta (del fotógrafo y de su usuario), con la operación CREAR_FOTOGRAFO', () => {
  const usuariosAntes = numeroUsuarios();
  const base = { nombre: 'Bea', primerApellido: 'Dos' };
  assert.throws(() => crearFotografo({ ...base, nombreInformal: 'ana  NUÑEZ' }), esRegla('FOTOGRAFO_NOMBRE_INFORMAL_DUPLICADO'));
  assert.throws(() => crearFotografo({ ...base, nombreInformal: 'Bea', email: 'ANA@example.com' }), esRegla('USUARIO_EMAIL_DUPLICADO'));
  assert.throws(() => crearFotografo({ ...base, nombreInformal: 'Admin' }), esRegla('FOTOGRAFO_NOMBRE_INFORMAL_RESERVADO'));
  assert.throws(() => crearFotografo({ ...base, nombreInformal: 'Gestión' }), esRegla('FOTOGRAFO_NOMBRE_INFORMAL_RESERVADO'));
  assert.throws(() => crearFotografo({ ...base, nombreInformal: 'Carpeta Ocupada' }), esRegla('FOTOGRAFO_CARPETA_OCUPADA'));
  assert.throws(() => crearFotografo({ ...base, nombreInformal: 'Bea', email: 'bea@@x' }), esRegla('USUARIO_EMAIL_NO_VALIDO'));
  assert.throws(() => crearFotografo({ ...base, nombreInformal: 'Bea', contrasenya: '123' }), esRegla('USUARIO_CONTRASENYA_CORTA'));
  assert.throws(() => crearFotografo({ ...base, nombreInformal: 'Bea', primerApellido: ' ' }), esRegla('FOTOGRAFO_PRIMER_APELLIDO_OBLIGATORIO'));
  // Ninguno de los intentos fallidos ha creado nada: ni fotógrafo, ni usuario, ni carpeta.
  assert.equal(fila('bea'), undefined);
  assert.equal(numeroUsuarios(), usuariosAntes);
  assert.ok(!existsSync(path.join(datos, 'fotos', 'bea')));
});

test('cambiar el nombre informal renombra la carpeta', () => {
  crearFotografo({ nombreInformal: 'Carla Tres', nombre: 'Carla', primerApellido: 'Tres' });
  cambiarNombreInformal('carla-tres', 'Carla Treviño');
  assert.ok(!existsSync(path.join(datos, 'fotos', 'carla-tres')));
  assert.ok(existsSync(path.join(datos, 'fotos', 'carla-trevinyo')));
  assert.throws(() => cambiarNombreInformal('carla-trevinyo', 'Ana Núñez'), esRegla('FOTOGRAFO_NOMBRE_INFORMAL_DUPLICADO'));
});

test('editar actualiza los datos, renombra la carpeta y nunca cambia la contraseña', () => {
  crearFotografo({ nombreInformal: 'Dani Cuatro', nombre: 'Dani', primerApellido: 'Cuatro', email: 'dani@example.com', contrasenya: 'original123' });
  const { passwordHash: hashAntes, idUsuario } = fila('dani-cuatro')!;

  // Mismo email que ya tiene: no choca consigo mismo.
  const editado = editarFotografo('dani-cuatro', {
    nombreInformal: 'Daniela Cuatro',
    nombre: 'Daniela',
    primerApellido: 'Cuatro',
    segundoApellido: 'Sanz',
    email: 'dani@example.com',
    descripcion: 'Nueva descripción',
    contrasenya: '',
  });
  assert.equal(editado.nombreInformalNormalizado, 'daniela-cuatro');
  assert.equal(editado.segundoApellido, 'Sanz');
  assert.ok(!existsSync(path.join(datos, 'fotos', 'dani-cuatro')));
  assert.ok(existsSync(path.join(datos, 'fotos', 'daniela-cuatro')));
  // Sigue siendo el mismo usuario, con la misma contraseña.
  assert.equal(fila('daniela-cuatro')!.idUsuario, idUsuario);
  assert.equal(fila('daniela-cuatro')!.passwordHash, hashAntes);

  // Aunque llegue una contraseña, editar el fotógrafo no la cambia (se cambia en "Editar cuenta").
  editarFotografo('daniela-cuatro', { nombreInformal: 'Daniela Cuatro', nombre: 'Daniela', primerApellido: 'Cuatro', contrasenya: 'nueva12345' });
  assert.equal(fila('daniela-cuatro')!.passwordHash, hashAntes);
  assert.ok(verificarContrasenya('original123', fila('daniela-cuatro')!.passwordHash!));
  assert.equal(fila('daniela-cuatro')!.email, null);

  // El correo de otro usuario no se puede usar.
  assert.throws(
    () => editarFotografo('daniela-cuatro', { nombreInformal: 'Daniela Cuatro', nombre: 'D', primerApellido: 'C', email: 'ana@example.com' }),
    esRegla('USUARIO_EMAIL_DUPLICADO'),
  );

  assert.throws(
    () => editarFotografo('daniela-cuatro', { nombreInformal: 'Ana Núñez', nombre: 'D', primerApellido: 'C' }),
    esRegla('FOTOGRAFO_NOMBRE_INFORMAL_DUPLICADO'),
  );
  assert.throws(() => editarFotografo('nadie', { nombreInformal: 'X', nombre: 'X', primerApellido: 'X' }), RecursoNoEncontrado);
});

test('eliminar sin portfolios borra el fotógrafo, su usuario y su carpeta', () => {
  const { idUsuario } = crearFotografo({ nombreInformal: 'Eva Cinco', nombre: 'Eva', primerApellido: 'Cinco' });
  eliminarFotografo('eva-cinco', false);
  assert.equal(fila('eva-cinco'), undefined);
  assert.equal(db.prepare('SELECT 1 FROM usuarios WHERE idUsuario = ?').get(idUsuario), undefined);
  assert.ok(!existsSync(path.join(datos, 'fotos', 'eva-cinco')));
});

test('eliminar con portfolios exige confirmación y después lo borra todo', () => {
  const creado = crearFotografo({ nombreInformal: 'Fran Seis', nombre: 'Fran', primerApellido: 'Seis' });
  db.prepare("INSERT INTO portfolios (idFotografo, nombreNormalizado, nombre, orden) VALUES (?, 'viajes', 'Viajes', 0)").run(creado.idFotografo);
  mkdirSync(path.join(datos, 'fotos', 'fran-seis', 'viajes', 'mar'), { recursive: true });
  writeFileSync(path.join(datos, 'fotos', 'fran-seis', 'viajes', 'mar', '01.jpg'), 'x');

  assert.throws(() => eliminarFotografo('fran-seis', false), (error: unknown) => {
    assert.ok(error instanceof ReglaNegocioIncumplida);
    assert.equal(error.codigo, 'FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS');
    assert.equal(error.operacion?.descripcion, 'Eliminar al fotógrafo "Fran Seis"');
    assert.match(error.mensajeRegla, /tiene portfolios creados.*¿Desea continuar?/);
    return true;
  });
  assert.ok(fila('fran-seis'));
  assert.ok(existsSync(path.join(datos, 'fotos', 'fran-seis', 'viajes', 'mar', '01.jpg')));

  eliminarFotografo('fran-seis', true);
  assert.equal(fila('fran-seis'), undefined);
  assert.equal((db.prepare('SELECT count(*) AS n FROM portfolios WHERE idFotografo = ?').get(creado.idFotografo) as { n: number }).n, 0);
  assert.ok(!existsSync(path.join(datos, 'fotos', 'fran-seis')));
  assert.deepEqual(readdirSync(path.join(datos, 'fotos')).filter((d) => d.startsWith('.papelera')), []);
});

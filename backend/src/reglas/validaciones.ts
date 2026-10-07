import { existsSync } from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { fotosDir } from '../config/rutas.js';
import { carpetaOcupada } from '../utils/carpetas.js';
import { esNombreNormalizadoValido, normalizarNombre } from '../utils/normalizar-nombre.js';
import { exigir } from './regla-incumplida.js';

// Comprobaciones de las reglas de negocio (catálogo en catalogo.ts) que necesitan consultar la
// base de datos. Todo lo que escribe en el catálogo (importación, cambio de nombre informal y,
// en el futuro, la edición desde la web) debe pasar por aquí antes de guardar.
//
// Los nombres se comparan en su forma normalizada (normalizarNombre): "Ciudad de noche" y
// "ciudad-de-noche" cuentan como el mismo nombre, porque darían la misma URL y la misma carpeta.
//
// "excluir" es el id del propio elemento cuando se está modificando (para no chocar consigo mismo).

export interface DatosFotografo {
  nombre: string;
  primerApellido: string;
  nombreInformal: string;
}

// Datos de la cuenta (tabla usuarios). usuario solo se indica si viene dado (la importación puede
// fijarlo); si se genera, ya es único.
export interface DatosUsuario {
  usuario?: string;
  email?: string | null;
  contrasenya?: string;
}

// Primeros segmentos de URL que usa la propia aplicación (p. ej. /admin/fotografos/nuevo o
// /gestion/<fotógrafo>/portfolios/nuevo): un fotógrafo no puede tener un nombreInformalNormalizado
// igual, o su página quedaría tapada.
export const SEGMENTOS_RESERVADOS = ['admin', 'api', 'configuracion', 'gestion', 'perfil', 'photos', 'registro'];

// Nombre de usuario elegido al registrarse (se guarda en minúsculas): 3 a 30 caracteres, letras
// sin tildes, números, ".", "_" o "-", empezando por letra o número.
const USUARIO = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export const LONGITUD_MINIMA_CONTRASENYA = 8;

// Comprobación de formato básica (algo@algo.algo, sin espacios); la verificación real sería
// enviar un correo.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LONGITUD_MAXIMA_NOMBRE_FICHERO = 200;

// El título de una foto tiene siempre menos de estos caracteres (la web limita el cuadro de texto a
// LIMITE_TITULO_FOTO - 1).
export const LIMITE_TITULO_FOTO = 20;

// Como los nombres de carpeta (esNombreNormalizadoValido), pero sin normalizar: el nombre de
// fichero de una foto se guarda tal cual lo trae.
const esNombreFicheroValido = (nombre: string) =>
  nombre.trim() === nombre &&
  nombre.length > 0 &&
  nombre.length <= LONGITUD_MAXIMA_NOMBRE_FICHERO &&
  !/[/\\]/.test(nombre) &&
  !nombre.startsWith('.');

// Un orden nuevo es válido si nombra exactamente los elementos actuales, cada uno una vez.
function esOrdenCompleto(actuales: string[], nuevo: string[]): boolean {
  const conjunto = new Set(nuevo);
  return nuevo.length === actuales.length && conjunto.size === nuevo.length && actuales.every((e) => conjunto.has(e));
}

const vacio = (texto: string | null | undefined) => !texto || !texto.trim();

function crearValidador(db: Database.Database) {
  const consultas = {
    fotografoPorNormalizado: db.prepare(
      'SELECT idFotografo, nombreInformal FROM fotografos WHERE nombreInformalNormalizado = ? AND idFotografo IS NOT ?',
    ),
    emailExiste: db.prepare('SELECT 1 FROM usuarios WHERE email = ? AND idUsuario IS NOT ?'),
    usuarioExiste: db.prepare('SELECT 1 FROM usuarios WHERE usuario = ? AND idUsuario IS NOT ?'),
    portfolioNombreExiste: db.prepare(
      'SELECT 1 FROM portfolios WHERE idFotografo = ? AND nombreNormalizado = ? AND idPortfolio IS NOT ?',
    ),
    coleccionNombreExiste: db.prepare(
      'SELECT 1 FROM colecciones WHERE idPortfolio = ? AND nombreNormalizado = ? AND idColeccion IS NOT ?',
    ),
    fotoExiste: db.prepare('SELECT 1 FROM fotos WHERE idColeccion = ? AND nombreFichero = ? AND idFoto IS NOT ?'),
  };
  const existe = (consulta: Database.Statement, ...parametros: unknown[]) => consulta.get(...parametros) !== undefined;

  return {
    // Alta o modificación de una cuenta de usuario (excluir: su idUsuario al modificarla). La
    // contraseña, si se indica, debe tener una longitud mínima.
    usuario(datos: DatosUsuario, excluir: number | null = null): void {
      if (datos.usuario) {
        exigir(USUARIO.test(datos.usuario), 'USUARIO_NO_VALIDO', { usuario: datos.usuario });
        exigir(!existe(consultas.usuarioExiste, datos.usuario, excluir), 'USUARIO_DUPLICADO', { usuario: datos.usuario });
      }
      if (datos.email) {
        exigir(EMAIL.test(datos.email), 'USUARIO_EMAIL_NO_VALIDO', { email: datos.email });
        exigir(!existe(consultas.emailExiste, datos.email, excluir), 'USUARIO_EMAIL_DUPLICADO', { email: datos.email });
      }
      if (datos.contrasenya) {
        exigir(datos.contrasenya.length >= LONGITUD_MINIMA_CONTRASENYA, 'USUARIO_CONTRASENYA_CORTA', {
          minimo: LONGITUD_MINIMA_CONTRASENYA,
        });
      }
    },

    // Alta o modificación de los datos de un fotógrafo (excluir: su idFotografo al modificarlo).
    fotografo(datos: DatosFotografo, excluir: number | null = null): void {
      exigir(!vacio(datos.nombre), 'FOTOGRAFO_NOMBRE_OBLIGATORIO');
      exigir(!vacio(datos.primerApellido), 'FOTOGRAFO_PRIMER_APELLIDO_OBLIGATORIO');
      this.nombreInformal(datos.nombreInformal, excluir);
    },

    // El nombre informal es obligatorio y su forma normalizada debe servir como carpeta, no
    // puede repetirse ni coincidir con un segmento reservado.
    nombreInformal(nombreInformal: string, excluir: number | null = null): void {
      exigir(!vacio(nombreInformal), 'FOTOGRAFO_NOMBRE_INFORMAL_OBLIGATORIO');
      const normalizado = normalizarNombre(nombreInformal);
      exigir(esNombreNormalizadoValido(normalizado), 'NOMBRE_NO_VALIDO', { nombre: nombreInformal });
      const reservado = SEGMENTOS_RESERVADOS.find((s) => s === normalizado);
      exigir(!reservado, 'FOTOGRAFO_NOMBRE_INFORMAL_RESERVADO', { nombreInformal, reservado: reservado ?? '' });
      const otro = consultas.fotografoPorNormalizado.get(normalizado, excluir) as
        | { nombreInformal: string }
        | undefined;
      exigir(!otro, 'FOTOGRAFO_NOMBRE_INFORMAL_DUPLICADO', { nombreInformal, otro: otro?.nombreInformal ?? '' });
    },

    // Alta de un fotógrafo desde la aplicación, con su usuario: además de las reglas generales, su
    // carpeta (fotos/<nombreInformalNormalizado>) no puede existir ya, porque se va a crear.
    altaFotografo(datos: DatosFotografo & DatosUsuario): void {
      this.fotografo(datos);
      this.usuario(datos);
      const carpeta = normalizarNombre(datos.nombreInformal);
      exigir(!existsSync(path.join(fotosDir, carpeta)), 'FOTOGRAFO_CARPETA_OCUPADA', {
        carpeta,
        nombreInformal: datos.nombreInformal,
      });
    },

    // Registro desde la web: como el alta de un fotógrafo, pero el nombre de usuario lo elige la
    // persona (en vez de calcularse) y el correo y la contraseña son obligatorios, porque con ellos
    // se inicia sesión.
    registro(datos: DatosFotografo & DatosUsuario): void {
      exigir(!vacio(datos.usuario), 'USUARIO_OBLIGATORIO');
      exigir(!vacio(datos.email), 'USUARIO_EMAIL_OBLIGATORIO');
      exigir(!vacio(datos.contrasenya), 'USUARIO_CONTRASENYA_OBLIGATORIA');
      this.altaFotografo(datos);
    },

    // Modificación de un fotógrafo existente y de su usuario: las reglas generales (sin chocar
    // consigo mismos) y la carpeta de destino si cambia el nombre informal.
    edicionFotografo(
      ids: { idFotografo: number; idUsuario: number },
      carpetaActual: string,
      datos: DatosFotografo & DatosUsuario,
    ): void {
      this.fotografo(datos, ids.idFotografo);
      this.cambioNombreInformal(ids.idFotografo, carpetaActual, datos.nombreInformal);
      this.usuario(datos, ids.idUsuario);
    },

    // Un fotógrafo con portfolios solo se elimina si se ha confirmado expresamente.
    eliminacionFotografo(numeroPortfolios: number, confirmado: boolean): void {
      exigir(numeroPortfolios === 0 || confirmado, 'FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS');
    },

    // Al cambiar el nombre informal de un fotógrafo existente, su carpeta se renombra: la de
    // destino no puede existir ya.
    cambioNombreInformal(idFotografo: number, carpetaActual: string, nombreInformal: string): void {
      this.nombreInformal(nombreInformal, idFotografo);
      const carpeta = normalizarNombre(nombreInformal);
      if (carpeta !== carpetaActual) {
        exigir(!carpetaOcupada(path.join(fotosDir, carpetaActual), path.join(fotosDir, carpeta)), 'FOTOGRAFO_CARPETA_OCUPADA', {
          carpeta,
          nombreInformal,
        });
      }
    },

    // El nombre de un portfolio es obligatorio y su forma normalizada (que es su carpeta) debe
    // ser válida y única dentro del fotógrafo.
    portfolio(idFotografo: number | bigint, nombre: string, excluir: number | null = null): void {
      exigir(!vacio(nombre), 'PORTFOLIO_NOMBRE_OBLIGATORIO');
      exigir(esNombreNormalizadoValido(normalizarNombre(nombre)), 'NOMBRE_NO_VALIDO', { nombre });
      exigir(
        !existe(consultas.portfolioNombreExiste, idFotografo, normalizarNombre(nombre), excluir),
        'PORTFOLIO_NOMBRE_DUPLICADO',
        { nombre },
      );
    },

    // Alta de un portfolio: además de las reglas generales, su carpeta (dentro de la del fotógrafo,
    // carpetaFotografo) no puede existir ya, porque se va a crear.
    altaPortfolio(idFotografo: number, carpetaFotografo: string, nombre: string): void {
      this.portfolio(idFotografo, nombre);
      const carpeta = normalizarNombre(nombre);
      exigir(!existsSync(path.join(fotosDir, carpetaFotografo, carpeta)), 'PORTFOLIO_CARPETA_OCUPADA', { carpeta, nombre });
    },

    // Un portfolio con colecciones solo se elimina si se ha confirmado expresamente.
    eliminacionPortfolio(numeroColecciones: number, confirmado: boolean): void {
      exigir(numeroColecciones === 0 || confirmado, 'PORTFOLIO_ELIMINAR_CON_COLECCIONES');
    },

    // Al cambiar el nombre de un portfolio su carpeta se renombra: la de destino (dentro de la
    // del fotógrafo, carpetaFotografo) no puede existir ya.
    renombrePortfolio(idFotografo: number, idPortfolio: number, carpetaFotografo: string, carpetaActual: string, nombre: string): void {
      this.portfolio(idFotografo, nombre, idPortfolio);
      const carpeta = normalizarNombre(nombre);
      exigir(
        carpeta === carpetaActual ||
          !carpetaOcupada(path.join(fotosDir, carpetaFotografo, carpetaActual), path.join(fotosDir, carpetaFotografo, carpeta)),
        'PORTFOLIO_CARPETA_OCUPADA',
        { carpeta, nombre },
      );
    },

    // Igual que el portfolio, dentro de su portfolio.
    coleccion(idPortfolio: number | bigint, nombre: string, excluir: number | null = null): void {
      exigir(!vacio(nombre), 'COLECCION_NOMBRE_OBLIGATORIO');
      exigir(esNombreNormalizadoValido(normalizarNombre(nombre)), 'NOMBRE_NO_VALIDO', { nombre });
      exigir(
        !existe(consultas.coleccionNombreExiste, idPortfolio, normalizarNombre(nombre), excluir),
        'COLECCION_NOMBRE_DUPLICADO',
        { nombre },
      );
    },

    // Alta de una colección: además de las reglas generales, su carpeta (dentro de la del portfolio,
    // carpetaPortfolio, relativa a fotos) no puede existir ya, porque se va a crear.
    altaColeccion(idPortfolio: number, carpetaPortfolio: string, nombre: string): void {
      this.coleccion(idPortfolio, nombre);
      const carpeta = normalizarNombre(nombre);
      exigir(!existsSync(path.join(fotosDir, carpetaPortfolio, carpeta)), 'COLECCION_CARPETA_OCUPADA', { carpeta, nombre });
    },

    // Una colección con fotos solo se elimina si se ha confirmado expresamente.
    eliminacionColeccion(numeroFotos: number, confirmado: boolean): void {
      exigir(numeroFotos === 0 || confirmado, 'COLECCION_ELIMINAR_CON_FOTOS');
    },

    // carpetaPortfolio: ruta de la carpeta del portfolio relativa a fotos.
    renombreColeccion(idPortfolio: number, idColeccion: number, carpetaPortfolio: string, carpetaActual: string, nombre: string): void {
      this.coleccion(idPortfolio, nombre, idColeccion);
      const carpeta = normalizarNombre(nombre);
      exigir(
        carpeta === carpetaActual ||
          !carpetaOcupada(path.join(fotosDir, carpetaPortfolio, carpetaActual), path.join(fotosDir, carpetaPortfolio, carpeta)),
        'COLECCION_CARPETA_OCUPADA',
        { carpeta, nombre },
      );
    },

    foto(idColeccion: number | bigint, nombreFichero: string, excluir: number | null = null): void {
      exigir(!existe(consultas.fotoExiste, idColeccion, nombreFichero, excluir), 'FOTO_FICHERO_DUPLICADO', {
        nombreFichero,
      });
    },

    // Foto subida desde la web: además de no repetirse en la colección, su nombre de fichero debe
    // servir como fichero dentro de la carpeta dla colección (carpetaColeccion, relativa a
    // fotos), que tampoco puede tenerlo ya, y debe ser una imagen de un formato admitido.
    // nombreGuardado es el nombre con el que se guarda (en AVIF, ver utils/foto-avif.ts): es el que no
    // puede repetirse en la colección.
    altaFoto(
      idColeccion: number,
      carpetaColeccion: string,
      nombreFichero: string,
      nombreGuardado: string,
      esImagen: boolean,
      maximoMB: number,
    ): void {
      exigir(esNombreFicheroValido(nombreFichero), 'FOTO_NOMBRE_FICHERO_NO_VALIDO', {
        nombreFichero,
        maximo: LONGITUD_MAXIMA_NOMBRE_FICHERO,
      });
      this.foto(idColeccion, nombreGuardado);
      exigir(!existsSync(path.join(fotosDir, carpetaColeccion, nombreGuardado)), 'FOTO_FICHERO_DUPLICADO', {
        nombreFichero: nombreGuardado,
      });
      exigir(esImagen, 'FOTO_FORMATO_NO_VALIDO', { nombreFichero, maximo: maximoMB });
    },

    // El título de una foto (opcional: sin título es null) debe tener menos de LIMITE_TITULO_FOTO
    // caracteres.
    tituloFoto(titulo: string | null | undefined): void {
      if (titulo) {
        exigir(titulo.length < LIMITE_TITULO_FOTO, 'FOTO_TITULO_DEMASIADO_LARGO', {
          titulo,
          longitud: titulo.length,
          limite: LIMITE_TITULO_FOTO,
        });
      }
    },

    // Un nuevo orden de las fotos de una colección nombra todas sus fotos (actuales), cada una una vez.
    ordenFotos(coleccion: string, actuales: string[], nuevo: string[]): void {
      exigir(esOrdenCompleto(actuales, nuevo), 'FOTO_ORDEN_NO_VALIDO', { coleccion });
    },

    // Igual para los portfolios de un fotógrafo (por su nombreNormalizado).
    ordenPortfolios(fotografo: string, actuales: string[], nuevo: string[]): void {
      exigir(esOrdenCompleto(actuales, nuevo), 'PORTFOLIO_ORDEN_NO_VALIDO', { fotografo });
    },

    // Igual para las colecciones de un portfolio (por su nombreNormalizado).
    ordenColecciones(portfolio: string, actuales: string[], nuevo: string[]): void {
      exigir(esOrdenCompleto(actuales, nuevo), 'COLECCION_ORDEN_NO_VALIDO', { portfolio });
    },

    // Una colección no puede repetir un tag.
    tags(coleccion: string, tags: string[]): void {
      tags.forEach((tag, i) => exigir(tags.indexOf(tag) === i, 'COLECCION_TAG_DUPLICADO', { coleccion, tag }));
    },

    // La colección de portada, si se indica (por su nombre o su nombreNormalizado), debe ser una de las
    // colecciones del portfolio (nombresNormalizados).
    coleccionPortada(portfolio: string, coleccionPortada: string | undefined, nombresNormalizados: string[]): void {
      if (coleccionPortada !== undefined) {
        exigir(nombresNormalizados.includes(normalizarNombre(coleccionPortada)), 'PORTFOLIO_COLECCION_PORTADA_INEXISTENTE', {
          coleccionPortada,
          portfolio,
        });
      }
    },

    // La foto de portada, si se indica, debe ser una de las fotos dla colección.
    fotoPortada(coleccion: string, fotoPortada: string | undefined, ficheros: string[]): void {
      if (fotoPortada !== undefined) {
        exigir(ficheros.includes(fotoPortada), 'COLECCION_FOTO_PORTADA_INEXISTENTE', { fotoPortada, coleccion });
      }
    },
  };
}

export type ValidadorCatalogo = ReturnType<typeof crearValidador>;

// Un validador por conexión (las sentencias preparadas pertenecen a su conexión).
const validadores = new WeakMap<Database.Database, ValidadorCatalogo>();

export function validadorCatalogo(db: Database.Database): ValidadorCatalogo {
  let validador = validadores.get(db);
  if (!validador) {
    validador = crearValidador(db);
    validadores.set(db, validador);
  }
  return validador;
}

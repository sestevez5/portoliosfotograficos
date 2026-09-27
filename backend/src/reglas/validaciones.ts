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
  email?: string | null;
  usuario?: string;
}

// Primeros segmentos de URL que usa la propia aplicación (p. ej. /admin/fotografos/nuevo o
// /gestion/<fotógrafo>/portfolios/nuevo): un fotógrafo no puede tener un nombreInformalNormalizado
// igual, o su página quedaría tapada.
export const SEGMENTOS_RESERVADOS = ['admin', 'api', 'gestion', 'photos'];

export const LONGITUD_MINIMA_CONTRASENYA = 8;

// Comprobación de formato básica (algo@algo.algo, sin espacios); la verificación real sería
// enviar un correo.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const vacio = (texto: string | null | undefined) => !texto || !texto.trim();

function crearValidador(db: Database.Database) {
  const consultas = {
    fotografoPorNormalizado: db.prepare(
      'SELECT idFotografo, nombreInformal FROM fotografos WHERE nombreInformalNormalizado = ? AND idFotografo IS NOT ?',
    ),
    emailExiste: db.prepare('SELECT 1 FROM fotografos WHERE email = ? AND idFotografo IS NOT ?'),
    usuarioExiste: db.prepare('SELECT 1 FROM fotografos WHERE usuario = ? AND idFotografo IS NOT ?'),
    portfolioNombreExiste: db.prepare(
      'SELECT 1 FROM portfolios WHERE idFotografo = ? AND nombreNormalizado = ? AND idPortfolio IS NOT ?',
    ),
    albumNombreExiste: db.prepare(
      'SELECT 1 FROM albumes WHERE idPortfolio = ? AND nombreNormalizado = ? AND idAlbum IS NOT ?',
    ),
    fotoExiste: db.prepare('SELECT 1 FROM fotos WHERE idAlbum = ? AND nombreFichero = ? AND idFoto IS NOT ?'),
  };
  const existe = (consulta: Database.Statement, ...parametros: unknown[]) => consulta.get(...parametros) !== undefined;

  return {
    // Alta o modificación de un fotógrafo.
    fotografo(datos: DatosFotografo, excluir: number | null = null): void {
      exigir(!vacio(datos.nombre), 'FOTOGRAFO_NOMBRE_OBLIGATORIO');
      exigir(!vacio(datos.primerApellido), 'FOTOGRAFO_PRIMER_APELLIDO_OBLIGATORIO');
      this.nombreInformal(datos.nombreInformal, excluir);
      if (datos.email) {
        exigir(EMAIL.test(datos.email), 'FOTOGRAFO_EMAIL_NO_VALIDO', { email: datos.email });
        exigir(!existe(consultas.emailExiste, datos.email, excluir), 'FOTOGRAFO_EMAIL_DUPLICADO', { email: datos.email });
      }
      if (datos.usuario) {
        exigir(!existe(consultas.usuarioExiste, datos.usuario, excluir), 'FOTOGRAFO_USUARIO_DUPLICADO', {
          usuario: datos.usuario,
        });
      }
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

    // Alta de un fotógrafo desde la aplicación: además de las reglas generales, su carpeta
    // (datos/fotos/<nombreInformalNormalizado>) no puede existir ya, porque se va a crear, y la
    // contraseña, si se indica, debe tener una longitud mínima.
    altaFotografo(datos: DatosFotografo & { contrasenya?: string }): void {
      this.fotografo(datos);
      const carpeta = normalizarNombre(datos.nombreInformal);
      exigir(!existsSync(path.join(fotosDir, carpeta)), 'FOTOGRAFO_CARPETA_OCUPADA', {
        carpeta,
        nombreInformal: datos.nombreInformal,
      });
      if (datos.contrasenya) {
        exigir(datos.contrasenya.length >= LONGITUD_MINIMA_CONTRASENYA, 'FOTOGRAFO_CONTRASENYA_CORTA', {
          minimo: LONGITUD_MINIMA_CONTRASENYA,
        });
      }
    },

    // Modificación de un fotógrafo existente: las reglas generales (sin chocar consigo mismo), la
    // carpeta de destino si cambia el nombre informal y la contraseña, si se indica una nueva.
    edicionFotografo(
      idFotografo: number,
      carpetaActual: string,
      datos: DatosFotografo & { contrasenya?: string },
    ): void {
      this.fotografo(datos, idFotografo);
      this.cambioNombreInformal(idFotografo, carpetaActual, datos.nombreInformal);
      if (datos.contrasenya) {
        exigir(datos.contrasenya.length >= LONGITUD_MINIMA_CONTRASENYA, 'FOTOGRAFO_CONTRASENYA_CORTA', {
          minimo: LONGITUD_MINIMA_CONTRASENYA,
        });
      }
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

    // Un portfolio con álbumes solo se elimina si se ha confirmado expresamente.
    eliminacionPortfolio(numeroAlbumes: number, confirmado: boolean): void {
      exigir(numeroAlbumes === 0 || confirmado, 'PORTFOLIO_ELIMINAR_CON_ALBUMES');
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
    album(idPortfolio: number | bigint, nombre: string, excluir: number | null = null): void {
      exigir(!vacio(nombre), 'ALBUM_NOMBRE_OBLIGATORIO');
      exigir(esNombreNormalizadoValido(normalizarNombre(nombre)), 'NOMBRE_NO_VALIDO', { nombre });
      exigir(
        !existe(consultas.albumNombreExiste, idPortfolio, normalizarNombre(nombre), excluir),
        'ALBUM_NOMBRE_DUPLICADO',
        { nombre },
      );
    },

    // Alta de un álbum: además de las reglas generales, su carpeta (dentro de la del portfolio,
    // carpetaPortfolio, relativa a datos/fotos) no puede existir ya, porque se va a crear.
    altaAlbum(idPortfolio: number, carpetaPortfolio: string, nombre: string): void {
      this.album(idPortfolio, nombre);
      const carpeta = normalizarNombre(nombre);
      exigir(!existsSync(path.join(fotosDir, carpetaPortfolio, carpeta)), 'ALBUM_CARPETA_OCUPADA', { carpeta, nombre });
    },

    // Un álbum con fotos solo se elimina si se ha confirmado expresamente.
    eliminacionAlbum(numeroFotos: number, confirmado: boolean): void {
      exigir(numeroFotos === 0 || confirmado, 'ALBUM_ELIMINAR_CON_FOTOS');
    },

    // carpetaPortfolio: ruta de la carpeta del portfolio relativa a datos/fotos.
    renombreAlbum(idPortfolio: number, idAlbum: number, carpetaPortfolio: string, carpetaActual: string, nombre: string): void {
      this.album(idPortfolio, nombre, idAlbum);
      const carpeta = normalizarNombre(nombre);
      exigir(
        carpeta === carpetaActual ||
          !carpetaOcupada(path.join(fotosDir, carpetaPortfolio, carpetaActual), path.join(fotosDir, carpetaPortfolio, carpeta)),
        'ALBUM_CARPETA_OCUPADA',
        { carpeta, nombre },
      );
    },

    foto(idAlbum: number | bigint, nombreFichero: string, excluir: number | null = null): void {
      exigir(!existe(consultas.fotoExiste, idAlbum, nombreFichero, excluir), 'FOTO_FICHERO_DUPLICADO', {
        nombreFichero,
      });
    },

    // Un álbum no puede repetir un tag.
    tags(album: string, tags: string[]): void {
      tags.forEach((tag, i) => exigir(tags.indexOf(tag) === i, 'ALBUM_TAG_DUPLICADO', { album, tag }));
    },

    // La foto de portada, si se indica, debe ser una de las fotos del álbum.
    fotoPortada(album: string, fotoPortada: string | undefined, ficheros: string[]): void {
      if (fotoPortada !== undefined) {
        exigir(ficheros.includes(fotoPortada), 'ALBUM_FOTO_PORTADA_INEXISTENTE', { fotoPortada, album });
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

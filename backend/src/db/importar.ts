import { readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { enOperacion, validadorCatalogo } from '../reglas/index.js';
import type { OrganizacionFotos } from '../types/album.js';
import { normalizarNombre } from '../utils/normalizar-nombre.js';
import { generarUsuario } from '../utils/usuario.js';

export function leerOrganizacionJson(ruta: string): OrganizacionFotos[] {
  return JSON.parse(readFileSync(ruta, 'utf-8')) as OrganizacionFotos[];
}

export function estaVacia(db: Database.Database): boolean {
  return (db.prepare('SELECT count(*) AS n FROM fotografos').get() as { n: number }).n === 0;
}

// Vuelca el catálogo en la base de datos en una única transacción: o entra entero o no entra nada.
// Con reemplazar=true borra antes todo el catálogo existente (en cascada).
// Cada elemento se valida contra las reglas de negocio (reglas/) antes de insertarlo; si alguna
// se incumple se lanza ReglaNegocioIncumplida y la transacción se deshace.
export function importarOrganizacion(
  db: Database.Database,
  organizacion: OrganizacionFotos[],
  { reemplazar = false } = {},
) {
  // Cada fotógrafo lleva su usuario (la contraseña no se importa: queda sin contraseña).
  const insertarUsuario = db.prepare('INSERT INTO usuarios (usuario, email) VALUES (@usuario, @email)');
  const insertarFotografo = db.prepare(
    `INSERT INTO fotografos (idUsuario, nombreInformal, nombreInformalNormalizado, nombre, primerApellido,
       segundoApellido, descripcion)
     VALUES (@idUsuario, @nombreInformal, @nombreInformalNormalizado, @nombre, @primerApellido,
       @segundoApellido, @descripcion)`,
  );
  const usuarioExiste = db.prepare('SELECT 1 FROM usuarios WHERE usuario = ?');
  const validar = validadorCatalogo(db);
  const insertarPortfolio = db.prepare(
    `INSERT INTO portfolios (idFotografo, nombreNormalizado, nombre, descripcion, orden)
     VALUES (@idFotografo, @nombreNormalizado, @nombre, @descripcion, @orden)`,
  );
  const insertarAlbum = db.prepare(
    `INSERT INTO albumes (idPortfolio, nombreNormalizado, nombre, descripcion, orden)
     VALUES (@idPortfolio, @nombreNormalizado, @nombre, @descripcion, @orden)`,
  );
  const fijarPortada = db.prepare('UPDATE albumes SET idFotoPortada = ? WHERE idAlbum = ?');
  const insertarTag = db.prepare('INSERT INTO albumTags (idAlbum, tag, orden) VALUES (?, ?, ?)');
  const insertarFoto = db.prepare(
    `INSERT INTO fotos (idAlbum, nombreFichero, titulo, orden, ancho, alto)
     VALUES (@idAlbum, @nombreFichero, @titulo, @orden, @ancho, @alto)`,
  );

  const totales = { fotografos: 0, portfolios: 0, albumes: 0, fotos: 0 };

  db.transaction(() => {
    if (reemplazar) {
      // Borrar los usuarios borra en cascada sus fotógrafos y todo su catálogo. El administrador
      // no es parte del catálogo y se conserva.
      db.prepare("DELETE FROM usuarios WHERE rol <> 'administrador'").run();
    }

    organizacion.forEach(({ fotografo, portfolios }) => {
      const nombreFotografo = fotografo.nombreInformal;
      const idFotografo = enOperacion('CREAR_FOTOGRAFO', { nombreInformal: nombreFotografo }, () => {
        // Se valida antes de generar el usuario (que necesita nombre y primer apellido). Si el
        // usuario viene en el JSON se comprueba que no esté repetido; si se genera, ya es único.
        validar.fotografo(fotografo);
        validar.usuario({ usuario: fotografo.usuario?.toLowerCase(), email: fotografo.email });
        const usuario =
          fotografo.usuario?.toLowerCase() ??
          generarUsuario(fotografo.nombre, fotografo.primerApellido, (u) => usuarioExiste.get(u) !== undefined);
        const idUsuario = insertarUsuario.run({ usuario, email: fotografo.email ?? null }).lastInsertRowid;
        return insertarFotografo.run({
          idUsuario,
          nombreInformal: fotografo.nombreInformal.trim(),
          nombreInformalNormalizado: normalizarNombre(fotografo.nombreInformal),
          nombre: fotografo.nombre,
          primerApellido: fotografo.primerApellido,
          segundoApellido: fotografo.segundoApellido ?? null,
          descripcion: fotografo.descripcion,
        }).lastInsertRowid;
      });
      totales.fotografos++;

      portfolios.forEach((portfolio, j) => {
        const idPortfolio = enOperacion('CREAR_PORTFOLIO', { nombre: portfolio.nombre, fotografo: nombreFotografo }, () => {
          validar.portfolio(idFotografo, portfolio.nombre);
          return insertarPortfolio.run({
            idFotografo,
            nombreNormalizado: normalizarNombre(portfolio.nombre),
            nombre: portfolio.nombre.trim(),
            descripcion: portfolio.descripcion ?? null,
            orden: j,
          }).lastInsertRowid;
        });
        totales.portfolios++;

        portfolio.albumes.forEach((album, k) => {
          const datosAlbum = { nombre: album.nombre, portfolio: portfolio.nombre, fotografo: nombreFotografo };
          const idAlbum = enOperacion('CREAR_ALBUM', datosAlbum, () => {
            validar.album(idPortfolio, album.nombre);
            validar.tags(album.nombre, album.tags);
            validar.fotoPortada(
              album.nombre,
              album.fotoPortada,
              album.fotos.map((foto) => foto.nombreFichero),
            );
            const id = insertarAlbum.run({
              idPortfolio,
              nombreNormalizado: normalizarNombre(album.nombre),
              nombre: album.nombre.trim(),
              descripcion: album.descripcion ?? null,
              orden: k,
            }).lastInsertRowid;
            album.tags.forEach((tag, t) => insertarTag.run(id, tag, t));
            return id;
          });

          album.fotos.forEach((foto) => {
            const datosFoto = { nombreFichero: foto.nombreFichero, album: album.nombre, portfolio: portfolio.nombre };
            enOperacion('ANYADIR_FOTO', datosFoto, () => {
              validar.foto(idAlbum, foto.nombreFichero);
              const idFoto = insertarFoto.run({
                idAlbum,
                nombreFichero: foto.nombreFichero,
                titulo: foto.titulo ?? null,
                orden: foto.orden,
                ancho: foto.ancho ?? null,
                alto: foto.alto ?? null,
              }).lastInsertRowid;
              if (foto.nombreFichero === album.fotoPortada) {
                fijarPortada.run(idFoto, idAlbum);
              }
            });
          });
          totales.albumes++;
          totales.fotos += album.fotos.length;
        });
      });
    });
  })();

  return totales;
}

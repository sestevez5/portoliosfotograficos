import express, { Router, type Request, type Response } from 'express';
import {
  listarAlbumes,
  listarFotografos,
  listarFotos,
  listarPortfolios,
  listarTags,
  obtenerAlbum,
  obtenerFotografo,
  obtenerFotografoEdicion,
  obtenerPortfolio,
  type AlbumFila,
  type AlbumResumenFila,
  type FotografoFila,
  type FotoFila,
  type PortfolioFila,
} from '../db/catalogo.repository.js';
import { crearFotografo, editarFotografo, eliminarFotografo, registrarFotografo } from '../services/fotografo.service.js';
import {
  cerrarSesion,
  COOKIE_SESION,
  crearSesion,
  DURACION_SESION_DIAS,
  iniciarSesion,
  usuarioDeSesion,
} from '../services/sesion.service.js';
import { cambiarContrasenyaAdministrador, completarPrimerUso, esPrimerUso } from '../services/administrador.service.js';
import { crearAlbum, editarAlbum, eliminarAlbum } from '../services/album.service.js';
import { crearPortfolio, editarPortfolio, eliminarPortfolio } from '../services/portfolio.service.js';
import { RecursoNoEncontrado } from '../errores.js';
import { asegurarLogo } from '../services/logo.service.js';
import type {
  AlbumAlta,
  AlbumDetalle,
  AlbumEnCatalogo,
  AlbumResumen,
  FotoApi,
  FotografoAlta,
  FotografoEdicionApi,
  FotografoDetalle,
  FotografoPublico,
  FotografoResumen,
  PortfolioAlta,
  PortfolioDetalle,
  PortfolioResumen,
} from '../types/album.js';

// Los ids y el usuario de la BD son internos y no salen en la API. En las URL el fotógrafo se
// identifica por su nombreInformalNormalizado ("santi-estevez"), el portfolio por su
// nombreNormalizado dentro del fotógrafo y el álbum por el suyo dentro del portfolio (ver
// normalizarNombre). Express entrega los parámetros ya decodificados.

// /photos/<fotógrafo>/<portfolio>/<álbum>/<nombreFichero>, con los nombres normalizados (que son
// los de sus carpetas).
function photoUrl(carpetaFotografo: string, carpetaPortfolio: string, carpetaAlbum: string, nombreFichero: string): string {
  return `/photos/${carpetaFotografo}/${carpetaPortfolio}/${carpetaAlbum}/${nombreFichero}`;
}

// Los campos opcionales se omiten de la respuesta en vez de devolverse como null.
function opcional<K extends string, V>(clave: K, valor: V | null): { [P in K]?: V } {
  return (valor === null ? {} : { [clave]: valor }) as { [P in K]?: V };
}

function noEncontrado(res: Response, message: string): void {
  res.status(404).json({ message });
}

// Todos los fotógrafos tienen logo: si aún no existe se genera al pedirlo (GET /fotografos/:fotografo/logo).
function toFotografoPublico(f: FotografoFila): FotografoPublico {
  return {
    nombreInformal: f.nombreInformal,
    nombreInformalNormalizado: f.nombreInformalNormalizado,
    nombre: f.nombre,
    primerApellido: f.primerApellido,
    ...opcional('segundoApellido', f.segundoApellido),
    descripcion: f.descripcion,
    logoUrl: `/api/fotografos/${f.nombreInformalNormalizado}/logo`,
  };
}

function toAlbumResumen(album: AlbumResumenFila): AlbumResumen {
  return {
    nombre: album.nombre,
    nombreNormalizado: album.nombreNormalizado,
    ...opcional('descripcion', album.descripcion),
    tags: album.tags,
    coverPhotoUrl: album.coverFilename
      ? photoUrl(album.carpetaFotografo, album.carpetaPortfolio, album.nombreNormalizado, album.coverFilename)
      : '',
    photoCount: album.photoCount,
  };
}

function toFoto(album: AlbumFila, foto: FotoFila): FotoApi {
  return {
    nombreFichero: foto.nombreFichero,
    ...opcional('titulo', foto.titulo),
    orden: foto.orden,
    ...opcional('ancho', foto.ancho),
    ...opcional('alto', foto.alto),
    url: photoUrl(album.carpetaFotografo, album.carpetaPortfolio, album.nombreNormalizado, foto.nombreFichero),
  };
}

function toAlbumDetalle(album: AlbumFila): AlbumDetalle {
  return {
    nombre: album.nombre,
    nombreNormalizado: album.nombreNormalizado,
    ...opcional('descripcion', album.descripcion),
    tags: album.tags,
    portfolio: { nombre: album.nombrePortfolio, nombreNormalizado: album.carpetaPortfolio },
    fotos: listarFotos(album.idAlbum).map((foto) => toFoto(album, foto)),
  };
}

function tagDeQuery(tag: unknown): string | undefined {
  return typeof tag === 'string' ? tag : undefined;
}

export const albumsRouter = Router();

albumsRouter.get('/albums', (req, res) => {
  const albumes: AlbumEnCatalogo[] = listarAlbumes({ tag: tagDeQuery(req.query.tag) }).map((album) => ({
    fotografo: album.nombreInformal,
    portfolio: album.nombrePortfolio,
    ...toAlbumResumen(album),
  }));
  res.json(albumes);
});

albumsRouter.get('/tags', (_req, res) => {
  res.json(listarTags().sort());
});

albumsRouter.get('/fotografos', (_req, res) => {
  const fotografos: FotografoResumen[] = listarFotografos().map((f) => ({
    ...toFotografoPublico(f),
    portfolioCount: f.portfolioCount,
    albumCount: f.albumCount,
  }));
  res.json(fotografos);
});

// Campos de texto del cuerpo de un alta o una edición: los obligatorios se tratan como "" si
// faltan (las reglas de negocio dan el aviso) y los opcionales como undefined. Un tipo distinto de
// texto es una petición mal formada (400), no una regla de negocio.
function leerTextos<C extends string>(cuerpo: unknown, campos: readonly C[]): Partial<Record<C, string>> | string {
  if (typeof cuerpo !== 'object' || cuerpo === null) {
    return 'El cuerpo de la petición debe ser un objeto JSON';
  }
  const valores = cuerpo as Record<string, unknown>;
  const textos: Partial<Record<C, string>> = {};
  for (const campo of campos) {
    const valor = valores[campo];
    if (valor !== undefined && valor !== null && typeof valor !== 'string') {
      return `El campo '${campo}' debe ser un texto`;
    }
    if (typeof valor === 'string') {
      textos[campo] = valor;
    }
  }
  return textos;
}

const CAMPOS_ALTA = ['nombreInformal', 'nombre', 'primerApellido', 'segundoApellido', 'email', 'descripcion', 'contrasenya'] as const;

function leerAlta(cuerpo: unknown): FotografoAlta | string {
  const textos = leerTextos(cuerpo, CAMPOS_ALTA);
  if (typeof textos === 'string') {
    return textos;
  }
  return {
    ...textos,
    nombreInformal: textos.nombreInformal ?? '',
    nombre: textos.nombre ?? '',
    primerApellido: textos.primerApellido ?? '',
  };
}

function leerPortfolio(cuerpo: unknown): PortfolioAlta | string {
  const textos = leerTextos(cuerpo, ['nombre', 'descripcion'] as const);
  return typeof textos === 'string' ? textos : { ...textos, nombre: textos.nombre ?? '' };
}

// Como el portfolio, más los tags: una lista de textos (si falta, ninguno).
function leerAlbum(cuerpo: unknown): AlbumAlta | string {
  const textos = leerTextos(cuerpo, ['nombre', 'descripcion'] as const);
  if (typeof textos === 'string') {
    return textos;
  }
  const tags = (cuerpo as Record<string, unknown>).tags;
  if (tags !== undefined && tags !== null && !(Array.isArray(tags) && tags.every((tag) => typeof tag === 'string'))) {
    return "El campo 'tags' debe ser una lista de textos";
  }
  return { ...textos, nombre: textos.nombre ?? '', ...(tags ? { tags } : {}) };
}

// ---------------- Administrador y primer uso ----------------
// El administrador ("admin") es el gestor de la aplicación. Mientras no ha entrado nunca, la
// aplicación está en su primer uso y la web muestra la pantalla de bienvenida. Todavía no hay
// sesiones: cada operación comprueba las credenciales que recibe (422 si no son correctas).

albumsRouter.get('/estado', (_req, res) => {
  res.json({ primerUso: esPrimerUso() });
});

// Primer uso: credenciales del administrador y, opcionalmente, su contraseña nueva.
albumsRouter.post('/admin/primer-uso', express.json({ limit: '5kb' }), (req, res) => {
  const textos = leerTextos(req.body, ['usuario', 'contrasenya', 'contrasenyaNueva'] as const);
  if (typeof textos === 'string') {
    res.status(400).json({ message: textos });
    return;
  }
  // Al completarlo, el administrador queda con la sesión iniciada.
  const idUsuario = completarPrimerUso({ ...textos, usuario: textos.usuario ?? '', contrasenya: textos.contrasenya ?? '' });
  enviarSesion(req, res, crearSesion(idUsuario));
  res.status(204).end();
});

// ---------------- Sesión y registro ----------------
// La sesión va en una cookie HttpOnly (el token; la BD solo guarda su hash, ver
// services/sesion.service.ts). Todavía no se restringe nada según quién la tenga iniciada.

function tokenDeSesion(req: Request): string | undefined {
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const [nombre, ...valor] = parte.trim().split('=');
    if (nombre === COOKIE_SESION) {
      return decodeURIComponent(valor.join('='));
    }
  }
  return undefined;
}

// SameSite=Lax: la cookie viaja entre la web y la API aunque estén en puertos distintos del mismo
// sitio (desarrollo: localhost:4200 y localhost:3000). Secure solo si la petición llega por HTTPS.
function enviarSesion(req: Request, res: Response, token: string): void {
  res.cookie(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    maxAge: DURACION_SESION_DIAS * 24 * 60 * 60 * 1000,
  });
}

// Usuario con la sesión iniciada, o null.
albumsRouter.get('/sesion', (req, res) => {
  res.json({ usuario: usuarioDeSesion(tokenDeSesion(req)) });
});

// Iniciar sesión con el nombre de usuario (o el correo) y la contraseña. 422 si no son correctos.
albumsRouter.post('/sesion', express.json({ limit: '5kb' }), (req, res) => {
  const textos = leerTextos(req.body, ['usuario', 'contrasenya'] as const);
  if (typeof textos === 'string') {
    res.status(400).json({ message: textos });
    return;
  }
  const token = iniciarSesion(textos.usuario ?? '', textos.contrasenya ?? '');
  enviarSesion(req, res, token);
  res.json({ usuario: usuarioDeSesion(token) });
});

albumsRouter.delete('/sesion', (req, res) => {
  cerrarSesion(tokenDeSesion(req));
  res.clearCookie(COOKIE_SESION, { path: '/' });
  res.status(204).end();
});

// Registro de un usuario fotógrafo: sus datos de acceso (usuario, correo y contraseña,
// obligatorios) y los del fotógrafo. Crea también su carpeta y deja la sesión iniciada.
albumsRouter.post('/registro', express.json({ limit: '20kb' }), (req, res) => {
  const alta = leerAlta(req.body);
  const textos = leerTextos(req.body, ['usuario'] as const);
  if (typeof alta === 'string' || typeof textos === 'string') {
    res.status(400).json({ message: typeof alta === 'string' ? alta : textos });
    return;
  }
  const fotografo = registrarFotografo({ ...alta, usuario: textos.usuario ?? '' });
  const token = crearSesion(fotografo.idUsuario);
  enviarSesion(req, res, token);
  res.status(201).json({ usuario: usuarioDeSesion(token) });
});

albumsRouter.put('/admin/contrasenya', express.json({ limit: '5kb' }), (req, res) => {
  const textos = leerTextos(req.body, ['contrasenyaActual', 'contrasenyaNueva'] as const);
  if (typeof textos === 'string') {
    res.status(400).json({ message: textos });
    return;
  }
  cambiarContrasenyaAdministrador({
    contrasenyaActual: textos.contrasenyaActual ?? '',
    contrasenyaNueva: textos.contrasenyaNueva ?? '',
  });
  res.status(204).end();
});

// Alta de un fotógrafo. Crea también su carpeta en datos/fotos. Si se incumple una regla de
// negocio responde 422 (ver gestionar-errores.ts).
albumsRouter.post('/fotografos', express.json({ limit: '20kb' }), (req, res) => {
  const alta = leerAlta(req.body);
  if (typeof alta === 'string') {
    res.status(400).json({ message: alta });
    return;
  }

  const fotografo = crearFotografo(alta);
  res
    .status(201)
    .location(`/api/fotografos/${fotografo.nombreInformalNormalizado}`)
    .json(toFotografoPublico(fotografo));
});

// Datos editables para el formulario de edición (incluye el email).
albumsRouter.get('/fotografos/:fotografo/edicion', (req, res) => {
  const f = obtenerFotografoEdicion(req.params.fotografo);
  if (!f) {
    throw new RecursoNoEncontrado(`Fotógrafo '${req.params.fotografo}' no encontrado`);
  }
  const edicion: FotografoEdicionApi = {
    nombreInformal: f.nombreInformal,
    nombre: f.nombre,
    primerApellido: f.primerApellido,
    ...opcional('segundoApellido', f.segundoApellido),
    ...opcional('email', f.email),
    descripcion: f.descripcion,
    tieneContrasenya: f.tieneContrasenya,
  };
  res.json(edicion);
});

// Modificación de un fotógrafo: mismos campos que el alta (una contraseña vacía conserva la
// actual). Si cambia el nombre informal, su dirección y su carpeta cambian con él.
albumsRouter.put('/fotografos/:fotografo', express.json({ limit: '20kb' }), (req, res) => {
  const cambios = leerAlta(req.body);
  if (typeof cambios === 'string') {
    res.status(400).json({ message: cambios });
    return;
  }
  res.json(toFotografoPublico(editarFotografo(req.params.fotografo, cambios)));
});

// Eliminación de un fotógrafo con todo su contenido. Si tiene portfolios hay que confirmarlo con
// ?confirmar=true; si no, responde 422 con la regla FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS, cuyo
// mensaje es la pregunta que la web muestra al usuario.
albumsRouter.delete('/fotografos/:fotografo', (req, res) => {
  eliminarFotografo(req.params.fotografo, req.query.confirmar === 'true');
  res.status(204).end();
});

albumsRouter.get('/fotografos/:fotografo', (req, res) => {
  const fotografo = obtenerFotografo(req.params.fotografo);
  if (!fotografo) {
    noEncontrado(res, `Fotógrafo '${req.params.fotografo}' no encontrado`);
    return;
  }

  const portfolios: PortfolioResumen[] = listarPortfolios(fotografo.idFotografo).map((p) => ({
    nombre: p.nombre,
    nombreNormalizado: p.nombreNormalizado,
    ...opcional('descripcion', p.descripcion),
    coverPhotoUrl:
      p.coverCarpetaAlbum && p.coverFilename
        ? photoUrl(fotografo.nombreInformalNormalizado, p.nombreNormalizado, p.coverCarpetaAlbum, p.coverFilename)
        : '',
    albumCount: p.albumCount,
  }));

  const detalle: FotografoDetalle = { ...toFotografoPublico(fotografo), portfolios };
  res.json(detalle);
});

albumsRouter.get('/fotografos/:fotografo/logo', (req, res) => {
  const fotografo = obtenerFotografo(req.params.fotografo);
  if (!fotografo) {
    noEncontrado(res, `Fotógrafo '${req.params.fotografo}' no encontrado`);
    return;
  }

  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(asegurarLogo(fotografo));
});

function toPortfolioDetalle(portfolio: PortfolioFila, tag?: string): PortfolioDetalle {
  return {
    nombre: portfolio.nombre,
    nombreNormalizado: portfolio.nombreNormalizado,
    ...opcional('descripcion', portfolio.descripcion),
    albumes: listarAlbumes({ idPortfolio: portfolio.idPortfolio, tag }).map(toAlbumResumen),
  };
}

albumsRouter.get('/fotografos/:fotografo/portfolios/:portfolio', (req, res) => {
  const fotografo = obtenerFotografo(req.params.fotografo);
  const portfolio = fotografo && obtenerPortfolio(fotografo.idFotografo, req.params.portfolio);
  if (!portfolio) {
    noEncontrado(res, `Portfolio '${req.params.portfolio}' no encontrado para '${req.params.fotografo}'`);
    return;
  }

  res.json(toPortfolioDetalle(portfolio, tagDeQuery(req.query.tag)));
});

// Mantenimiento de los portfolios de un fotógrafo. Es cosa del propio fotógrafo, no del
// administrador (cuando haya login, solo el propietario podrá usar estas rutas). Si se incumple
// una regla de negocio responden 422 (ver gestionar-errores.ts).

// Alta de un portfolio (al final de los del fotógrafo). Crea también su carpeta.
albumsRouter.post('/fotografos/:fotografo/portfolios', express.json({ limit: '20kb' }), (req, res) => {
  const alta = leerPortfolio(req.body);
  if (typeof alta === 'string') {
    res.status(400).json({ message: alta });
    return;
  }

  const nombreNormalizado = crearPortfolio(req.params.fotografo, alta);
  const fotografo = obtenerFotografo(req.params.fotografo)!;
  res
    .status(201)
    .location(`/api/fotografos/${fotografo.nombreInformalNormalizado}/portfolios/${nombreNormalizado}`)
    .json(toPortfolioDetalle(obtenerPortfolio(fotografo.idFotografo, nombreNormalizado)!));
});

// Modificación de nombre y descripción. Si cambia el nombre, su dirección y su carpeta cambian con él.
albumsRouter.put('/fotografos/:fotografo/portfolios/:portfolio', express.json({ limit: '20kb' }), (req, res) => {
  const cambios = leerPortfolio(req.body);
  if (typeof cambios === 'string') {
    res.status(400).json({ message: cambios });
    return;
  }

  const { despues } = editarPortfolio(req.params.fotografo, req.params.portfolio, cambios);
  const fotografo = obtenerFotografo(req.params.fotografo)!;
  res.json(toPortfolioDetalle(obtenerPortfolio(fotografo.idFotografo, despues.nombreNormalizado)!));
});

// Eliminación de un portfolio con sus álbumes y fotos. Si tiene álbumes hay que confirmarlo con
// ?confirmar=true; si no, responde 422 con la regla PORTFOLIO_ELIMINAR_CON_ALBUMES, cuyo mensaje
// es la pregunta que la web muestra al usuario.
albumsRouter.delete('/fotografos/:fotografo/portfolios/:portfolio', (req, res) => {
  eliminarPortfolio(req.params.fotografo, req.params.portfolio, req.query.confirmar === 'true');
  res.status(204).end();
});

albumsRouter.get('/fotografos/:fotografo/portfolios/:portfolio/albums/:album', (req, res) => {
  const fotografo = obtenerFotografo(req.params.fotografo);
  const album = fotografo && obtenerAlbum(fotografo.idFotografo, req.params.portfolio, req.params.album);
  if (!album) {
    noEncontrado(
      res,
      `Álbum '${req.params.album}' no encontrado en '${req.params.fotografo}/${req.params.portfolio}'`,
    );
    return;
  }

  res.json(toAlbumDetalle(album));
});

// Mantenimiento de los álbumes de un portfolio, igual que el de los portfolios: es cosa del
// fotógrafo propietario y, si se incumple una regla de negocio, responden 422.

function albumGuardado(fotografo: string, portfolio: string, album: string): AlbumDetalle {
  const f = obtenerFotografo(fotografo)!;
  return toAlbumDetalle(obtenerAlbum(f.idFotografo, portfolio, album)!);
}

// Alta de un álbum (al final de los del portfolio). Crea también su carpeta.
albumsRouter.post('/fotografos/:fotografo/portfolios/:portfolio/albums', express.json({ limit: '20kb' }), (req, res) => {
  const alta = leerAlbum(req.body);
  if (typeof alta === 'string') {
    res.status(400).json({ message: alta });
    return;
  }

  const { fotografo, portfolio } = req.params;
  const nombreNormalizado = crearAlbum(fotografo, portfolio, alta);
  const f = obtenerFotografo(fotografo)!;
  const album = toAlbumDetalle(obtenerAlbum(f.idFotografo, portfolio, nombreNormalizado)!);
  res
    .status(201)
    .location(`/api/fotografos/${f.nombreInformalNormalizado}/portfolios/${album.portfolio.nombreNormalizado}/albums/${nombreNormalizado}`)
    .json(album);
});

// Modificación de nombre, descripción y tags. Si cambia el nombre, su dirección y su carpeta
// cambian con él.
albumsRouter.put('/fotografos/:fotografo/portfolios/:portfolio/albums/:album', express.json({ limit: '20kb' }), (req, res) => {
  const cambios = leerAlbum(req.body);
  if (typeof cambios === 'string') {
    res.status(400).json({ message: cambios });
    return;
  }

  const { fotografo, portfolio, album } = req.params;
  const { despues } = editarAlbum(fotografo, portfolio, album, cambios);
  res.json(albumGuardado(fotografo, portfolio, despues.nombreNormalizado));
});

// Eliminación de un álbum con sus fotos. Si tiene fotos hay que confirmarlo con ?confirmar=true; si
// no, responde 422 con la regla ALBUM_ELIMINAR_CON_FOTOS, cuyo mensaje es la pregunta que la web
// muestra al usuario.
albumsRouter.delete('/fotografos/:fotografo/portfolios/:portfolio/albums/:album', (req, res) => {
  eliminarAlbum(req.params.fotografo, req.params.portfolio, req.params.album, req.query.confirmar === 'true');
  res.status(204).end();
});

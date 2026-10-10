import express, { Router, type Request, type Response } from 'express';
import {
  listarColecciones,
  listarFotografos,
  listarFotos,
  listarPortfolios,
  listarTags,
  obtenerColeccion,
  obtenerFotografo,
  obtenerFotografoEdicion,
  obtenerPortfolio,
  type ColeccionFila,
  type ColeccionResumenFila,
  type FotografoFila,
  type FotoFila,
  type PortfolioFila,
  type Vista,
  VER_TODO,
} from '../db/catalogo.repository.js';
import {
  ficheroFotoPerfil,
  guardarFotoPerfil,
  quitarFotoPerfil,
  TAMANYO_MAXIMO_FOTO_MB,
  urlFotoPerfil,
} from '../services/foto-perfil.service.js';
import { crearFotografo, editarFotografo, eliminarFotografo, registrarFotografo } from '../services/fotografo.service.js';
import {
  cerrarSesion,
  COOKIE_SESION,
  crearSesion,
  guardarPreferencias,
  perfilDeSesion,
  editarCuenta,
  DURACION_SESION_DIAS,
  iniciarSesion,
  usuarioDeSesion,
} from '../services/sesion.service.js';
import { cambiarContrasenyaAdministrador, completarPrimerUso, esPrimerUso } from '../services/administrador.service.js';
import { exigirAdministrador, exigirDuenyoOAdministrador, tokenDeSesion, vistaDe } from './autorizacion.js';
import { cambiarPortada, cambiarVisibilidadColeccion, crearColeccion, editarColeccion, eliminarColeccion, ordenarColecciones } from '../services/coleccion.service.js';
import { anyadirFoto, cambiarTituloFoto, eliminarFoto, ordenarFotos, TAMANYO_MAXIMO_FOTO_MB as TAMANYO_MAXIMO_FOTO_COLECCION_MB } from '../services/foto.service.js';
import { cambiarPortadaPortfolio, cambiarVisibilidadPortfolio, crearPortfolio, editarPortfolio, eliminarPortfolio, ordenarPortfolios } from '../services/portfolio.service.js';
import { AccesoRestringido, RecursoNoEncontrado } from '../errores.js';
import { asegurarLogo } from '../services/logo.service.js';
import { AUTOR, COLABORADORES, FECHA_VERSION_APLICACION, VERSION_APLICACION } from '../config/version.js';
import { FECHA_ESQUEMA, VERSION_ESQUEMA } from '../db/conexion.js';
import { resumirMetadatos } from '../utils/metadatos-foto.js';
import type {
  AcercaDe,
  ColeccionAlta,
  ColeccionDetalle,
  ColeccionEnCatalogo,
  ColeccionResumen,
  FotoApi,
  FotografoAlta,
  FotografoEdicionApi,
  FotografoDetalle,
  FotografoPublico,
  FotografoResumen,
  PortfolioAlta,
  PortfolioDetalle,
  PortfolioResumen,
  Visibilidad,
} from '../types/catalogo.js';

// Los ids y el usuario de la BD son internos y no salen en la API. En las URL el fotógrafo se
// identifica por su nombreInformalNormalizado ("santi-estevez"), el portfolio por su
// nombreNormalizado dentro del fotógrafo y la colección por el suyo dentro del portfolio (ver
// normalizarNombre). Express entrega los parámetros ya decodificados.

// /photos/<fotógrafo>/<portfolio>/<colección>/<nombreFichero>, con los nombres normalizados (que son
// los de sus carpetas). El nombre del fichero se codifica: las fotos subidas desde la web conservan
// el nombre original, que puede llevar espacios, "#", "?"…
function photoUrl(carpetaFotografo: string, carpetaPortfolio: string, carpetaColeccion: string, nombreFichero: string): string {
  return `/photos/${carpetaFotografo}/${carpetaPortfolio}/${carpetaColeccion}/${encodeURIComponent(nombreFichero)}`;
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

function toColeccionResumen(coleccion: ColeccionResumenFila): ColeccionResumen {
  return {
    nombre: coleccion.nombre,
    nombreNormalizado: coleccion.nombreNormalizado,
    ...opcional('descripcion', coleccion.descripcion),
    tags: coleccion.tags,
    coverPhotoUrl: coleccion.coverFilename
      ? photoUrl(coleccion.carpetaFotografo, coleccion.carpetaPortfolio, coleccion.nombreNormalizado, coleccion.coverFilename)
      : '',
    photoCount: coleccion.photoCount,
    visible: coleccion.visibilidad !== 'oculto',
    visibilidad: coleccion.visibilidad,
  };
}

function toFoto(coleccion: ColeccionFila, foto: FotoFila): FotoApi {
  return {
    nombreFichero: foto.nombreFichero,
    ...opcional('titulo', foto.titulo),
    orden: foto.orden,
    ...opcional('ancho', foto.ancho),
    ...opcional('alto', foto.alto),
    url: photoUrl(coleccion.carpetaFotografo, coleccion.carpetaPortfolio, coleccion.nombreNormalizado, foto.nombreFichero),
    ...opcional('metadatos', resumirMetadatos(foto.metadatos) ?? null),
  };
}

function toColeccionDetalle(coleccion: ColeccionFila): ColeccionDetalle {
  const fotos = listarFotos(coleccion.idColeccion);
  const portada = fotos.find((foto) => foto.idFoto === coleccion.idFotoPortada);
  return {
    nombre: coleccion.nombre,
    nombreNormalizado: coleccion.nombreNormalizado,
    ...opcional('descripcion', coleccion.descripcion),
    tags: coleccion.tags,
    portfolio: { nombre: coleccion.nombrePortfolio, nombreNormalizado: coleccion.carpetaPortfolio },
    visible: coleccion.visibilidad !== 'oculto',
    visibilidad: coleccion.visibilidad,
    fotos: fotos.map((foto) => toFoto(coleccion, foto)),
    ...opcional('fotoPortada', portada?.nombreFichero ?? null),
  };
}

function tagDeQuery(tag: unknown): string | undefined {
  return typeof tag === 'string' ? tag : undefined;
}

export const catalogoRouter = Router();

catalogoRouter.get('/colecciones', (req, res) => {
  const colecciones: ColeccionEnCatalogo[] = listarColecciones({ tag: tagDeQuery(req.query.tag) }, vistaDe(req)).map((coleccion) => ({
    fotografo: coleccion.nombreInformal,
    portfolio: coleccion.nombrePortfolio,
    ...toColeccionResumen(coleccion),
  }));
  res.json(colecciones);
});

catalogoRouter.get('/tags', (req, res) => {
  res.json(listarTags(vistaDe(req)).sort());
});

// Los totales de cada fotógrafo cuentan solo lo que ve quien pregunta.
catalogoRouter.get('/fotografos', (req, res) => {
  const fotografos: FotografoResumen[] = listarFotografos(vistaDe(req)).map((f) => ({
    ...toFotografoPublico(f),
    portfolioCount: f.portfolioCount,
    collectionCount: f.collectionCount,
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
function leerColeccion(cuerpo: unknown): ColeccionAlta | string {
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

// Cuerpo de un cambio de visibilidad: { visibilidad: 'visible' | 'bloqueado' | 'oculto' } o, como antes
// de que hubiera tres estados, { visible: true | false } (visible u oculto). null si está mal formado.
const VISIBILIDADES: readonly Visibilidad[] = ['visible', 'bloqueado', 'oculto'];
function leerVisibilidad(cuerpo: unknown): Visibilidad | null {
  const { visibilidad, visible } = (cuerpo ?? {}) as { visibilidad?: unknown; visible?: unknown };
  if (typeof visibilidad === 'string' && (VISIBILIDADES as readonly string[]).includes(visibilidad)) {
    return visibilidad as Visibilidad;
  }
  return typeof visible === 'boolean' ? (visible ? 'visible' : 'oculto') : null;
}
const VISIBILIDAD_NO_VALIDA = "El campo 'visibilidad' debe ser 'visible', 'bloqueado' u 'oculto'";

// Si quien mira (ve, ver vistaDe) puede entrar en lo bloqueado de ese fotógrafo: es suyo o es el
// administrador.
const entraEnLoBloqueado = (ve: Vista, fotografo: string) => ve === VER_TODO || ve === fotografo;

// Cuerpo de un cambio de orden: { orden: [texto, …] }. null si está mal formado.
function leerOrden(cuerpo: unknown): string[] | null {
  const orden = (cuerpo as { orden?: unknown } | undefined)?.orden;
  return Array.isArray(orden) && orden.every((nombre) => typeof nombre === 'string') ? orden : null;
}

// ---------------- Administrador y primer uso ----------------
// El administrador ("admin") es el gestor de la aplicación. Mientras no ha entrado nunca, la
// aplicación está en su primer uso y la web muestra la pantalla de bienvenida. Todavía no hay
// sesiones: cada operación comprueba las credenciales que recibe (422 si no son correctas).

catalogoRouter.get('/estado', (_req, res) => {
  res.json({ primerUso: esPrimerUso() });
});

// "Acerca de" (botón "?" de la franja superior): versión de la aplicación y del esquema de la base de
// datos, cada una con su fecha (AAAA-MM-DD), el autor y los colaboradores. Libre, como el catálogo.
catalogoRouter.get('/acerca-de', (_req, res) => {
  const acercaDe: AcercaDe = {
    aplicacion: { version: VERSION_APLICACION, fecha: FECHA_VERSION_APLICACION },
    baseDatos: { version: VERSION_ESQUEMA, fecha: FECHA_ESQUEMA },
    autor: AUTOR,
    colaboradores: COLABORADORES,
  };
  res.json(acercaDe);
});

// Primer uso: credenciales del administrador y, opcionalmente, su contraseña nueva.
catalogoRouter.post('/admin/primer-uso', express.json({ limit: '5kb' }), (req, res) => {
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
// services/sesion.service.ts). Con ella se comprueban los permisos (ver autorizacion.ts).

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
catalogoRouter.get('/sesion', (req, res) => {
  res.json({ usuario: usuarioDeSesion(tokenDeSesion(req)) });
});

// Iniciar sesión con el nombre de usuario (o el correo) y la contraseña. 422 si no son correctos.
catalogoRouter.post('/sesion', express.json({ limit: '5kb' }), (req, res) => {
  const textos = leerTextos(req.body, ['usuario', 'contrasenya'] as const);
  if (typeof textos === 'string') {
    res.status(400).json({ message: textos });
    return;
  }
  const token = iniciarSesion(textos.usuario ?? '', textos.contrasenya ?? '');
  enviarSesion(req, res, token);
  res.json({ usuario: usuarioDeSesion(token) });
});

catalogoRouter.delete('/sesion', (req, res) => {
  cerrarSesion(tokenDeSesion(req));
  res.clearCookie(COOKIE_SESION, { path: '/' });
  res.status(204).end();
});

// "Mi perfil" del usuario con la sesión iniciada: sus datos como usuario y, si lo es, como
// fotógrafo. 401 sin sesión.
catalogoRouter.get('/perfil', (req, res) => {
  res.json(perfilDeSesion(tokenDeSesion(req)));
});

// El tema que prefiere ('oscuro', 'claro' o null para ninguno). 401 sin sesión. La web ya no lo usa
// (era la página "Configuración", que se quitó): el tema se guarda con "Editar cuenta"
// (PUT /api/perfil/cuenta). Se mantiene por compatibilidad.
catalogoRouter.put('/perfil/preferencias', express.json({ limit: '1kb' }), (req, res) => {
  const tema = (req.body as { temaPreferido?: unknown } | undefined)?.temaPreferido;
  if (tema !== null && tema !== 'oscuro' && tema !== 'claro') {
    res.status(400).json({ message: "El campo 'temaPreferido' debe ser 'oscuro', 'claro' o null" });
    return;
  }
  guardarPreferencias(tokenDeSesion(req), { temaPreferido: tema });
  res.status(204).end();
});

// "Editar cuenta": nombre de usuario, preferencias y, si llega "contrasenya" ({ contrasenyaActual,
// contrasenyaNueva }), la contraseña del usuario de la sesión, todo junto (o todo o nada). Cambiar la
// contraseña cierra sus demás sesiones. 401 sin sesión, 422 si incumple una regla.
catalogoRouter.put('/perfil/cuenta', express.json({ limit: '5kb' }), (req, res) => {
  const cuerpo = req.body as { usuario?: unknown; temaPreferido?: unknown; contrasenya?: unknown } | undefined;
  const tema = cuerpo?.temaPreferido ?? null;
  const contrasenya =
    cuerpo?.contrasenya === undefined || cuerpo.contrasenya === null
      ? undefined
      : leerTextos(cuerpo.contrasenya, ['contrasenyaActual', 'contrasenyaNueva'] as const);
  if (typeof cuerpo?.usuario !== 'string' || (tema !== null && tema !== 'oscuro' && tema !== 'claro') || typeof contrasenya === 'string') {
    res.status(400).json({
      message:
        "Se esperan 'usuario' (texto), 'temaPreferido' ('oscuro', 'claro' o null) y, si se cambia, 'contrasenya' ({ contrasenyaActual, contrasenyaNueva })",
    });
    return;
  }
  editarCuenta(tokenDeSesion(req), {
    usuario: cuerpo.usuario,
    temaPreferido: tema,
    ...(contrasenya && {
      contrasenya: { contrasenyaActual: contrasenya.contrasenyaActual ?? '', contrasenyaNueva: contrasenya.contrasenyaNueva ?? '' },
    }),
  });
  res.status(204).end();
});

// Registro de un usuario fotógrafo: sus datos de acceso (usuario, correo y contraseña,
// obligatorios) y los del fotógrafo. Crea también su carpeta y deja la sesión iniciada.
catalogoRouter.post('/registro', express.json({ limit: '20kb' }), (req, res) => {
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

catalogoRouter.put('/admin/contrasenya', express.json({ limit: '5kb' }), (req, res) => {
  exigirAdministrador(req);
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

// Alta de un fotógrafo. Crea también su carpeta en fotos. Si se incumple una regla de
// negocio responde 422 (ver gestionar-errores.ts).
catalogoRouter.post('/fotografos', express.json({ limit: '20kb' }), (req, res) => {
  exigirAdministrador(req);
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
catalogoRouter.get('/fotografos/:fotografo/edicion', (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
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
    ...opcional('fotoUrl', urlFotoPerfil(f.nombreInformalNormalizado, f.fotoActualizada) ?? null),
  };
  res.json(edicion);
});

// Modificación de un fotógrafo: mismos campos que el alta (una contraseña vacía conserva la
// actual). Si cambia el nombre informal, su dirección y su carpeta cambian con él.
catalogoRouter.put('/fotografos/:fotografo', express.json({ limit: '20kb' }), (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
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
catalogoRouter.delete('/fotografos/:fotografo', (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
  eliminarFotografo(req.params.fotografo, req.query.confirmar === 'true');
  res.status(204).end();
});

catalogoRouter.get('/fotografos/:fotografo', (req, res) => {
  const fotografo = obtenerFotografo(req.params.fotografo);
  if (!fotografo) {
    noEncontrado(res, `Fotógrafo '${req.params.fotografo}' no encontrado`);
    return;
  }

  const portfolios: PortfolioResumen[] = listarPortfolios(fotografo.idFotografo, vistaDe(req)).map((p) => ({
    nombre: p.nombre,
    nombreNormalizado: p.nombreNormalizado,
    ...opcional('descripcion', p.descripcion),
    coverPhotoUrl:
      p.coverCarpetaColeccion && p.coverFilename
        ? photoUrl(fotografo.nombreInformalNormalizado, p.nombreNormalizado, p.coverCarpetaColeccion, p.coverFilename)
        : '',
    collectionCount: p.collectionCount,
    visible: p.visibilidad !== 'oculto',
    visibilidad: p.visibilidad,
  }));

  const detalle: FotografoDetalle = { ...toFotografoPublico(fotografo), portfolios };
  res.json(detalle);
});

catalogoRouter.get('/fotografos/:fotografo/logo', (req, res) => {
  const fotografo = obtenerFotografo(req.params.fotografo);
  if (!fotografo) {
    noEncontrado(res, `Fotógrafo '${req.params.fotografo}' no encontrado`);
    return;
  }

  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(asegurarLogo(fotografo));
});

// Foto de perfil de un fotógrafo (404 si no tiene). Su URL lleva ?v=<fecha de la foto>, así que
// se puede guardar en caché mucho tiempo: al cambiarla, cambia la URL.
catalogoRouter.get('/fotografos/:fotografo/foto', (req, res) => {
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(ficheroFotoPerfil(req.params.fotografo));
});

// Pone o sustituye la foto de perfil: el cuerpo es la imagen JPEG ya recortada en el navegador
// (Content-Type: image/jpeg). Devuelve la URL de la foto nueva. 422 si no es un JPEG válido.
catalogoRouter.put(
  '/fotografos/:fotografo/foto',
  express.raw({ type: 'image/jpeg', limit: `${TAMANYO_MAXIMO_FOTO_MB + 1}mb` }),
  (req, res) => {
    exigirDuenyoOAdministrador(req, req.params.fotografo);
    const datos = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.json({ fotoUrl: guardarFotoPerfil(req.params.fotografo, datos) });
  },
);

catalogoRouter.delete('/fotografos/:fotografo/foto', (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
  quitarFotoPerfil(req.params.fotografo);
  res.status(204).end();
});

// ve: quién mira (sus colecciones ocultas solo las recibe quien puede verlas). Tras una escritura,
// VER_TODO: quien la ha hecho es el dueño o el administrador.
function toPortfolioDetalle(portfolio: PortfolioFila, ve: Vista, tag?: string): PortfolioDetalle {
  return {
    nombre: portfolio.nombre,
    nombreNormalizado: portfolio.nombreNormalizado,
    ...opcional('descripcion', portfolio.descripcion),
    visible: portfolio.visibilidad !== 'oculto',
    visibilidad: portfolio.visibilidad,
    colecciones: listarColecciones({ idPortfolio: portfolio.idPortfolio, tag }, ve).map(toColeccionResumen),
    ...opcional('coleccionPortada', portfolio.coleccionPortada),
  };
}

catalogoRouter.get('/fotografos/:fotografo/portfolios/:portfolio', (req, res) => {
  const fotografo = obtenerFotografo(req.params.fotografo);
  // Un portfolio oculto, para quien no puede verlo, no existe (404); uno bloqueado, existe pero no
  // se puede entrar (403, acceso restringido).
  const ve = vistaDe(req);
  const portfolio = fotografo && obtenerPortfolio(fotografo.idFotografo, req.params.portfolio, ve);
  if (!portfolio) {
    noEncontrado(res, `Portfolio '${req.params.portfolio}' no encontrado para '${req.params.fotografo}'`);
    return;
  }
  if (portfolio.visibilidad === 'bloqueado' && !entraEnLoBloqueado(ve, fotografo.nombreInformalNormalizado)) {
    throw new AccesoRestringido(`El portfolio "${portfolio.nombre}" tiene el acceso restringido.`);
  }

  res.json(toPortfolioDetalle(portfolio, ve, tagDeQuery(req.query.tag)));
});

// Mantenimiento de los portfolios de un fotógrafo. Es cosa del propio fotógrafo, no del
// administrador (cuando haya login, solo el propietario podrá usar estas rutas). Si se incumple
// una regla de negocio responden 422 (ver gestionar-errores.ts).

// Alta de un portfolio (al final de los del fotógrafo). Crea también su carpeta.
catalogoRouter.post('/fotografos/:fotografo/portfolios', express.json({ limit: '20kb' }), (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
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
    .json(toPortfolioDetalle(obtenerPortfolio(fotografo.idFotografo, nombreNormalizado)!, VER_TODO));
});

// Cambia el orden de los portfolios del fotógrafo. Cuerpo: { orden: [nombreNormalizado, …] } con todos
// sus portfolios en el orden en que deben quedar. 204; 422 PORTFOLIO_ORDEN_NO_VALIDO si no son
// exactamente sus portfolios. (No cuelga de /portfolios para no confundirse con un portfolio
// llamado "orden".)
catalogoRouter.put('/fotografos/:fotografo/orden-portfolios', express.json({ limit: '1mb' }), (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
  const orden = leerOrden(req.body);
  if (!orden) {
    res.status(400).json({ message: "El campo 'orden' debe ser una lista de nombres" });
    return;
  }
  ordenarPortfolios(req.params.fotografo, orden);
  res.status(204).end();
});

// Visibilidad del portfolio (con todas sus colecciones) para los demás usuarios. Cuerpo:
// { visibilidad: 'visible' | 'bloqueado' | 'oculto' } (o { visible: true | false }). 204.
catalogoRouter.put('/fotografos/:fotografo/portfolios/:portfolio/visibilidad', express.json({ limit: '1kb' }), (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
  const visibilidad = leerVisibilidad(req.body);
  if (visibilidad === null) {
    res.status(400).json({ message: VISIBILIDAD_NO_VALIDA });
    return;
  }
  cambiarVisibilidadPortfolio(req.params.fotografo, req.params.portfolio, visibilidad);
  res.status(204).end();
});

// Modificación de nombre y descripción. Si cambia el nombre, su dirección y su carpeta cambian con él.
catalogoRouter.put('/fotografos/:fotografo/portfolios/:portfolio', express.json({ limit: '20kb' }), (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
  const cambios = leerPortfolio(req.body);
  if (typeof cambios === 'string') {
    res.status(400).json({ message: cambios });
    return;
  }

  const { despues } = editarPortfolio(req.params.fotografo, req.params.portfolio, cambios);
  const fotografo = obtenerFotografo(req.params.fotografo)!;
  res.json(toPortfolioDetalle(obtenerPortfolio(fotografo.idFotografo, despues.nombreNormalizado)!, VER_TODO));
});

// Eliminación de un portfolio con sus colecciones y fotos. Si tiene colecciones hay que confirmarlo con
// ?confirmar=true; si no, responde 422 con la regla PORTFOLIO_ELIMINAR_CON_COLECCIONES, cuyo mensaje
// es la pregunta que la web muestra al usuario.
catalogoRouter.delete('/fotografos/:fotografo/portfolios/:portfolio', (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
  eliminarPortfolio(req.params.fotografo, req.params.portfolio, req.query.confirmar === 'true');
  res.status(204).end();
});

catalogoRouter.get('/fotografos/:fotografo/portfolios/:portfolio/colecciones/:coleccion', (req, res) => {
  const fotografo = obtenerFotografo(req.params.fotografo);
  // Una colección oculta (o de un portfolio oculto), para quien no puede verla, no existe (404); una
  // bloqueada (o de un portfolio bloqueado), existe pero no se puede entrar (403, acceso restringido).
  const ve = vistaDe(req);
  const coleccion = fotografo && obtenerColeccion(fotografo.idFotografo, req.params.portfolio, req.params.coleccion, ve);
  if (!coleccion) {
    noEncontrado(
      res,
      `Colección '${req.params.coleccion}' no encontrada en '${req.params.fotografo}/${req.params.portfolio}'`,
    );
    return;
  }
  const bloqueada = coleccion.visibilidad === 'bloqueado' || coleccion.portfolioVisibilidad === 'bloqueado';
  if (bloqueada && !entraEnLoBloqueado(ve, fotografo.nombreInformalNormalizado)) {
    throw new AccesoRestringido(`La colección "${coleccion.nombre}" tiene el acceso restringido.`);
  }

  res.json(toColeccionDetalle(coleccion));
});

// Mantenimiento de las colecciones de un portfolio, igual que el de los portfolios: es cosa del
// fotógrafo propietario y, si se incumple una regla de negocio, responden 422.

function coleccionGuardada(fotografo: string, portfolio: string, coleccion: string): ColeccionDetalle {
  const f = obtenerFotografo(fotografo)!;
  return toColeccionDetalle(obtenerColeccion(f.idFotografo, portfolio, coleccion)!);
}

// Alta de una colección (al final de los del portfolio). Crea también su carpeta.
catalogoRouter.post('/fotografos/:fotografo/portfolios/:portfolio/colecciones', express.json({ limit: '20kb' }), (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
  const alta = leerColeccion(req.body);
  if (typeof alta === 'string') {
    res.status(400).json({ message: alta });
    return;
  }

  const { fotografo, portfolio } = req.params;
  const nombreNormalizado = crearColeccion(fotografo, portfolio, alta);
  const f = obtenerFotografo(fotografo)!;
  const coleccion = toColeccionDetalle(obtenerColeccion(f.idFotografo, portfolio, nombreNormalizado)!);
  res
    .status(201)
    .location(`/api/fotografos/${f.nombreInformalNormalizado}/portfolios/${coleccion.portfolio.nombreNormalizado}/colecciones/${nombreNormalizado}`)
    .json(coleccion);
});

// Cambia el orden de las colecciones del portfolio. Cuerpo: { orden: [nombreNormalizado, …] } con todas
// sus colecciones en el orden en que deben quedar. 204; 422 COLECCION_ORDEN_NO_VALIDO si no son
// exactamente sus colecciones. (No cuelga de /colecciones para no confundirse con una colección
// llamada "orden".)
catalogoRouter.put('/fotografos/:fotografo/portfolios/:portfolio/orden-colecciones', express.json({ limit: '1mb' }), (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
  const orden = leerOrden(req.body);
  if (!orden) {
    res.status(400).json({ message: "El campo 'orden' debe ser una lista de nombres" });
    return;
  }
  ordenarColecciones(req.params.fotografo, req.params.portfolio, orden);
  res.status(204).end();
});

// Elige la colección cuya portada es la del portfolio. Cuerpo: { coleccionPortada: nombreNormalizado }
// o { coleccionPortada: null } para no tener ninguna elegida (la portada es entonces la de la primera
// colección). 204; 422 PORTFOLIO_COLECCION_PORTADA_INEXISTENTE si no es una de sus colecciones.
catalogoRouter.put('/fotografos/:fotografo/portfolios/:portfolio/portada', express.json({ limit: '5kb' }), (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
  const coleccionPortada = (req.body as { coleccionPortada?: unknown } | undefined)?.coleccionPortada;
  if (coleccionPortada !== null && typeof coleccionPortada !== 'string') {
    res.status(400).json({ message: "El campo 'coleccionPortada' debe ser el nombre de una colección o null" });
    return;
  }
  cambiarPortadaPortfolio(req.params.fotografo, req.params.portfolio, coleccionPortada);
  res.status(204).end();
});

// Modificación de nombre, descripción y tags. Si cambia el nombre, su dirección y su carpeta
// cambian con él.
catalogoRouter.put('/fotografos/:fotografo/portfolios/:portfolio/colecciones/:coleccion', express.json({ limit: '20kb' }), (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
  const cambios = leerColeccion(req.body);
  if (typeof cambios === 'string') {
    res.status(400).json({ message: cambios });
    return;
  }

  const { fotografo, portfolio, coleccion } = req.params;
  const { despues } = editarColeccion(fotografo, portfolio, coleccion, cambios);
  res.json(coleccionGuardada(fotografo, portfolio, despues.nombreNormalizado));
});

// Eliminación de una colección con sus fotos. Si tiene fotos hay que confirmarlo con ?confirmar=true; si
// no, responde 422 con la regla COLECCION_ELIMINAR_CON_FOTOS, cuyo mensaje es la pregunta que la web
// muestra al usuario.
catalogoRouter.delete('/fotografos/:fotografo/portfolios/:portfolio/colecciones/:coleccion', (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
  eliminarColeccion(req.params.fotografo, req.params.portfolio, req.params.coleccion, req.query.confirmar === 'true');
  res.status(204).end();
});

// ---------------- Fotos de una colección ("Gestionar fotos") ----------------
// También las mantiene el fotógrafo propietario. Una petición por foto: el cuerpo es la imagen tal
// cual (Content-Type: image/jpeg, image/png o image/webp; el formato se comprueba por su contenido)
// y el nombre del fichero va en ?nombreFichero=. Se guarda convertida a AVIF (Playa.jpg -> Playa.avif),
// al final de las dla colección, y responde 201 con la foto; 422 si incumple una regla (nombre no válido o repetido, no es una imagen…).
catalogoRouter.post(
  '/fotografos/:fotografo/portfolios/:portfolio/colecciones/:coleccion/fotos',
  express.raw({ type: 'image/*', limit: `${TAMANYO_MAXIMO_FOTO_COLECCION_MB + 1}mb` }),
  // Asíncrona (la foto se convierte a AVIF): express 4 no recoge los errores de una promesa, así que
  // se pasan a gestionarErrores con next.
  async (req, res, next) => {
    try {
      exigirDuenyoOAdministrador(req, req.params.fotografo);
      const nombreFichero = req.query.nombreFichero;
      if (typeof nombreFichero !== 'string') {
        res.status(400).json({ message: "Falta el parámetro 'nombreFichero'" });
        return;
      }

      const { fotografo, portfolio, coleccion } = req.params;
      const datos = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const foto = await anyadirFoto(fotografo, portfolio, coleccion, nombreFichero, datos);
      const f = obtenerFotografo(fotografo)!;
      res.status(201).json(toFoto(obtenerColeccion(f.idFotografo, portfolio, coleccion)!, foto));
    } catch (error) {
      next(error);
    }
  },
);

// Cambia el orden de las fotos dla colección. Cuerpo: { orden: [nombreFichero, …] } con todas sus fotos
// en el orden en que deben quedar. 204; 422 FOTO_ORDEN_NO_VALIDO si no son exactamente sus fotos.
catalogoRouter.put(
  '/fotografos/:fotografo/portfolios/:portfolio/colecciones/:coleccion/fotos/orden',
  express.json({ limit: '1mb' }),
  (req, res) => {
    exigirDuenyoOAdministrador(req, req.params.fotografo);
    const orden = leerOrden(req.body);
    if (!orden) {
      res.status(400).json({ message: "El campo 'orden' debe ser una lista de nombres de fichero" });
      return;
    }
    ordenarFotos(req.params.fotografo, req.params.portfolio, req.params.coleccion, orden);
    res.status(204).end();
  },
);

// Visibilidad de la colección para los demás usuarios. Cuerpo: { visibilidad: 'visible' | 'bloqueado'
// | 'oculto' } (o { visible: true | false }). 204.
catalogoRouter.put(
  '/fotografos/:fotografo/portfolios/:portfolio/colecciones/:coleccion/visibilidad',
  express.json({ limit: '1kb' }),
  (req, res) => {
    exigirDuenyoOAdministrador(req, req.params.fotografo);
    const visibilidad = leerVisibilidad(req.body);
    if (visibilidad === null) {
      res.status(400).json({ message: VISIBILIDAD_NO_VALIDA });
      return;
    }
    cambiarVisibilidadColeccion(req.params.fotografo, req.params.portfolio, req.params.coleccion, visibilidad);
    res.status(204).end();
  },
);

// Elige la foto de portada dla colección. Cuerpo: { fotoPortada: nombreFichero } o { fotoPortada: null }
// para no tener ninguna elegida (la portada es entonces la primera foto). 204; 422
// COLECCION_FOTO_PORTADA_INEXISTENTE si no es una de sus fotos.
catalogoRouter.put(
  '/fotografos/:fotografo/portfolios/:portfolio/colecciones/:coleccion/portada',
  express.json({ limit: '5kb' }),
  (req, res) => {
    exigirDuenyoOAdministrador(req, req.params.fotografo);
    const fotoPortada = (req.body as { fotoPortada?: unknown } | undefined)?.fotoPortada;
    if (fotoPortada !== null && typeof fotoPortada !== 'string') {
      res.status(400).json({ message: "El campo 'fotoPortada' debe ser un nombre de fichero o null" });
      return;
    }
    cambiarPortada(req.params.fotografo, req.params.portfolio, req.params.coleccion, fotoPortada);
    res.status(204).end();
  },
);

// Cambia el título de una foto. Cuerpo: { titulo: texto } o { titulo: null } para dejarla sin título
// (también un texto vacío o "Sin título"). Responde con la foto; 422 FOTO_TITULO_DEMASIADO_LARGO.
// Cuelga de la foto (…/fotos/:nombreFichero/titulo) para no confundirse con …/fotos/orden.
catalogoRouter.put(
  '/fotografos/:fotografo/portfolios/:portfolio/colecciones/:coleccion/fotos/:nombreFichero/titulo',
  express.json({ limit: '5kb' }),
  (req, res) => {
    exigirDuenyoOAdministrador(req, req.params.fotografo);
    const titulo = (req.body as { titulo?: unknown } | undefined)?.titulo;
    if (titulo !== null && typeof titulo !== 'string') {
      res.status(400).json({ message: "El campo 'titulo' debe ser un texto o null" });
      return;
    }
    const { fotografo, portfolio, coleccion, nombreFichero } = req.params;
    const foto = cambiarTituloFoto(fotografo, portfolio, coleccion, nombreFichero, titulo);
    const f = obtenerFotografo(fotografo)!;
    res.json(toFoto(obtenerColeccion(f.idFotografo, portfolio, coleccion)!, foto));
  },
);

// Elimina una foto dla colección (su registro y su fichero). 204.
catalogoRouter.delete('/fotografos/:fotografo/portfolios/:portfolio/colecciones/:coleccion/fotos/:nombreFichero', (req, res) => {
  exigirDuenyoOAdministrador(req, req.params.fotografo);
  const { fotografo, portfolio, coleccion, nombreFichero } = req.params;
  eliminarFoto(fotografo, portfolio, coleccion, nombreFichero);
  res.status(204).end();
});

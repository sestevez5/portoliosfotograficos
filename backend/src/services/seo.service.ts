import {
  listarColecciones,
  listarFotos,
  listarPaginasPublicas,
  listarPortfolios,
  obtenerColeccion,
  obtenerFotografo,
  obtenerFotografoEdicion,
  obtenerPortfolio,
  VER_TODO,
  type FotografoFila,
  type FotoFila,
  type Vista,
} from '../db/catalogo.repository.js';
import { SEGMENTOS_RESERVADOS } from '../reglas/validaciones.js';
import { resumirMetadatos } from '../utils/metadatos-foto.js';
import { normalizarNombre } from '../utils/normalizar-nombre.js';
import { photoUrl } from '../utils/url-foto.js';
import { urlFotoPerfil } from './foto-perfil.service.js';
import { urlPublica } from './recuperacion.service.js';

// Posicionamiento en buscadores (SEO) y vistas previas de los enlaces compartidos.
//
// La web es una aplicación Angular: sin ejecutar JavaScript, todas sus páginas son el mismo
// index.html vacío. Los buscadores (salvo Google, y no siempre) y las redes sociales (WhatsApp,
// Facebook, LinkedIn…) no lo ejecutan, así que el backend sirve el index.html de cada página del
// catálogo con su <head> ya relleno (describirPagina + insertarEnPlantilla, ver routes/seo.routes.ts):
// título, descripción, URL canónica, Open Graph, si se puede indexar y los datos estructurados
// (JSON-LD de schema.org). Y con el código de estado real: 404 si no existe, 403 si está bloqueado.
// Además genera robots.txt y sitemap.xml.
//
// Lo oculto y lo bloqueado nunca sale en nada de esto para quien no puede verlo (las consultas reciben
// quién mira, igual que la API), y la ubicación GPS de las fotos, nunca.

export const NOMBRE_SITIO = 'Portfolios fotográficos';
const DESCRIPCION_SITIO = 'Portfolios y colecciones de fotografía de autor.';
// Los títulos y las descripciones son los mismos que pone la web al navegar (frontend: core/services/seo.ts):
// si cambian aquí, hay que cambiarlos también allí.
//
// Lo que cabe en un resultado de Google sin que lo recorte.
const LONGITUD_DESCRIPCION = 160;
// Un sitemap admite hasta 1.000 imágenes por página; el JSON-LD de una colección, las mismas.
const MAXIMO_IMAGENES = 1000;

export interface PaginaSeo {
  estado: 200 | 403 | 404;
  titulo: string;
  descripcion: string;
  // URL absoluta y canónica (con los nombres normalizados y sin ?limpia=true). Sin ella, la página
  // no debe indexarse.
  canonica?: string;
  // og:image: URL absoluta de un JPEG (las redes sociales no admiten AVIF).
  imagen?: string;
  tipo: 'website' | 'profile';
  indexable: boolean;
  datosEstructurados: object[];
}

const absoluta = (ruta: string) => urlPublica() + ruta;

// Para og:image: la versión JPEG de la foto (?compartir, ver services/miniatura.service.ts).
const paraCompartir = (urlFoto: string) => `${absoluta(urlFoto)}?compartir`;

function nombreCompleto(f: FotografoFila): string {
  return [f.nombre, f.primerApellido, f.segundoApellido].filter(Boolean).join(' ');
}

// Sin saltos de línea ni espacios repetidos, y recortada (por una palabra) si no cabe.
export function recortarDescripcion(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= LONGITUD_DESCRIPCION) {
    return limpio;
  }
  const corte = limpio.slice(0, LONGITUD_DESCRIPCION - 1);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > LONGITUD_DESCRIPCION / 2 ? corte.slice(0, espacio) : corte).replace(/[\s.,;:]+$/, '')}…`;
}

function persona(f: FotografoFila): object {
  return {
    '@type': 'Person',
    name: f.nombreInformal,
    url: absoluta(`/${f.nombreInformalNormalizado}`),
  };
}

function migas(elementos: { nombre: string; ruta: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: elementos.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: e.nombre,
      item: absoluta(e.ruta),
    })),
  };
}

function noEncontrada(): PaginaSeo {
  return {
    estado: 404,
    titulo: `Página no encontrada · ${NOMBRE_SITIO}`,
    descripcion: DESCRIPCION_SITIO,
    tipo: 'website',
    indexable: false,
    datosEstructurados: [],
  };
}

function restringida(titulo: string): PaginaSeo {
  return {
    estado: 403,
    titulo,
    descripcion: 'Acceso restringido.',
    tipo: 'website',
    indexable: false,
    datosEstructurados: [],
  };
}

// Páginas de la aplicación que no son del catálogo (formularios, gestión, "Mi perfil"…): existen,
// pero no tienen nada que indexar.
function paginaPrivada(): PaginaSeo {
  return { estado: 200, titulo: NOMBRE_SITIO, descripcion: DESCRIPCION_SITIO, tipo: 'website', indexable: false, datosEstructurados: [] };
}

function portada(): PaginaSeo {
  const url = absoluta('/');
  return {
    estado: 200,
    titulo: NOMBRE_SITIO,
    descripcion: DESCRIPCION_SITIO,
    canonica: url,
    tipo: 'website',
    indexable: true,
    datosEstructurados: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: NOMBRE_SITIO, url, inLanguage: 'es' },
    ],
  };
}

const entraEnLoBloqueado = (ve: Vista, f: FotografoFila) => ve === VER_TODO || ve === f.nombreInformalNormalizado;

function paginaFotografo(f: FotografoFila, ve: Vista): PaginaSeo {
  const ruta = `/${f.nombreInformalNormalizado}`;
  const portfolios = listarPortfolios(f.idFotografo, ve);
  const conPortada = portfolios.find((p) => p.visibilidad === 'visible' && p.coverCarpetaColeccion && p.coverFilename);
  const fotoPerfil = urlFotoPerfil(f.nombreInformalNormalizado, obtenerFotografoEdicion(f.nombreInformalNormalizado)?.fotoActualizada ?? null);
  const imagen = conPortada
    ? paraCompartir(photoUrl(f.nombreInformalNormalizado, conPortada.nombreNormalizado, conPortada.coverCarpetaColeccion!, conPortada.coverFilename!))
    : fotoPerfil && absoluta(fotoPerfil);

  return {
    estado: 200,
    titulo: `${f.nombreInformal} · ${NOMBRE_SITIO}`,
    descripcion: recortarDescripcion(f.descripcion || `Portfolios fotográficos de ${nombreCompleto(f)}.`),
    canonica: absoluta(ruta),
    ...(imagen ? { imagen } : {}),
    tipo: 'profile',
    indexable: true,
    datosEstructurados: [
      {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        url: absoluta(ruta),
        mainEntity: {
          ...persona(f),
          ...(nombreCompleto(f) !== f.nombreInformal ? { alternateName: nombreCompleto(f) } : {}),
          ...(f.descripcion ? { description: f.descripcion } : {}),
          ...(fotoPerfil ? { image: absoluta(fotoPerfil) } : {}),
          jobTitle: 'Fotógrafo',
        },
      },
    ],
  };
}

function paginaPortfolio(f: FotografoFila, segmento: string, ve: Vista): PaginaSeo {
  const p = obtenerPortfolio(f.idFotografo, segmento, ve);
  if (!p) {
    return noEncontrada();
  }
  const titulo = `${p.nombre} · ${f.nombreInformal}`;
  if (p.visibilidad === 'bloqueado' && !entraEnLoBloqueado(ve, f)) {
    return restringida(titulo);
  }
  const ruta = `/${f.nombreInformalNormalizado}/${p.nombreNormalizado}`;
  const resumen = listarPortfolios(f.idFotografo, ve).find((r) => r.idPortfolio === p.idPortfolio);
  const imagen =
    resumen?.coverCarpetaColeccion && resumen.coverFilename
      ? paraCompartir(photoUrl(f.nombreInformalNormalizado, p.nombreNormalizado, resumen.coverCarpetaColeccion, resumen.coverFilename))
      : undefined;
  const colecciones = listarColecciones({ idPortfolio: p.idPortfolio }, ve).filter((a) => a.visibilidad === 'visible');

  return {
    estado: 200,
    titulo,
    descripcion: recortarDescripcion(p.descripcion || `Portfolio «${p.nombre}» de ${f.nombreInformal}.`),
    canonica: absoluta(ruta),
    ...(imagen ? { imagen } : {}),
    tipo: 'website',
    indexable: p.visibilidad === 'visible',
    datosEstructurados: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: p.nombre,
        ...(p.descripcion ? { description: p.descripcion } : {}),
        url: absoluta(ruta),
        inLanguage: 'es',
        author: persona(f),
        ...(imagen ? { image: imagen } : {}),
        hasPart: colecciones.map((a) => ({
          '@type': 'ImageGallery',
          name: a.nombre,
          url: absoluta(`${ruta}/${a.nombreNormalizado}`),
        })),
      },
      migas([
        { nombre: f.nombreInformal, ruta: `/${f.nombreInformalNormalizado}` },
        { nombre: p.nombre, ruta },
      ]),
    ],
  };
}

// La foto como ImageObject de schema.org, con lo que Google Imágenes necesita para mostrar el autor y
// la licencia: creator, creditText, copyrightNotice y acquireLicensePage. Si su EXIF no lo dice, el
// autor y el titular de los derechos son su fotógrafo.
function imagenSchema(f: FotografoFila, urlFoto: string, foto: FotoFila): object {
  const metadatos = resumirMetadatos(foto.metadatos);
  const autor = metadatos?.autor || nombreCompleto(f);
  return {
    '@type': 'ImageObject',
    contentUrl: absoluta(urlFoto),
    thumbnailUrl: `${absoluta(urlFoto)}?ancho=960`,
    ...(foto.titulo ? { name: foto.titulo } : {}),
    ...(foto.ancho && foto.alto ? { width: foto.ancho, height: foto.alto } : {}),
    creator: { '@type': 'Person', name: autor },
    creditText: autor,
    copyrightNotice: metadatos?.copyright || `© ${nombreCompleto(f)}`,
    ...(metadatos?.fechaToma ? { dateCreated: metadatos.fechaToma } : {}),
    acquireLicensePage: absoluta(`/${f.nombreInformalNormalizado}`),
  };
}

function paginaColeccion(f: FotografoFila, portfolio: string, coleccion: string, ve: Vista): PaginaSeo {
  const a = obtenerColeccion(f.idFotografo, portfolio, coleccion, ve);
  if (!a) {
    return noEncontrada();
  }
  const titulo = `${a.nombre} · ${a.nombrePortfolio} · ${f.nombreInformal}`;
  const bloqueada = a.visibilidad === 'bloqueado' || a.portfolioVisibilidad === 'bloqueado';
  if (bloqueada && !entraEnLoBloqueado(ve, f)) {
    return restringida(titulo);
  }
  const rutaPortfolio = `/${f.nombreInformalNormalizado}/${a.carpetaPortfolio}`;
  const ruta = `${rutaPortfolio}/${a.nombreNormalizado}`;
  const fotos = listarFotos(a.idColeccion);
  const url = (foto: FotoFila) => photoUrl(f.nombreInformalNormalizado, a.carpetaPortfolio, a.nombreNormalizado, foto.nombreFichero);
  const fotoPortada = fotos.find((foto) => foto.idFoto === a.idFotoPortada) ?? fotos[0];
  const numero = `${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}`;

  return {
    estado: 200,
    titulo,
    descripcion: recortarDescripcion(
      a.descripcion || `Colección «${a.nombre}» del portfolio «${a.nombrePortfolio}» de ${f.nombreInformal}: ${numero}.`,
    ),
    canonica: absoluta(ruta),
    ...(fotoPortada ? { imagen: paraCompartir(url(fotoPortada)) } : {}),
    tipo: 'website',
    indexable: a.visibilidad === 'visible' && a.portfolioVisibilidad === 'visible',
    datosEstructurados: [
      {
        '@context': 'https://schema.org',
        '@type': 'ImageGallery',
        name: a.nombre,
        ...(a.descripcion ? { description: a.descripcion } : {}),
        url: absoluta(ruta),
        inLanguage: 'es',
        author: persona(f),
        ...(a.tags.length > 0 ? { keywords: a.tags.join(', ') } : {}),
        image: fotos.slice(0, MAXIMO_IMAGENES).map((foto) => imagenSchema(f, url(foto), foto)),
      },
      migas([
        { nombre: f.nombreInformal, ruta: `/${f.nombreInformalNormalizado}` },
        { nombre: a.nombrePortfolio, ruta: rutaPortfolio },
        { nombre: a.nombre, ruta },
      ]),
    ],
  };
}

// Qué hay en una ruta de la web ("/marta-vidal/encargos/montanya", sin la consulta) para quien mira.
export function describirPagina(ruta: string, ve: Vista): PaginaSeo {
  let segmentos: string[];
  try {
    segmentos = ruta.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  } catch {
    return noEncontrada();
  }
  if (segmentos.length === 0) {
    return portada();
  }
  if (SEGMENTOS_RESERVADOS.includes(normalizarNombre(segmentos[0]))) {
    return paginaPrivada();
  }
  if (segmentos.length > 3) {
    return noEncontrada();
  }
  const f = obtenerFotografo(segmentos[0]);
  if (!f) {
    return noEncontrada();
  }
  if (segmentos.length === 1) {
    return paginaFotografo(f, ve);
  }
  if (segmentos.length === 2) {
    return paginaPortfolio(f, segmentos[1], ve);
  }
  return paginaColeccion(f, segmentos[1], segmentos[2], ve);
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON dentro de <script>: sin "<", para que un texto con "</script>" no cierre la etiqueta.
function jsonEnScript(datos: unknown): string {
  return JSON.stringify(datos).replace(/</g, '\\u003c');
}

// Las etiquetas del <head> de una página. Los nombres (name/property) son los que actualiza después
// la web al navegar (core/services/seo.ts).
export function cabeceraHtml(pagina: PaginaSeo): string {
  const meta = (atributo: 'name' | 'property', clave: string, valor: string) =>
    `<meta ${atributo}="${clave}" content="${escaparHtml(valor)}">`;
  const lineas = [
    `<title>${escaparHtml(pagina.titulo)}</title>`,
    meta('name', 'description', pagina.descripcion),
  ];
  if (!pagina.indexable) {
    lineas.push(meta('name', 'robots', 'noindex'));
  }
  if (pagina.canonica) {
    lineas.push(`<link rel="canonical" href="${escaparHtml(pagina.canonica)}">`);
  }
  lineas.push(
    meta('property', 'og:site_name', NOMBRE_SITIO),
    meta('property', 'og:locale', 'es_ES'),
    meta('property', 'og:type', pagina.tipo),
    meta('property', 'og:title', pagina.titulo),
    meta('property', 'og:description', pagina.descripcion),
  );
  if (pagina.canonica) {
    lineas.push(meta('property', 'og:url', pagina.canonica));
  }
  if (pagina.imagen) {
    lineas.push(meta('property', 'og:image', pagina.imagen));
  }
  lineas.push(meta('name', 'twitter:card', pagina.imagen ? 'summary_large_image' : 'summary'));
  if (pagina.datosEstructurados.length > 0) {
    const datos = pagina.datosEstructurados.length === 1 ? pagina.datosEstructurados[0] : pagina.datosEstructurados;
    lineas.push(`<script type="application/ld+json" id="datos-estructurados">${jsonEnScript(datos)}</script>`);
  }
  return lineas.join('\n  ');
}

// El index.html de la web con la cabecera de la página. Sustituye lo que hay entre <!-- seo --> y
// <!-- /seo --> (el título y la descripción genéricos de frontend/src/index.html) o, si no están
// esas marcas, el <title>.
export function insertarEnPlantilla(plantilla: string, pagina: PaginaSeo): string {
  const cabecera = cabeceraHtml(pagina);
  const marcas = /<!--\s*seo\s*-->[\s\S]*?<!--\s*\/seo\s*-->/;
  if (marcas.test(plantilla)) {
    return plantilla.replace(marcas, () => cabecera);
  }
  const sinTitulo = plantilla.replace(/<title>[\s\S]*?<\/title>/, '');
  return sinTitulo.replace('</head>', () => `  ${cabecera}\n</head>`);
}

function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const masReciente = (...fechas: (string | null | undefined)[]) =>
  fechas.filter((f): f is string => !!f).sort().at(-1);

// sitemap.xml: la portada, los fotógrafos y los portfolios y colecciones que cualquiera puede ver y en
// los que puede entrar (nada oculto ni bloqueado), con la fecha de su última modificación, y en cada
// colección, sus fotos (sitemap de imágenes, para Google Imágenes).
export function generarSitemap(): string {
  interface Entrada {
    ruta: string;
    fecha?: string;
    imagenes: string[];
  }
  const entradas = new Map<string, Entrada>();
  const entrada = (ruta: string) => {
    let e = entradas.get(ruta);
    if (!e) {
      e = { ruta, imagenes: [] };
      entradas.set(ruta, e);
    }
    return e;
  };
  const portadaWeb = entrada('/');

  for (const fila of listarPaginasPublicas()) {
    const fotografo = entrada(`/${fila.fotografo}`);
    fotografo.fecha = masReciente(fotografo.fecha, fila.fechaFotografo, fila.fechaPortfolio, fila.fechaColeccion);
    portadaWeb.fecha = masReciente(portadaWeb.fecha, fila.fechaFotografo);
    if (!fila.portfolio) {
      continue;
    }
    const portfolio = entrada(`/${fila.fotografo}/${fila.portfolio}`);
    portfolio.fecha = masReciente(portfolio.fecha, fila.fechaPortfolio, fila.fechaColeccion);
    if (!fila.coleccion || fila.idColeccion === null) {
      continue;
    }
    const coleccion = entrada(`/${fila.fotografo}/${fila.portfolio}/${fila.coleccion}`);
    coleccion.fecha = masReciente(fila.fechaColeccion);
    coleccion.imagenes = listarFotos(fila.idColeccion)
      .slice(0, MAXIMO_IMAGENES)
      .map((foto) => absoluta(photoUrl(fila.fotografo, fila.portfolio!, fila.coleccion!, foto.nombreFichero)));
  }

  const urls = [...entradas.values()].map((e) =>
    [
      '  <url>',
      `    <loc>${escaparXml(absoluta(e.ruta))}</loc>`,
      ...(e.fecha ? [`    <lastmod>${escaparXml(e.fecha)}</lastmod>`] : []),
      ...e.imagenes.map((imagen) => `    <image:image><image:loc>${escaparXml(imagen)}</image:loc></image:image>`),
      '  </url>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

// robots.txt: fuera las páginas que no son del catálogo (formularios, gestión, "Mi perfil"…), la API y
// las vistas limpias (las mismas páginas que las normales), y la dirección del sitemap. No protege
// nada (es una petición a los buscadores): lo que protege son los permisos del backend.
export function generarRobots(): string {
  return [
    'User-agent: *',
    // "/admin$" y "/admin/", y no "/admin", que dejaría fuera también a un fotógrafo "/adminson".
    ...SEGMENTOS_RESERVADOS.filter((s) => s !== 'photos' && !s.includes('.')).flatMap((s) => [`Disallow: /${s}$`, `Disallow: /${s}/`]),
    'Disallow: /*?limpia=',
    'Disallow: /*&limpia=',
    '',
    `Sitemap: ${absoluta('/sitemap.xml')}`,
    '',
  ].join('\n');
}

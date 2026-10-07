// Genera docs/documentacion.html: una sola página con todos los documentos Markdown del catálogo
// (docs/funcional/*.md y docs/tecnica/*.md), con la versión de la aplicación en la cabecera y un menú
// con las dos secciones y un elemento por documento. Sin dependencias:
//
//   node docs/generar-html.mjs
//
// Hay que volver a ejecutarlo cada vez que se crea o cambia un documento. El Markdown admitido es el
// que usan los documentos: títulos (#, ##, ###), párrafos, listas (- y 1.), tablas, `código`,
// **negrita**, *cursiva*, [enlaces](destino) e imágenes en una línea propia: ![texto](ruta). La ruta de
// una imagen es relativa a la carpeta del documento; se incrusta como data URI (la página sigue siendo
// un único fichero) dentro de una figura cuyo pie es el texto alternativo.
//
// Los documentos de SUELTOS (al final) se publican además en su propia página, docs/<documento>.html.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = path.dirname(fileURLToPath(import.meta.url));
const SECCIONES = [
  { carpeta: 'tecnica', titulo: 'Documentación técnica', resumen: 'Cómo está hecha la aplicación y cómo se mantiene.' },
  { carpeta: 'funcional', titulo: 'Documentación funcional', resumen: 'Qué hace la aplicación y con qué condiciones.' },
];

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Los trozos entre acentos graves son código y se dejan tal cual; en el resto, negrita, cursiva,
// enlaces y barras invertidas de escape.
const enLinea = (t) =>
  esc(t)
    .split('`')
    .map((trozo, n) =>
      n % 2
        ? `<code>${trozo}</code>`
        : trozo
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
            .replace(/\\(.)/g, '$1'),
    )
    .join('');
const ancla = (t) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const celdas = (l) =>
  l
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

// Imagen en una línea propia: ![texto alternativo](ruta relativa a la carpeta del documento).
const IMAGEN = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const TIPOS_IMAGEN = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
function dataUri(fichero) {
  const tipo = TIPOS_IMAGEN[path.extname(fichero).toLowerCase()];
  if (!tipo) throw new Error(`Formato de imagen no admitido: ${fichero}`);
  if (!existsSync(fichero)) throw new Error(`No existe la imagen ${fichero}`);
  return `data:${tipo};base64,${readFileSync(fichero).toString('base64')}`;
}

// Convierte un documento. Los id de sus elementos llevan delante el del documento (id--ancla), para
// que no choquen con los de otro documento de la misma página.
function convertir(id, markdown, carpeta) {
  const lineas = markdown.split(/\r?\n/);
  let titulo = id;
  const apartados = [];
  const cuerpo = [];
  const nuevoBloque = /^(#{1,3} |\||- |\d+\. |!\[)/;
  for (let i = 0; i < lineas.length; ) {
    const l = lineas[i];
    if (!l.trim()) {
      i++;
    } else if (l.startsWith('# ')) {
      titulo = l.slice(2).trim();
      i++;
    } else if (l.startsWith('## ')) {
      const t = l.slice(3).trim();
      apartados.push(t);
      cuerpo.push(`<h2 id="${id}--${ancla(t)}">${enLinea(t)}</h2>`);
      i++;
    } else if (l.startsWith('### ')) {
      cuerpo.push(`<h3>${enLinea(l.slice(4).trim())}</h3>`);
      i++;
    } else if (l.startsWith('|')) {
      const cabecera = celdas(l);
      i += 2; // cabecera y separador
      const filas = [];
      while (i < lineas.length && lineas[i].startsWith('|')) {
        filas.push(celdas(lineas[i++]));
      }
      // Las tablas cuya primera columna es un identificador ("Id", "Código") dan un ancla a cada fila.
      const clase = cabecera[0] === 'Id' ? 'casos' : cabecera[0] === 'Código' ? 'codigos' : '';
      const fila = (f) =>
        `<tr${clase ? ` id="${id}--${ancla(f[0])}"` : ''}>${f.map((c, n) => `<td data-col="${esc(cabecera[n] ?? '')}">${enLinea(c)}</td>`).join('')}</tr>`;
      cuerpo.push(
        `<div class="tabla"><table${clase ? ` class="${clase}"` : ''}><thead><tr>${cabecera.map((c) => `<th>${enLinea(c)}</th>`).join('')}</tr></thead><tbody>\n${filas.map(fila).join('\n')}\n</tbody></table></div>`,
      );
    } else if (IMAGEN.test(l)) {
      const [, alt, ruta] = l.match(IMAGEN);
      cuerpo.push(
        `<figure><img src="${dataUri(path.join(carpeta, ruta))}" alt="${esc(alt).replace(/"/g, '&quot;')}" loading="lazy"><figcaption>${enLinea(alt)}</figcaption></figure>`,
      );
      i++;
    } else if (/^(- |\d+\. )/.test(l)) {
      const ordenada = /^\d/.test(l);
      const items = [];
      while (i < lineas.length && (/^(- |\d+\. )/.test(lineas[i]) || /^\s+\S/.test(lineas[i]))) {
        if (/^(- |\d+\. )/.test(lineas[i])) items.push(lineas[i].replace(/^(- |\d+\. )/, ''));
        else items[items.length - 1] += ' ' + lineas[i].trim();
        i++;
      }
      const etiqueta = ordenada ? 'ol' : 'ul';
      cuerpo.push(`<${etiqueta}>${items.map((t) => `<li>${enLinea(t)}</li>`).join('')}</${etiqueta}>`);
    } else {
      let p = l.trim();
      i++;
      while (i < lineas.length && lineas[i].trim() && !nuevoBloque.test(lineas[i])) {
        p += ' ' + lineas[i++].trim();
      }
      cuerpo.push(`<p>${enLinea(p)}</p>`);
    }
  }
  // El primer párrafo dice qué es el documento y para quién: es su resumen en el índice.
  const resumen = (cuerpo.find((b) => b.startsWith('<p>')) ?? '').replace(/<[^>]+>/g, '');
  return { id, titulo, resumen, apartados, html: cuerpo.join('\n') };
}

const secciones = SECCIONES.map((seccion) => {
  const carpeta = path.join(docs, seccion.carpeta);
  const ficheros = existsSync(carpeta)
    ? readdirSync(carpeta)
        .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
        .sort()
    : [];
  return {
    ...seccion,
    documentos: ficheros.map((f) => convertir(f.replace(/\.md$/, ''), readFileSync(path.join(carpeta, f), 'utf8'), carpeta)),
  };
});
const ids = secciones.flatMap((s) => s.documentos.map((d) => d.id));
if (new Set(ids).size !== ids.length) {
  throw new Error('Hay dos documentos con el mismo nombre de fichero en secciones distintas: deben ser distintos.');
}

const version = JSON.parse(readFileSync(path.join(docs, '..', 'backend', 'package.json'), 'utf8')).version;
const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const total = ids.length;

const menu = secciones
  .map(
    (s) => `<section class="menu__seccion">
      <h2>${esc(s.titulo)}</h2>
      ${
        s.documentos.length
          ? `<ul>${s.documentos.map((d) => `<li><a href="#${d.id}" data-doc="${d.id}">${esc(d.titulo)}</a></li>`).join('')}</ul>`
          : '<p class="menu__vacio">Aún no hay documentos</p>'
      }
    </section>`,
  )
  .join('\n');

const indice = secciones
  .map(
    (s) => `<section class="indice__seccion">
      <h2>${esc(s.titulo)}</h2>
      <p>${esc(s.resumen)}</p>
      ${
        s.documentos.length
          ? `<div class="indice__documentos">${s.documentos
              .map((d) => `<a class="ficha" href="#${d.id}"><strong>${esc(d.titulo)}</strong><span>${esc(d.resumen)}</span></a>`)
              .join('')}</div>`
          : '<p class="indice__vacio">Aún no hay documentos en esta sección.</p>'
      }
    </section>`,
  )
  .join('\n');

const articulos = secciones
  .flatMap((s) =>
    s.documentos.map(
      (d) => `<article class="documento" id="${d.id}" data-documento>
      <p class="documento__seccion">${esc(s.titulo)}</p>
      <h1>${enLinea(d.titulo)}</h1>
      ${d.apartados.length > 1 ? `<nav class="apartados" aria-label="Apartados de ${esc(d.titulo)}">${d.apartados.map((a) => `<a href="#${d.id}--${ancla(a)}">${esc(a)}</a>`).join('')}</nav>` : ''}
      ${d.html}
    </article>`,
    ),
  )
  .join('\n');

// Estilos comunes a documentacion.html y a las páginas sueltas.
const estilos = `  :root {
    --fondo: #f6f5f1; --superficie: #ffffff; --texto: #1b1b1c; --apagado: #6d6b66; --borde: #dedbd3; --codigo: #efede7;
  }
  @media (prefers-color-scheme: dark) {
    :root { --fondo: #0b0b0c; --superficie: #141416; --texto: #f2f1ed; --apagado: #9a9994; --borde: #2a2a2d; --codigo: #1d1d20; }
  }
  * { box-sizing: border-box; }
  html { scroll-padding-top: 5.5rem; }
  body { margin: 0; background: var(--fondo); color: var(--texto); font: 16px/1.55 Inter, "Segoe UI", system-ui, sans-serif; }
  a { color: inherit; }
  h1, h2, h3 { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 500; line-height: 1.15; }
  figure { margin: 1.25rem 0 1.75rem; }
  figure img { display: block; max-width: 100%; height: auto; border: 1px solid var(--borde); border-radius: 4px; }
  figcaption { margin-top: 0.45rem; color: var(--apagado); font-size: 0.85rem; }
  code { padding: 0.1em 0.35em; background: var(--codigo); font: 0.875em Consolas, "Cascadia Mono", monospace; }

  .cabecera {
    position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 1.5rem;
    padding: 0.9rem 1.5rem; background: var(--superficie); border-bottom: 1px solid var(--borde);
  }
  .cabecera__titulo { margin: 0; font-size: 1.6rem; }
  .cabecera__titulo a { text-decoration: none; }
  .cabecera__datos { margin: 0 0 0 auto; color: var(--apagado); font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; }
  .cabecera__datos strong { color: var(--texto); }

  .pagina { display: grid; grid-template-columns: 17rem minmax(0, 1fr); align-items: start; }
  .menu { position: sticky; top: 4rem; max-height: calc(100vh - 4rem); overflow-y: auto; padding: 1.5rem; border-right: 1px solid var(--borde); }
  .menu__inicio, .menu li a { display: block; padding: 0.35rem 0.6rem; border-left: 2px solid transparent; color: var(--apagado); text-decoration: none; }
  .menu__inicio:hover, .menu li a:hover { color: var(--texto); }
  .menu [aria-current="page"] { color: var(--texto); border-left-color: var(--texto); background: var(--superficie); }
  .menu__seccion h2 { margin: 1.5rem 0 0.5rem; font: 600 0.72rem/1.3 Inter, "Segoe UI", system-ui, sans-serif; letter-spacing: 0.1em; text-transform: uppercase; }
  .menu ul { margin: 0; padding: 0; list-style: none; }
  .menu__vacio { margin: 0; padding: 0.35rem 0.6rem; color: var(--apagado); font-size: 0.875rem; font-style: italic; }

  .contenido { min-width: 0; padding: 2rem clamp(1rem, 3vw, 3rem) 4rem; }
  .contenido h1 { margin: 0 0 1rem; font-size: clamp(2.25rem, 4vw, 3.25rem); }
  .contenido h2 { margin: 2.75rem 0 0.75rem; padding-top: 1rem; border-top: 1px solid var(--borde); font-size: 1.8rem; }
  .contenido h3 { margin: 1.75rem 0 0.5rem; font-size: 1.35rem; }
  .contenido p, .contenido ul, .contenido ol { max-width: 52rem; }
  .contenido p { margin: 0.75rem 0; }
  .contenido li { margin: 0.4rem 0; }
  .documento__seccion { margin: 0 0 0.5rem; color: var(--apagado); font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; }
  .apartados { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0 0 1.5rem; }
  .apartados a { padding: 0.3rem 0.75rem; border: 1px solid var(--borde); color: var(--apagado); text-decoration: none; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; }
  .apartados a:hover { color: var(--texto); border-color: var(--apagado); }

  .indice__seccion p { color: var(--apagado); }
  .indice__documentos { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 1rem; margin-top: 1rem; }
  .ficha { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 1.1rem; border: 1px solid var(--borde); background: var(--superficie); text-decoration: none; }
  .ficha:hover { border-color: var(--apagado); }
  .ficha strong { font: 500 1.4rem/1.15 "Cormorant Garamond", Georgia, serif; }
  .ficha span { color: var(--apagado); font-size: 0.875rem; }
  .indice__vacio { font-style: italic; }

  .tabla { margin: 1rem 0; overflow-x: auto; border: 1px solid var(--borde); background: var(--superficie); }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { padding: 0.65rem 0.8rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--borde); }
  tr:last-child td { border-bottom: none; }
  tr:target td { background: var(--codigo); }
  th { color: var(--apagado); font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
  .casos td:nth-child(1) { white-space: nowrap; color: var(--apagado); font-variant-numeric: tabular-nums; }
  .casos td:nth-child(2) { min-width: 11rem; font-weight: 600; }
  .casos td:nth-child(3) { min-width: 20rem; }
  .casos td:nth-child(4) { min-width: 8rem; }
  .casos td:nth-child(5) { min-width: 18rem; }
  .codigos td:nth-child(1) { min-width: 15rem; overflow-wrap: anywhere; }
  .codigos td:nth-child(2), .codigos td:nth-child(3) { min-width: 18rem; }
  .codigos td:nth-child(4) { min-width: 12rem; overflow-wrap: anywhere; }
  .codigos code { font-size: 0.8em; }

  /* Con JavaScript solo se ve el documento elegido (o el índice); sin él, todos seguidos. */
  .con-js [data-documento]:not(.visible), .con-js .indice:not(.visible) { display: none; }
  [data-documento] + [data-documento] { margin-top: 4rem; }

  @media (max-width: 56rem) {
    html { scroll-padding-top: 1rem; }
    .cabecera { position: static; }
    .cabecera__datos { margin-left: 0; }
    .pagina { display: block; }
    .menu { position: static; max-height: none; border-right: none; border-bottom: 1px solid var(--borde); }
    .tabla { overflow: visible; border: none; background: none; }
    table, tbody, tr, td { display: block; }
    thead { display: none; }
    tr { margin-bottom: 0.75rem; border: 1px solid var(--borde); background: var(--superficie); }
    td, .casos td, .codigos td { min-width: 0; border-bottom: none; padding: 0.4rem 0.8rem; white-space: normal; }
    td::before { content: attr(data-col); display: block; color: var(--apagado); font-size: 0.68rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
  }
  @media print {
    body { background: #fff; color: #000; font-size: 10pt; }
    .cabecera { position: static; }
    .menu, .apartados { display: none; }
    .pagina { display: block; }
    .contenido { padding: 1rem 0; }
    .contenido h2 { break-after: avoid; }
    tr { break-inside: avoid; }
    .tabla { overflow: visible; }
  }
`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Documentación · Portfolio fotográfico ${esc(version)}</title>
<style>
${estilos}</style>
</head>
<body>
<header class="cabecera">
  <p class="cabecera__titulo"><a href="#inicio">Portfolio fotográfico · Documentación</a></p>
  <p class="cabecera__datos">Versión de la aplicación <strong>${esc(version)}</strong> · Generado el ${esc(fecha)} · ${total} ${total === 1 ? 'documento' : 'documentos'}</p>
</header>
<div class="pagina">
  <nav class="menu" aria-label="Documentos">
    <a class="menu__inicio" href="#inicio" data-doc="inicio">Índice</a>
    ${menu}
  </nav>
  <main class="contenido">
    <section class="indice" id="inicio">
      <h1>Índice de documentos</h1>
      ${indice}
    </section>
    ${articulos}
  </main>
</div>
<script>
  // Muestra el documento que indica la dirección (#documento o #documento--apartado) o, si no indica
  // ninguno, el índice; y marca su elemento en el menú.
  (function () {
    document.documentElement.classList.add('con-js');
    var vistas = document.querySelectorAll('[data-documento], .indice');
    function mostrar() {
      var id = decodeURIComponent(location.hash.slice(1));
      var destino = id ? document.getElementById(id) : null;
      var vista = (destino && destino.closest('[data-documento], .indice')) || document.getElementById('inicio');
      vistas.forEach(function (v) { v.classList.toggle('visible', v === vista); });
      document.querySelectorAll('.menu [data-doc]').forEach(function (a) {
        if (a.dataset.doc === vista.id) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      if (destino && destino !== vista) destino.scrollIntoView();
      else window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', mostrar);
    mostrar();
  })();
</script>
</body>
</html>
`;

const destino = path.join(docs, 'documentacion.html');
writeFileSync(destino, html);
console.log(`docs/documentacion.html generado (versión ${version}):`);
for (const s of secciones) {
  console.log(`  ${s.titulo}: ${s.documentos.map((d) => d.titulo).join(', ') || '(sin documentos)'}`);
}

// Páginas sueltas: algunos documentos se publican también en su propia página (docs/<documento>.html),
// para dárselos a quien solo necesita ese (p. ej. el manual del fotógrafo). Mismo estilo, sin menú ni
// índice; los apartados del documento hacen de índice.
const SUELTOS = ['manual-del-fotografo'];
for (const id of SUELTOS) {
  const seccion = secciones.find((s) => s.documentos.some((d) => d.id === id));
  if (!seccion) throw new Error(`No existe el documento ${id}, que debe publicarse en su propia página.`);
  const d = seccion.documentos.find((doc) => doc.id === id);
  const pagina = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.titulo)} · Portfolio fotográfico ${esc(version)}</title>
<style>
${estilos}
  .suelto { max-width: 64rem; margin: 0 auto; }
</style>
</head>
<body>
<header class="cabecera">
  <p class="cabecera__titulo"><a href="#${d.id}">Portfolio fotográfico · ${esc(d.titulo)}</a></p>
  <p class="cabecera__datos">Versión de la aplicación <strong>${esc(version)}</strong> · Generado el ${esc(fecha)}</p>
</header>
<main class="contenido suelto">
  <article class="documento" id="${d.id}">
    <h1>${enLinea(d.titulo)}</h1>
    ${d.apartados.length > 1 ? `<nav class="apartados" aria-label="Apartados de ${esc(d.titulo)}">${d.apartados.map((a) => `<a href="#${d.id}--${ancla(a)}">${esc(a)}</a>`).join('')}</nav>` : ''}
    ${d.html}
  </article>
</main>
</body>
</html>
`;
  writeFileSync(path.join(docs, `${id}.html`), pagina);
  console.log(`docs/${id}.html generado (página suelta de "${d.titulo}").`);
}

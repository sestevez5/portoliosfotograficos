# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Resumen del proyecto

Portfolio fotográfico elegante y minimalista. Monorepo con dos paquetes independientes:

- `backend/` — API sencilla en Node.js + Express + TypeScript (ESM) que sirve el catálogo de álbumes/fotos desde un JSON y las imágenes como archivos estáticos.
- `frontend/` — Aplicación Angular (standalone components, sin librería de UI) que consume esa API y presenta las fotos.

No hay base de datos: toda la organización (álbumes, fotos, tags) vive en `backend/datos/estructura/organizacionFotos.json`.

## Comandos

### Backend (`backend/`)

```
npm install         # instalar dependencias
npm run dev          # servidor de desarrollo con recarga (tsx watch), puerto 3000
npm run typecheck    # tsc --noEmit
npm run build         # compila a dist/ (tsc)
npm start             # ejecuta dist/index.js (requiere build previo)
```

### Frontend (`frontend/`)

```
npm install                     # instalar dependencias
npm start                        # ng serve, puerto 4200
npm run build                    # build de producción
npx ng test --watch=false        # ejecuta toda la suite (Vitest) una vez
npx ng test --watch=false -- <patrón>   # ejecutar un subconjunto de tests por nombre/archivo
```

El frontend espera la API en `http://localhost:3000` (constante `API_BASE_URL` en `frontend/src/app/core/config/api.config.ts`). Para probar la app completa hay que tener backend y frontend corriendo a la vez.

## Arquitectura

### Modelo de datos

Un álbum tiene título, descripción opcional, una lista de `tags` (los tags cuelgan del álbum, no de la foto individual) y una lista ordenada de fotos. Cada foto solo guarda `filename`; la URL pública se construye en el backend como `/photos/<fotografoSlug>/<albumId>/<filename>`.

- Fuente de verdad: `backend/datos/estructura/organizacionFotos.json` (forma: `OrganizacionFotos[]`, cada elemento `{ fotografo: { nombre, descripcion, logoSubtitulo?, logo? }, albumes: Album[] }`; `logo` no se rellena a mano, lo escribe el backend al generar el logo).
- Archivos de imagen reales: `backend/datos/fotos/<fotografoSlug>/<albumId>/<filename>` — las carpetas deben reflejar exactamente el slug del fotógrafo (primer nombre sin acentos y en minúsculas, p. ej. `santi`), los `id` de álbum y los `filename` de foto usados en el JSON, o las imágenes no se resolverán.
- Logos de fotógrafo: nunca los aporta el usuario, los genera el backend. `GET /api/fotografos/:slug/logo` llama a `asegurarLogo` (`backend/src/services/logo.service.ts`): si `fotografo.logo` referencia un archivo que existe en `backend/datos/logos/`, lo sirve tal cual; si no, genera `<slug>.svg` a partir del `nombre` y del `logoSubtitulo` opcional, lo guarda en esa carpeta y escribe la referencia `"logo"` en `organizacionFotos.json` mediante `guardarOrganizacion` (`backend/src/services/organizacion.service.ts`: escritura atómica con temporal + rename, síncrona, conservando el formato del fichero). El logo es un SVG tipo firma: letra manuscrita Mrs Saint Delafield, subrayado de plumilla y subtítulo en Inter, con el texto convertido a trazos (un `<img>` no puede cargar fuentes) y tinta `#f2f1ed` para el fondo oscuro. Las fuentes (OFL) están en `backend/assets/fonts` y se copian a la imagen Docker. La API expone solo `logoUrl`. Para regenerar un logo basta con borrar su archivo o su referencia.
- Tipos compartidos conceptualmente (no compartidos por código, ya que son dos paquetes npm separados): `backend/src/types/album.ts` y `frontend/src/app/core/models/album.model.ts`. Si se cambia la forma del JSON hay que actualizar ambos.

### Backend (`backend/src/`)

- `index.ts` — arranque de Express, monta `/api` y sirve `/photos` como estático desde `backend/datos/fotos`.
- `routes/albums.routes.ts` — único router: `GET /api/albums` (con filtro opcional `?tag=`), `GET /api/albums/:id`, `GET /api/tags` (tags únicos derivados de todos los álbumes, no hay colección de tags separada), `GET /api/fotografos`, `GET /api/fotografos/:slug` (fotógrafo + resúmenes de sus álbumes, filtro opcional `?tag=`), `GET /api/fotografos/:slug/logo` y `GET /api/fotografos/:slug/albums/:id`. El `slug` es el primer nombre del fotógrafo sin acentos y en minúsculas (`Santi Estévez` -> `santi`), insensible a mayúsculas en la URL.
- `services/organizacion.service.ts` — carga `organizacionFotos.json` al arrancar (con `readFileSync`, no como import ESM) y expone `guardarOrganizacion()` para reescribirlo. `services/logo.service.ts` — generación y persistencia de logos (ver "Modelo de datos"). El paquete es ESM (`"type": "module"`, `module`/`moduleResolution: NodeNext`).

### Frontend (`frontend/src/app/`)

Angular standalone (sin `NgModule`), routing con `loadComponent` (lazy):

- `core/services/album.ts` — `AlbumService` (decorador `@Service()`, la forma moderna de `@Injectable` en esta versión de Angular) con los tres métodos que reflejan las rutas del backend.
- `core/models/album.model.ts` — interfaces `Album`, `AlbumSummary`, `Photo`.
- `core/config/api.config.ts` — URL base de la API.
- `features/fotografo-list/` — página raíz (`/`), listado de fotógrafos.
- `features/album-list/` — página `/:fotografo`, grid de álbumes de ese fotógrafo.
- `features/album-detail/` — página `/:fotografo/albums/:id`, grid de fotos del álbum; obtiene el `id` vía `ActivatedRoute.paramMap` con `switchMap` + `toSignal`.
- `shared/lightbox/` — visor modal reutilizable (controlado por el padre vía `photos`/`index` como inputs y eventos `closeRequested`/`indexChange`); navegación por teclado (flechas, Escape).

Patrón de datos: los componentes usan `toSignal()` (`@angular/core/rxjs-interop`) sobre los observables de `AlbumService` en lugar de `subscribe()` manual; no hay gestión de estado global (no hace falta con esta escala de app).

### Diseño / estilo

Sistema de diseño propio en SCSS (sin Angular Material ni Tailwind, por decisión explícita): tokens como custom properties en `frontend/src/styles.scss` (paleta oscura neutra para que las fotos destaquen, tipografía serif `Cormorant Garamond` para títulos + `Inter` para UI, cargadas vía Google Fonts en `index.html`). Los estilos de cada componente son locales a su carpeta (`*.scss` junto al componente).

### Despliegue con Docker (NAS)

`docker-compose.yml` en la raíz levanta dos servicios en la red interna `portfolio`, usando imágenes ya construidas en vez de build local:

- `backend` — imagen `ghcr.io/sestevez5/portoliosfotograficos-backend:latest`. No publica puerto al host; solo es accesible desde `frontend` a través de la red de Docker Compose.
- `frontend` — imagen `ghcr.io/sestevez5/portoliosfotograficos-frontend:latest`. Publica un único puerto al host (`FRONTEND_PORT`, por defecto 8080).

Las imágenes se construyen y publican automáticamente en GitHub Container Registry (GHCR) mediante `.github/workflows/docker-publish.yml` en cada push a `main` (tags `:latest` y `:<sha>`). Por eso el NAS **no necesita el código fuente**: solo `docker-compose.yml`, `.env` y la carpeta `datos/` (ver más abajo). Si el paquete de GHCR está en privado, hay que hacer `docker login ghcr.io` una vez en el NAS con un token con permiso `read:packages` antes de poder hacer `pull` (o marcar el paquete como público desde la configuración de GitHub).

`docker-compose.override.yml` (no se copia al NAS) añade `build: context: ...` a ambos servicios y Docker Compose lo aplica automáticamente cuando está presente junto a `docker-compose.yml` — así en local, con el repo completo, `docker compose build`/`up` siguen construyendo las imágenes desde los Dockerfiles en vez de tirar de GHCR. Los Dockerfiles (`backend/Dockerfile`, `frontend/Dockerfile`) son multi-stage: el backend hace `npm run build` + `npm ci --omit=dev` + `node dist/index.js`; el frontend hace `ng build` y sirve `dist/frontend/browser` con nginx.

`frontend/nginx.conf` hace de proxy inverso: sirve los estáticos de Angular y reenvía `/api/` y `/photos/` al servicio `backend:3000`, de forma que el navegador solo ve un origen. Por eso en build de producción `API_BASE_URL` debe ser `''` (ruta relativa) en vez de `http://localhost:3000`: `angular.json` usa `fileReplacements` en la configuración `production` para sustituir `api.config.ts` por `api.config.prod.ts` automáticamente en cualquier `ng build` (o `npm run build`) sin flags adicionales. En desarrollo (`ng serve`) se sigue usando `api.config.ts` tal cual.

La carpeta `backend/datos` (fotos + `organizacionFotos.json`) se monta como volumen externo, no se hornea en la imagen (`backend/.dockerignore` la excluye, y el backend lee el JSON en runtime con `fs.readFileSync` en vez de importarlo como módulo ESM, precisamente para que el build de la imagen no dependa de que ese archivo exista). La ruta real en el host del NAS se configura vía variable de entorno `DATOS_PATH` en un fichero `.env` (no versionado; ver `.env.example`) junto con `FRONTEND_PORT`.

Despliegue típico en el NAS (solo con `docker-compose.yml`, `.env` y `datos/` copiados, sin el resto del repo): `cp .env.example .env` (ajustar rutas), `docker compose pull`, `docker compose up -d`. Para desplegar una versión nueva más adelante: `docker compose pull && docker compose up -d` de nuevo.

## Versionado

Versionado semántico `MAYOR.MENOR.PARCHE` (semver), una única versión para todo el monorepo:

- **MAYOR**: cambios incompatibles (p. ej. cambios en la forma de `organizacionFotos.json` que obligan a migrar los datos del NAS, o rutas de la API que desaparecen).
- **MENOR**: funcionalidad nueva compatible hacia atrás.
- **PARCHE**: correcciones sin cambios de funcionalidad.

Al publicar una versión: actualizar `version` en `backend/package.json` y `frontend/package.json` (`npm version X.Y.Z --no-git-tag-version` en cada paquete, que también actualiza el lockfile), añadir la entrada en `CHANGELOG.md`, hacer commit en `develop`, fusionar en `main` y crear el tag anotado `vX.Y.Z` en `main`. El desarrollo diario va en `develop`; `main` solo recibe versiones.

## Notas para seguir desarrollando

- Las fotos y el JSON de ejemplo (`naturaleza`, `arquitectura`) son contenido de prueba generado como placeholders de color — hay que sustituirlos por fotos reales y actualizar `organizacionFotos.json` en consecuencia.
- El backend ya escribe en `organizacionFotos.json` (solo para añadir la referencia `logo` al generar un logo), con escritura atómica y síncrona. Si se añade subida de fotos o edición del catálogo en caliente, habrá más escrituras y probablemente convenga pasar a una base de datos ligera tipo SQLite; evaluarlo antes. Ojo: editar el JSON a mano con el backend en marcha se pierde si el backend lo reescribe después, porque trabaja con la copia cargada al arrancar; conviene parar el backend para editarlo.
- Repositorio git inicializado, con remoto en GitHub (`https://github.com/sestevez5/portoliosfotograficos.git`, rama `main`).


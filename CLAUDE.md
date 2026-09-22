# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Resumen del proyecto

Portfolio fotográfico elegante y minimalista. Monorepo con dos paquetes independientes:

- `backend/` — API sencilla en Node.js + Express + TypeScript (ESM) que sirve el catálogo de álbumes/fotos desde un JSON y las imágenes como archivos estáticos.
- `frontend/` — Aplicación Angular (standalone components, sin librería de UI) que consume esa API y presenta las fotos.

No hay base de datos: toda la organización (álbumes, fotos, tags) vive en `backend/src/data/organizacionFotos.json`.

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

- Fuente de verdad: `backend/src/data/organizacionFotos.json` (forma: `OrganizacionFotos[]`, cada elemento `{ fotografo: { nombre, descripcion }, albumes: Album[] }`).
- Archivos de imagen reales: `backend/photos/<fotografoSlug>/<albumId>/<filename>` — las carpetas deben reflejar exactamente el slug del fotógrafo (primer nombre sin acentos y en minúsculas, p. ej. `santi`), los `id` de álbum y los `filename` de foto usados en el JSON, o las imágenes no se resolverán.
- Tipos compartidos conceptualmente (no compartidos por código, ya que son dos paquetes npm separados): `backend/src/types/album.ts` y `frontend/src/app/core/models/album.model.ts`. Si se cambia la forma del JSON hay que actualizar ambos.

### Backend (`backend/src/`)

- `index.ts` — arranque de Express, monta `/api` y sirve `/photos` como estático desde `backend/photos`.
- `routes/albums.routes.ts` — único router: `GET /api/albums` (con filtro opcional `?tag=`), `GET /api/albums/:id`, `GET /api/tags` (tags únicos derivados de todos los álbumes, no hay colección de tags separada), `GET /api/fotografos`, `GET /api/fotografos/:slug` (fotógrafo + resúmenes de sus álbumes, filtro opcional `?tag=`) y `GET /api/fotografos/:slug/albums/:id`. El `slug` es el primer nombre del fotógrafo sin acentos y en minúsculas (`Santi Estévez` -> `santi`), insensible a mayúsculas en la URL.
- El JSON de datos se importa directamente con `import ... with { type: 'json' }` (ESM import attributes) — por eso `package.json` tiene `"type": "module"` y `tsconfig.json` usa `module`/`moduleResolution: NodeNext`.

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

## Notas para seguir desarrollando

- Las fotos y el JSON de ejemplo (`naturaleza`, `arquitectura`) son contenido de prueba generado como placeholders de color — hay que sustituirlos por fotos reales y actualizar `organizacionFotos.json` en consecuencia.
- Si se añade subida de fotos o edición del catálogo en caliente, el backend deja de ser "solo lectura de un JSON estático" y probablemente convenga mover `organizacionFotos.json` a algo con escritura atómica (o una base de datos ligera tipo SQLite) — evaluarlo antes de escribir concurrentemente sobre el archivo.
- No hay control de versiones inicializado en este entorno (git no está instalado en la máquina donde se creó el proyecto).


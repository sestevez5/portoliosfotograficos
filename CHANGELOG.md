# Changelog

Todos los cambios relevantes del proyecto se documentan en este fichero.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[Versionado Semántico](https://semver.org/lang/es/) (`MAYOR.MENOR.PARCHE`).

## [Sin publicar]

Cambio incompatible: la próxima versión debe ser **2.0.0**.

### Cambiado

- Nuevo nivel **portfolio** entre fotógrafo y álbumes: cada fotógrafo tiene varios portfolios y cada portfolio
  varios álbumes.
- `organizacionFotos.json`: `albumes` pasa a estar dentro de `portfolios: [{ id, title, description?, albumes }]`.
- Las fotos se mueven a `datos/fotos/<fotógrafo>/<portfolio>/<álbum>/`. **Al desplegar hay que copiar al NAS la
  carpeta `datos` completa (JSON y fotos) junto con las imágenes nuevas.**
- API: `GET /api/fotografos/:slug` devuelve portfolios. Nuevas rutas `GET /api/fotografos/:slug/portfolios/:portfolio`
  y `.../portfolios/:portfolio/albums/:id`. Se elimina `GET /api/fotografos/:slug/albums/:id`.
- Interfaz: navegación `/:fotógrafo` (portfolios) → `/:fotógrafo/:portfolio` (álbumes) → `/:fotógrafo/:portfolio/:álbum`
  (fotos), con enlace para volver al nivel anterior. Las URL antiguas `/:fotógrafo/albums/:id` dejan de funcionar.
- La portada muestra el número de portfolios y álbumes de cada fotógrafo.

## [1.0.0] - 2026-09-26

Primera versión estable.

### Añadido

- Portfolio con listado de fotógrafos (`/`), álbumes de cada fotógrafo (`/:fotografo`) y detalle de álbum con visor
  (`/:fotografo/albums/:id`).
- API en Node.js + Express que sirve el catálogo desde `backend/datos/estructura/organizacionFotos.json` y las fotos
  como estáticos.
- Logo tipo firma para cada fotógrafo, generado por el backend a partir de su nombre (y `logoSubtitulo` opcional) la
  primera vez que se pide. Se guarda en `backend/datos/logos/` y se referencia en el JSON.
- Enlace "Volver" en la página de un fotógrafo cuando se llega desde la portada.
- Despliegue con Docker Compose en el NAS usando imágenes publicadas en GHCR.
- Datos de prueba: 8 fotógrafos adicionales con álbumes y fotos de relleno.

[1.0.0]: https://github.com/sestevez5/portoliosfotograficos/releases/tag/v1.0.0

# Changelog

Todos los cambios relevantes del proyecto se documentan en este fichero.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[Versionado Semántico](https://semver.org/lang/es/) (`MAYOR.MENOR.PARCHE`).

## [2.0.0] - 2026-09-29

Versión con cambios incompatibles (organización de `datos/`, esquema de la base de datos, rutas de la API y de la
web). Ver las notas de despliegue de cada punto.

### Añadido

- **Gestionar fotos** de una colección (`/gestion/:fotografo/portfolios/:portfolio/colecciones/:coleccion/fotos`):
  añadir varias fotos a la vez arrastrándolas o eligiéndolas (JPEG, PNG o WebP de hasta 25 MB), ordenarlas
  arrastrándolas, elegir la foto de portada con una estrella, cambiar el **título** de cada foto (menos de 20
  caracteres; sin él, "Sin título") y eliminarlas. Nuevas rutas `POST …/colecciones/:coleccion/fotos`,
  `PUT …/fotos/orden`, `PUT …/colecciones/:coleccion/portada`, `PUT …/fotos/:nombreFichero/titulo` y
  `DELETE …/fotos/:nombreFichero`; reglas `FOTO_*` y `COLECCION_FOTO_PORTADA_INEXISTENTE`.
- **Ordenar portfolios** de un fotógrafo y **Gestionar colecciones** de un portfolio, arrastrándolos. En "Gestionar
  colecciones" una estrella elige la colección cuya portada es la del portfolio (sin elegir, la primera). Nuevas
  rutas `PUT /api/fotografos/:fotografo/orden-portfolios`, `PUT …/portfolios/:portfolio/orden-colecciones` y
  `PUT …/portfolios/:portfolio/portada`.
- Donde no hay portada se muestra "Sin fotos" (colección sin fotos) o "Sin colecciones" (portfolio sin colecciones).
- **Miniaturas**: la web muestra versiones reducidas de las fotos (480, 960, 1600 y 2400 px) que genera el backend
  con `sharp` la primera vez que se piden (`/photos/…?ancho=`), en lugar de las originales.
- Títulos de página: "Portfolios de <fotógrafo>", "Portfolio: <nombre>" y "Colección: "<nombre>"".
- **Migraciones de la base de datos**: a partir de la versión 15 del esquema, cada cambio incluye su migración, que se
  aplica sola al arrancar conservando los datos. Esquema 16 (`portfolios.idColeccionPortada`).

### Cambiado

- **Permisos**: el administrador puede modificarlo todo; cualquier otro usuario, solo lo suyo (sus datos de usuario y
  fotógrafo, su foto, sus portfolios y sus colecciones); sin sesión no se puede modificar nada (salvo registrarse).
  La API responde 401 sin sesión y 403 sin permiso; el alta de fotógrafos desde `/admin` y el cambio de contraseña
  del administrador quedan solo para él, y los datos de edición de un fotógrafo (con su correo) solo para él y el
  administrador. En la web, los botones de mantenimiento de lo que no es del usuario no se muestran y los formularios
  sin permiso llevan a la portada.
- **Foto de perfil**: en el formulario del fotógrafo (alta, edición y registro) se puede poner una foto desde un
  archivo o con la cámara web, y encuadrarla en un círculo moviéndola y ampliándola. Se ve en el menú del usuario y en
  "Mi perfil". Nuevas rutas `GET`/`PUT`/`DELETE /api/fotografos/:fotografo/foto`. Esquema 15
  (`usuarios.fotoActualizada`); las fotos se guardan en `datos/avatares/`. La cámara solo funciona con https o en
  localhost.
- **Menú del usuario**: con la sesión iniciada, la franja superior muestra un círculo con sus iniciales y su nombre
  informal; al pulsarlo se despliega un menú con su nombre y correo y las opciones **Mi perfil** (sus datos como
  usuario y como fotógrafo), **Configuración** (el tema por defecto, claro u oscuro, que se guarda en su usuario y se
  aplica al iniciar sesión en cualquier navegador) y **Salir**. Nuevas rutas `GET /api/perfil` y
  `PUT /api/perfil/preferencias`; `GET /api/sesion` devuelve también el correo y el tema preferido del propio
  usuario. Esquema 14 (`usuarios.temaPreferido`). `perfil` y `configuracion` pasan a ser direcciones reservadas.
- **Colecciones**: las agrupaciones de fotos de cada portfolio se llaman colecciones en toda la aplicación
  (interfaz, mensajes, API, base de datos y código). API: `/api/colecciones` y
  `…/portfolios/:portfolio/colecciones/:coleccion`; el número de colecciones es `collectionCount`; reglas `COLECCION_*`
  y `PORTFOLIO_ELIMINAR_CON_COLECCIONES`; comando `npm run coleccion:renombrar`; en el JSON de importación,
  `colecciones`. Web: `/gestion/…/colecciones/…`.
- **Esquema de la base de datos definido de nuevo (versión 13), sin migraciones** desde los anteriores (la aplicación
  aún no se ha publicado). Una base de datos de otra versión no se abre.
- **Tema claro**: la estética actual pasa a ser el tema oscuro (el predeterminado) y se añade uno claro. Se elige en la
  franja superior de la página y se recuerda en el navegador. Los logos se invierten en el tema claro; el visor de
  fotos también sigue el tema elegido.
- **Inicio de sesión y registro**: en la esquina superior aparece quién tiene la sesión iniciada y la
  opción de cerrarla, o "Iniciar sesión", que abre un panel para entrar con el usuario (o el correo) y la contraseña y
  ofrece registrarse. El registro pide usuario, correo y contraseña y los datos del fotógrafo, y deja la sesión
  iniciada. La sesión va en una cookie `HttpOnly` (30 días) y la base de datos solo guarda el hash de su token. Nuevas
  rutas `GET`/`POST`/`DELETE /api/sesion` y `POST /api/registro`. Todavía no restringe nada: solo identifica al
  usuario. Los fotógrafos existentes sin contraseña no pueden entrar hasta que se les ponga una (editándolos).
- Corregido: dar de alta un fotógrafo fallaba si aún no existía la carpeta `datos/fotos` (instalación nueva).
- **Administrador de la aplicación**: usuario especial `admin`, con la contraseña inicial `admin`, que se
  puede cambiar. La base de datos lo crea al instalarse. **Primer uso:** la
  primera vez que se abre la web aparece una bienvenida que pide sus credenciales y ofrece cambiar la contraseña;
  después se cambia en `/admin/contrasenya`. Nuevas rutas `GET /api/estado`,
  `POST /api/admin/primer-uso` y `PUT /api/admin/contrasenya`. Todavía no restringe nada: todo sigue abierto.
  **Al desplegar en el NAS, entrar enseguida y cambiar la contraseña.**
- **Nueva tabla `usuarios`**: el nombre de usuario, el correo y el hash de la contraseña salen de
  `fotografos` a `usuarios`, y cada fotógrafo referencia a su usuario (`idUsuario`). Prepara la aplicación para que
  en el futuro haya usuarios que no sean fotógrafos (empresas, academias…) con sus propios portfolios. La API no cambia, salvo los
  códigos de las reglas de la cuenta: `FOTOGRAFO_EMAIL_DUPLICADO`, `FOTOGRAFO_USUARIO_DUPLICADO`,
  `FOTOGRAFO_EMAIL_NO_VALIDO` y `FOTOGRAFO_CONTRASENYA_CORTA` pasan a ser `USUARIO_EMAIL_DUPLICADO`,
  `USUARIO_DUPLICADO`, `USUARIO_EMAIL_NO_VALIDO` y `USUARIO_CONTRASENYA_CORTA`. Eliminar un fotógrafo elimina también
  su usuario.
- **La carpeta `backend/datos` deja de versionarse** (está en `.gitignore`): el repositorio refleja siempre una base
  de datos vacía y las fotos y los logos viven solo en cada instalación. Un clon nuevo arranca con el catálogo vacío.
- La base de datos pasa de `datos/estructura/portfolio.db` a **`datos/BD/portfolio.db`**.
- **Docker: solo se monta desde el NAS la carpeta de fotos.** La base de datos y los logos pasan a ser internos, en el
  volumen de Docker `datos-internos`. En `.env`, `DATOS_PATH` se sustituye por **`FOTOS_PATH`** (obligatoria), que
  apunta directamente a la carpeta de fotos. **Al desplegar:** ajustar `.env`, copiar la carpeta de fotos al NAS y
  cargar la base de datos en el volumen (`docker compose stop backend`,
  `docker compose cp portfolio.db backend:/app/datos/BD/portfolio.db`, `docker compose start backend`).
- Se elimina `organizacionFotos.json` y la importación automática al arrancar con la base de datos vacía (el JSON
  estaba desfasado respecto a la base de datos y a las carpetas). `npm run db:importar` exige ahora la ruta del JSON
  (`npm run db:importar -- <fichero.json> [--reemplazar]`) y queda solo para cargas masivas puntuales.
- Nuevo nivel **portfolio** entre fotógrafo y colecciones: cada fotógrafo tiene varios portfolios y cada portfolio
  varias colecciones.
- `organizacionFotos.json`: `colecciones` pasa a estar dentro de `portfolios: [{ id, title, description?, colecciones }]`.
- Las fotos se mueven a `datos/fotos/<fotógrafo>/<portfolio>/<colección>/`. **Al desplegar hay que copiar al NAS la
  carpeta `datos` completa (JSON y fotos) junto con las imágenes nuevas.**
- API: `GET /api/fotografos/:fotografo` devuelve portfolios. Nuevas rutas `GET /api/fotografos/:fotografo/portfolios/:portfolio`
  y `.../portfolios/:portfolio/colecciones/:coleccion` (por nombre). Se eliminan `GET /api/fotografos/:slug/colecciones/:id` y
  `GET /api/colecciones/:id`.
- Interfaz: navegación `/:fotógrafo` (portfolios) → `/:fotógrafo/:portfolio` (colecciones) → `/:fotógrafo/:portfolio/:colección`
  (fotos), con enlace para volver al nivel anterior. Las URL antiguas `/:fotógrafo/colecciones/:id` dejan de funcionar.
- La portada muestra el número de portfolios y colecciones de cada fotógrafo.
- El catálogo pasa a una base de datos **SQLite** (`datos/estructura/portfolio.db`, con `better-sqlite3`). La API
  responde exactamente igual. En el primer arranque sin base de datos se importa `organizacionFotos.json`
  automáticamente; después el JSON deja de leerse. Nuevo comando `npm run db:importar` (`--reemplazar` para
  reimportar). La carpeta `datos` del NAS debe ser escribible por el contenedor.
- El logo generado de cada fotógrafo se referencia en la base de datos en lugar de en el JSON.
- Esquema en lowerCamelCase con claves primarias enteras (`idFotografo`, `idPortfolio`, `idColeccion`, `idFoto`) y
  nombres en español (`nombre`, `descripcion`, `nombreFichero`, `titulo`, `ancho`, `alto`…). Fechas `fechaCreacion` y
  `fechaModificacion` en fotógrafos, portfolios, colecciones y fotos, mantenidas por la base de datos.
- Portfolios y colecciones tienen `nombreNormalizado` (único dentro de su padre), calculado a partir de su `nombre` igual
  que el `nombreInformalNormalizado` del fotógrafo: es su identificador en la URL y **el nombre de su carpeta**
  (`Montaña` → `montanya/`). Sustituye a `nombreCarpeta`, que desaparece de la base de datos y de
  `organizacionFotos.json`. **Al desplegar, las carpetas de `datos/fotos/` deben llamarse ya así si se importa el JSON.** La API
  devuelve `nombreNormalizado` en portfolios y colecciones. Nuevos comandos `npm run portfolio:renombrar` y
  `npm run coleccion:renombrar`, que renombran también la carpeta.
- Un único helper `normalizarNombre()` normaliza todos los nombres (quita espacios de los extremos, minúsculas, sin
  tildes, "ñ" → "ny", cada grupo de espacios → "-"). Se rechazan los nombres que no sirven como carpeta
  (contienen `/` o `\`, o empiezan por `.`).
- Fotógrafos con `nombre`, `primerApellido` (obligatorio), `segundoApellido`, `email` (opcional y único) y
  `passwordHash` (solo el hash; aún sin uso). Email y contraseña nunca salen en la API.
- `usuario` interno del fotógrafo (no se muestra ni sale en la API): inicial del nombre + 3 letras del primer apellido
  (`sest`), con sufijo numérico si se repite.
- Nuevo campo obligatorio `nombreInformal` (p. ej. "Santi Estévez"), único en su forma de URL: es el texto del logo
  y lo que identifica al fotógrafo en la URL (`/santi-estevez`). Desaparece la columna `logo`.
- Nuevo campo `nombreInformalNormalizado` (único): `nombreInformal` en minúsculas, sin tildes, "ñ" → "ny" y con
  guiones. Es el identificador del fotógrafo en la URL, el nombre de su logo (`datos/logos/santi-estevez.svg`) y el
  de su carpeta: **las carpetas de `datos/fotos/` pasan a llamarse así** (`santi/` → `santi-estevez/`). Al cambiar
  el `nombreInformal` (`npm run fotografo:renombrar`) se renombra la carpeta en la misma transacción.
- El logo ya no lleva subtítulo (desaparece `logoSubtitulo`): firma con el `nombreInformal`. Se elimina la fuente
  Inter del backend.
- API y `organizacionFotos.json` con el mismo vocabulario que la base de datos. Los ids son internos: no salen en
  la API ni en las URL. URL de la web por nombres, siempre en minúsculas, sin tildes, con "ñ" escrita "ny" y con
  guiones en lugar de espacios: `/:fotografo/:portfolio/:coleccion` (p. ej. `/santi-estevez/paisaje/naturaleza`,
  `/marta-vidal/encargos/montanya`).
  Una URL escrita con mayúsculas o espacios redirige a su forma canónica.
- La página de una colección inexistente muestra "Colección no encontrada" en lugar de quedar en blanco.
- **Reglas de negocio** centralizadas en `backend/src/reglas/`: catálogo único de reglas y de operaciones con sus
  textos, validaciones previas a cada escritura (importación y cambio de nombre informal) y error
  `ReglaNegocioIncumplida`. La API responde 422 con la operación intentada y la regla incumplida. Los nombres de
  portfolio y colección duplicados se detectan también cuando solo difieren en mayúsculas, espacios o tildes, y ya no
  puede haber dos portfolios o colecciones hermanos con la misma carpeta.
- Tests del backend (`npm test`).
- **Alta de fotógrafos**: formulario en `/admin/fotografos/nuevo` (enlace en la portada) y `POST /api/fotografos`.
  Crea la carpeta del fotógrafo en `datos/fotos/`, guarda solo el hash de la contraseña y valida las reglas de
  negocio (nuevas: formato del correo, longitud mínima de la contraseña, carpeta ya existente y direcciones
  reservadas `admin`, `api`, `photos`). **Sin autenticación todavía.**
- **Edición y eliminación de fotógrafos**: botones "Editar" y "Eliminar" en cada tarjeta de la portada y en la página
  del fotógrafo; formulario de edición en `/admin/fotografos/:fotografo/editar`; `GET …/edicion`, `PUT` y `DELETE
  /api/fotografos/:fotografo`. Si el fotógrafo tiene portfolios, eliminarlo exige confirmar la advertencia (regla
  `FOTOGRAFO_ELIMINAR_CON_PORTFOLIOS`); se borran de forma permanente sus portfolios, colecciones, fotos, carpeta y logo.
  **Sin autenticación todavía.**
- **Mantenimiento de portfolios por su fotógrafo**: "+ Nuevo portfolio" en la página del fotógrafo y botones "Editar" y
  "Eliminar" en cada portfolio y en su página; formularios en `/gestion/:fotografo/portfolios/nuevo` y
  `/gestion/:fotografo/portfolios/:portfolio/editar`; `POST /api/fotografos/:fotografo/portfolios`, `PUT` y `DELETE
  /api/fotografos/:fotografo/portfolios/:portfolio`. Crear, renombrar y eliminar un portfolio crea, renombra y borra
  también su carpeta. Si el portfolio contiene colecciones, eliminarlo exige confirmar la advertencia (regla
  `PORTFOLIO_ELIMINAR_CON_COLECCIONES`). `gestion` pasa a ser una dirección reservada. **Sin autenticación todavía.**
- **Mantenimiento de colecciones por su fotógrafo**, igual que el de portfolios: "+ Nueva colección" en la página del
  portfolio y botones "Editar" y "Eliminar" en cada colección y en su página; formularios (nombre, descripción y tags) en
  `/gestion/:fotografo/portfolios/:portfolio/colecciones/nuevo` y `.../colecciones/:coleccion/editar`;
  `POST /api/fotografos/:fotografo/portfolios/:portfolio/colecciones`, `PUT` y `DELETE .../colecciones/:coleccion`. Crear, renombrar
  y eliminar una colección crea, renombra y borra también su carpeta (que se llama siempre como su `nombreNormalizado`). Si
  la colección contiene fotos, eliminarlo exige confirmar la advertencia (regla `COLECCION_ELIMINAR_CON_FOTOS`). **Sin
  autenticación todavía.**
- Variable `DATOS_DIR` para usar otra carpeta de datos.

## [1.0.0] - 2026-09-26

Primera versión estable.

### Añadido

- Portfolio con listado de fotógrafos (`/`), colecciones de cada fotógrafo (`/:fotografo`) y detalle de colección con visor
  (`/:fotografo/colecciones/:id`).
- API en Node.js + Express que sirve el catálogo desde `backend/datos/estructura/organizacionFotos.json` y las fotos
  como estáticos.
- Logo tipo firma para cada fotógrafo, generado por el backend a partir de su nombre (y `logoSubtitulo` opcional) la
  primera vez que se pide. Se guarda en `backend/datos/logos/` y se referencia en el JSON.
- Enlace "Volver" en la página de un fotógrafo cuando se llega desde la portada.
- Despliegue con Docker Compose en el NAS usando imágenes publicadas en GHCR.
- Datos de prueba: 8 fotógrafos adicionales con colecciones y fotos de relleno.

[2.0.0]: https://github.com/sestevez5/portoliosfotograficos/releases/tag/v2.0.0
[1.0.0]: https://github.com/sestevez5/portoliosfotograficos/releases/tag/v1.0.0

# Changelog

Todos los cambios relevantes del proyecto se documentan en este fichero.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[Versionado Semántico](https://semver.org/lang/es/) (`MAYOR.MENOR.PARCHE`).

## [Sin publicar]

## [2.5.0] - 2026-10-10

### Añadido

- "Acerca de" muestra una sección "Colaboradores" debajo de "Autor" (los nombres del campo `contributors` de
  `backend/package.json`; si no hay ninguno, no se muestra). `GET /api/acerca-de` devuelve además `colaboradores`.

### Notas de despliegue

- Sin cambios en el esquema de la base de datos ni en la configuración: basta con
  `docker compose pull && docker compose up -d`.

## [2.4.0] - 2026-10-10

### Añadido

- **Vista limpia**: `?limpia=true` en la página de un fotógrafo, un portfolio o una colección la muestra sin la
  aplicación (sin franja superior, navegación, totales ni mantenimiento). La navegación nunca lo añade y, al volver,
  se respeta cómo se vio cada página.
- Icono "compartir" junto al título del fotógrafo, el portfolio y la colección: diálogo con el enlace de la página en
  su vista limpia y un botón para copiarlo.
- Botón "?" ("Acerca de") en la franja superior: versión de la aplicación y de la base de datos con sus fechas, el
  autor y el manual del fotógrafo en un diálogo. Nueva ruta `GET /api/acerca-de`.
- "Editar cuenta" (`/perfil/cuenta`) desde "Mi perfil": nombre de usuario, contraseña (pide la actual y cierra las
  demás sesiones) y tema preferido, todo con un único "Guardar cambios" (`PUT /api/perfil/cuenta`, o todo o nada).
- **Tres estados de visibilidad** para portfolios y colecciones: visible, bloqueado (se ve con un candado pero no se
  puede entrar: 403 `accesoRestringido` y sus fotos no se sirven) y oculto. Se eligen con un selector de tres iconos
  en las páginas de gestión. La API acepta `{ visibilidad }`, sigue aceptando `{ visible }` y sigue devolviendo
  `visible`.
- **Fotos con marco**: "Con marco / Sin marco" en la franja superior de las páginas de colección (borde blanco en el
  tema oscuro y negro en el claro, en las miniaturas y en el visor).
- **Metadatos EXIF**: la foto AVIF guardada conserva su EXIF salvo la ubicación GPS; el EXIF completo (con GPS) se
  guarda en la BD y la API da con cada foto un resumen sin la ubicación.
- Aviso "Fotos subidas" al terminar una tanda de subidas sin errores.

### Cambiado

- Las fotos conservan su perfil de color RGB (Display P3, Adobe RGB…) en vez de pasarse a sRGB, también en las
  miniaturas.
- Las tarjetas de portfolio muestran su nombre sobre la portada, muy tenue; la descripción va justificada y en
  cursiva.
- "Mi perfil": la sección del fotógrafo se llama "Datos personales y preferencias", y la contraseña ya no se cambia en
  el formulario del fotógrafo (se cambia en "Editar cuenta").
- Se quita la página "Configuración": el tema se elige en "Editar cuenta" (`PUT /api/perfil/preferencias` se
  mantiene). La web deja de mostrar los tags.
- Al renombrar un fotógrafo, un portfolio o una colección, sus miniaturas se mueven con la carpeta en vez de borrarse
  (antes la cuadrícula tardaba en cargar después de renombrar).

### Corregido

- El menú del usuario no se actualizaba al cambiar el nombre informal.
- Un error inesperado del servidor aparecía en la web como "No se ha podido conectar con el servidor": ahora responde
  500 con el mensaje en JSON.
- En Windows, renombrar o eliminar una carpeta en uso daba un error genérico: ahora se reintenta y, si sigue en uso,
  se rechaza con la regla `CARPETA_EN_USO` (sin cambiar la BD).
- En el móvil, la franja superior se salía de la pantalla.

### Notas de despliegue

- El esquema de la base de datos pasa de la versión 17 a la 19 (17 -> 18: metadatos de las fotos; 18 -> 19:
  visibilidad de tres estados). Se migra solo al arrancar, conservando los datos, pero conviene hacer antes una copia
  de `portfolio.db` (ver "Copias de seguridad" en `CLAUDE.md`). Una vez migrada, una versión anterior ya no la abre.
- Después, como siempre: `docker compose pull && docker compose up -d`.
- Las fotos ya subidas no recuperan su EXIF ni su perfil de color (su original no se conservó).

## [2.3.1] - 2026-10-07

### Añadido

- Documentación: manuales de usuario y del fotógrafo con capturas (el del fotógrafo, también en su propia página,
  `docs/manual-del-fotografo.html`).

### Corregido

- **En Docker, los datos de la aplicación (base de datos, logos, miniaturas y fotos de perfil) se guardaban dentro
  del contenedor** (`/app/contenido/datos`, sin montar) en vez de en `/app/datos`, donde se monta `DATOS_PATH`: se
  perdían al recrear el contenedor (`docker compose pull && docker compose up -d`) y no entraban en las copias de la
  carpeta del NAS. Fallo de la 2.3.0; el Dockerfile fija ahora `DATOS_DIR=/app/datos`.
- La guía de instalación en un NAS UGREEN corresponde a la 2.3.1 e indica qué apartados son solo para instalaciones
  antiguas.

### Notas de despliegue

- **Si la instalación está en la 2.3.0 con `DATOS_PATH`**, los datos actuales están dentro del contenedor y al
  actualizar se recrea: hay que sacarlos antes del `pull`.
  1. `docker compose stop backend`
  2. `docker compose cp backend:/app/contenido/datos/. <DATOS_PATH>/`
  3. `docker compose pull && docker compose up -d`

  Si se instaló desde cero con la 2.3.0, la carpeta `contenido/datos` del NAS está vacía o solo tiene subcarpetas.
  Si los datos venían de la 2.2.0, en ella está la BD de entonces (sin los cambios hechos con la 2.3.0), y lo
  copiado del contenedor la sustituye.
- Sin `DATOS_PATH` (volumen `datos-internos`) o desde la 2.2.0 o anteriores: solo
  `docker compose pull && docker compose up -d`.

## [2.3.0] - 2026-10-07

### Añadido

- `npm run fotos:convertir` (en Docker, `node dist/scripts/convertir-fotos.js`): convierte a AVIF las fotos guardadas
  en su formato original y borra las originales.
- Guía de instalación en un NAS UGREEN en la documentación técnica (`docs/tecnica/instalacion-nas-ugreen.md`).

### Cambiado

- **Las fotos se guardan en AVIF y la original no se conserva**: al subirla, cada foto se convierte a AVIF de alta
  resolución (3840 px de lado largo como máximo, calidad 80, sin metadatos: EXIF ni ubicación GPS) y se guarda con su
  nombre y la extensión `.avif` ("Playa.jpg" -> "Playa.avif"). Para las cuadrículas y portadas hay una miniatura AVIF
  de 960 px (calidad 75); el visor muestra la foto a pantalla completa. Calidades elegidas comparando al 100 % con las
  originales, también fotos con mucho grano: no se aprecian diferencias. Con las fotos de prueba (311 JPEG ya
  exportados a 3840 px, con mucho grano), el espacio pasa de 280 MB a 105 MB, más 13 MB de miniaturas; con fotos directas de cámara el
  ahorro es mucho mayor. Subir una foto tarda unos segundos más (se convierte en el momento).
- Ya no se generan las miniaturas JPEG de 480, 960, 1600 y 2400 px (`?ancho=` admite 960 y 3840).
- **Carpeta `contenido`**: las carpetas de fotos y de datos van juntas dentro de una carpeta `contenido`, en el NAS
  (`<proyecto>/contenido/fotos` y `<proyecto>/contenido/datos`; ver `.env.example`) y en desarrollo
  (`backend/contenido/fotos` y `backend/contenido/datos`, que sustituyen a `backend/datos` y `backend/datos/fotos`).

### Notas de despliegue

- **Convertir las fotos existentes, que borra las originales**: antes, copia de seguridad de las carpetas de fotos y
  de datos. Después, con la versión nueva en marcha: `docker compose exec backend node dist/scripts/convertir-fotos.js`
  (en desarrollo, `npm run fotos:convertir`). Tarda unos segundos por foto; si se interrumpe, se vuelve a ejecutar.
  Hasta entonces las fotos antiguas se siguen viendo (su versión grande se genera aparte la primera vez).
- Al arrancar, el backend borra de `datos/miniaturas` lo que ya no se usa (los JPEG de versiones anteriores).
- **Mover las carpetas a `contenido`** (opcional en el NAS: las rutas salen de `FOTOS_PATH` y `DATOS_PATH`, así que
  la instalación sigue funcionando sin moverlas): `docker compose down`, `mkdir contenido`, `mv fotos datos contenido/`,
  cambiar las dos rutas en `.env` y `docker compose up -d`. Ver "Pasar a la carpeta contenido" en la guía del NAS.
- En desarrollo, mover `backend/datos` a `backend/contenido/datos` y `backend/datos/fotos` a `backend/contenido/fotos`
  **con el backend parado** (si no, al no encontrar la base de datos crea una nueva vacía).

## [2.2.0] - 2026-10-06

### Cambiado

- **Carpeta de datos en el NAS**: la base de datos, los logos, las miniaturas y las fotos de perfil pueden ir en una
  carpeta del NAS (`DATOS_PATH` en `.env`, montada en `/app/datos`) junto a la de fotos, en lugar del volumen interno
  de Docker. Así una copia o instantánea de la carpeta del proyecto guarda a la vez la base de datos y las fotos, y
  `docker compose down -v` ya no la borra. Sin `DATOS_PATH` todo sigue como antes (volumen `datos-internos`).

### Notas de despliegue

- Para pasar una instalación existente a la carpeta: `docker compose stop backend`,
  `docker compose cp backend:/app/datos/. /volume1/docker/portfolio-fotografico/datos/`, añadir `DATOS_PATH` al `.env`
  y `docker compose up -d`. Comprobado que todo está bien, el volumen antiguo se puede borrar.

## [2.1.0] - 2026-10-06

### Añadido

- **Visibilidad** de portfolios y colecciones: se pueden ocultar a los demás usuarios con el ojo de "Gestionar
  portfolios" y "Gestionar colecciones". Lo oculto solo lo ven su fotógrafo y el administrador (marcado como
  "Oculto"); para los demás no aparece en listados, totales, búsquedas por tag ni portadas, su página responde 404 y
  sus fotos no se sirven en `/photos`. Un portfolio oculto oculta todas sus colecciones. Nuevas rutas
  `PUT …/portfolios/:portfolio/visibilidad` y `PUT …/colecciones/:coleccion/visibilidad`; la API devuelve `visible`.
- Al fallar el envío de un formulario (registro, fotógrafo, portfolio, colección, primer uso o contraseña del
  administrador), la página se desplaza sola hasta el aviso con el error.
- Documentación funcional en `docs/` (casos de uso y reglas de negocio, primera versión incompleta) y el agente
  `documentador` de Claude Code que la mantiene.

### Notas de despliegue

- Esquema 17 de la base de datos (columna `visible` en `portfolios` y `colecciones`): la migración se aplica sola al
  arrancar y deja todo visible.

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

[2.5.0]: https://github.com/sestevez5/portoliosfotograficos/releases/tag/v2.5.0
[2.4.0]: https://github.com/sestevez5/portoliosfotograficos/releases/tag/v2.4.0
[2.3.1]: https://github.com/sestevez5/portoliosfotograficos/releases/tag/v2.3.1
[2.3.0]: https://github.com/sestevez5/portoliosfotograficos/releases/tag/v2.3.0
[2.2.0]: https://github.com/sestevez5/portoliosfotograficos/releases/tag/v2.2.0
[2.1.0]: https://github.com/sestevez5/portoliosfotograficos/releases/tag/v2.1.0
[2.0.0]: https://github.com/sestevez5/portoliosfotograficos/releases/tag/v2.0.0
[1.0.0]: https://github.com/sestevez5/portoliosfotograficos/releases/tag/v1.0.0

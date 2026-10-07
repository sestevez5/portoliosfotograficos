# Instalación en un NAS UGREEN

Guía paso a paso para instalar, actualizar y mantener la aplicación en un NAS UGREEN con UGOS Pro y Docker. Para
quien administra el NAS: no hace falta el código fuente ni saber programar, pero sí entrar por SSH y escribir
algunos comandos.

Corresponde a la versión 2.3.1 de la aplicación, a 7 de octubre de 2026. Para una instalación nueva bastan los
apartados "Requisitos", "Estructura de carpetas" e "Instalación"; los apartados "Pasar a la carpeta contenido",
"Pasar del volumen interno a la carpeta del NAS" y "Convertir las fotos a AVIF" son solo para instalaciones hechas
con versiones anteriores.

**Usa la versión 2.3.1 o posterior.** En la 2.3.0 la base de datos no se guardaba en la carpeta `contenido/datos` del
NAS sino dentro del contenedor, y se perdía al actualizar.

## Qué se instala

La aplicación son dos contenedores Docker que se descargan ya construidos de GitHub Container Registry (GHCR):

| Contenedor | Imagen | Qué hace |
|---|---|---|
| `frontend` | `ghcr.io/sestevez5/portoliosfotograficos-frontend:latest` | Sirve la web (nginx) y reenvía `/api/` y `/photos/` al backend. Es el único que publica un puerto en el NAS. |
| `backend` | `ghcr.io/sestevez5/portoliosfotograficos-backend:latest` | API, base de datos SQLite, fotos, miniaturas y logos. Solo es accesible desde el `frontend`. |

En el NAS solo hacen falta tres cosas: el fichero `docker-compose.yml` del repositorio, un fichero `.env` con la
configuración y dos carpetas, una para las fotos y otra para los datos de la aplicación.

Las imágenes se publican para procesadores x86-64 (Intel/AMD), que es lo que llevan los NAS UGREEN de la serie DXP.

## Requisitos

- NAS UGREEN con UGOS Pro y un volumen de almacenamiento creado (en esta guía, `/volume1`).
- Una cuenta de administrador del NAS.
- La aplicación **Docker** instalada desde el Centro de aplicaciones de UGOS Pro.
- Un ordenador en la misma red, con un cliente SSH (en Windows, la terminal o PowerShell ya lo traen: comando
  `ssh`).
- Si las imágenes de GHCR son privadas, un token de GitHub con el permiso `read:packages` (ver "Acceso a las
  imágenes").

## Estructura de carpetas

Todo va en una carpeta del proyecto dentro de la carpeta compartida `docker` que crea la aplicación Docker. El
contenido de la aplicación va en su carpeta `contenido`, con dos carpetas hermanas:

| Ruta en el NAS | Contenido |
|---|---|
| `/volume1/docker/portfolio-fotografico/` | `docker-compose.yml` y `.env` |
| `/volume1/docker/portfolio-fotografico/contenido/fotos/` | Fotos de las colecciones, en AVIF: `<fotógrafo>/<portfolio>/<colección>/<fichero>` (`FOTOS_PATH`) |
| `/volume1/docker/portfolio-fotografico/contenido/datos/` | Datos internos: base de datos (`BD/portfolio.db`), `logos/`, `miniaturas/` y `avatares/` (`DATOS_PATH`) |

Las carpetas `fotos` y `datos` van juntas a propósito, dentro de `contenido`: una instantánea o una copia de esa
carpeta guarda a la vez la base de datos y las fotos, que tienen que corresponderse. La de datos **no** va dentro de
la de fotos.

Las dos tienen que poder escribirse desde el contenedor: la aplicación crea, renombra y borra carpetas de fotos, y
escribe la base de datos y las miniaturas. El backend se ejecuta como `root` dentro del contenedor, así que basta con
crearlas como se indica abajo.

## Instalación

### 1. Activar SSH

1. En UGOS Pro, abre **Panel de control → Terminal** y activa **SSH** (puerto 22 por defecto).
2. Desde el ordenador, conéctate con una cuenta de administrador: `ssh <usuario>@<ip-del-nas>`.

Todos los comandos de Docker se ejecutan con `sudo` (pide la contraseña de esa cuenta).

### 2. Crear las carpetas

1. Crea la carpeta del proyecto y, dentro de `contenido`, las de fotos y datos:
   `sudo mkdir -p /volume1/docker/portfolio-fotografico/contenido/fotos /volume1/docker/portfolio-fotografico/contenido/datos`
2. Entra en ella: `cd /volume1/docker/portfolio-fotografico`

También se pueden crear desde el gestor de archivos de UGOS Pro, dentro de la carpeta compartida `docker`.

### 3. Copiar docker-compose.yml y crear .env

1. Copia a la carpeta del proyecto el fichero `docker-compose.yml` de la raíz del repositorio (rama `main`). Puedes
   subirlo con el gestor de archivos de UGOS Pro o descargarlo directamente en el NAS:
   `sudo wget -O docker-compose.yml https://raw.githubusercontent.com/sestevez5/portoliosfotograficos/main/docker-compose.yml`
   (si el repositorio es privado, súbelo con el gestor de archivos). **No** copies `docker-compose.override.yml`:
   solo sirve para construir las imágenes en el equipo de desarrollo.
2. Crea en la misma carpeta el fichero `.env` (puedes partir de `.env.example` del repositorio) con estas variables:

| Variable | Valor en el NAS | Para qué sirve |
|---|---|---|
| `FOTOS_PATH` | `/volume1/docker/portfolio-fotografico/contenido/fotos` | Carpeta de las fotos. Obligatoria: sin ella el `backend` no arranca. |
| `DATOS_PATH` | `/volume1/docker/portfolio-fotografico/contenido/datos` | Carpeta de la base de datos, logos, miniaturas y fotos de perfil. Si se deja sin definir, estos datos van en un volumen interno de Docker (`datos-internos`), que no se ve en el NAS ni entra en sus copias. En el NAS, defínela siempre. |
| `FRONTEND_PORT` | `8080` (o cualquier puerto libre del NAS) | Puerto por el que se abre la web. |

Cada variable va en una línea, con el formato `NOMBRE=valor` y sin espacios alrededor del `=`. Para editarlo por
SSH: `sudo vi .env` (o `sudo nano .env` si está disponible).

### 4. Acceso a las imágenes

Si los paquetes de GHCR son públicos, no hay que hacer nada. Si son privados, inicia sesión una sola vez en el NAS:

1. En GitHub, crea un token clásico (**Settings → Developer settings → Personal access tokens**) con el permiso
   `read:packages`.
2. En el NAS: `sudo docker login ghcr.io -u <usuario-de-github>` y, como contraseña, pega el token.

Docker guarda la credencial y no hace falta repetirlo en cada actualización.

### 5. Descargar y arrancar

Desde la carpeta del proyecto:

1. `sudo docker compose pull` — descarga las dos imágenes.
2. `sudo docker compose up -d` — crea y arranca los contenedores. El `frontend` espera a que el `backend` esté sano.
3. `sudo docker compose ps` — los dos deben aparecer en marcha y el `backend` como `healthy`.

Si `docker compose` no existe, prueba con `docker-compose` (versión antigua del comando).

Los contenedores llevan `restart: unless-stopped`: vuelven a arrancar solos al reiniciar el NAS. Una vez creados,
también aparecen en la aplicación Docker de UGOS Pro, desde donde se pueden ver, parar, arrancar y consultar sus
registros.

### 6. Primer uso

1. Abre `http://<ip-del-nas>:8080` (o el puerto que hayas puesto en `FRONTEND_PORT`).
2. La primera vez la web muestra la bienvenida del administrador: entra con el usuario `admin` y la contraseña
   `admin`, y cámbiala ahí mismo (después, en `/admin/contrasenya`).
3. La base de datos empieza vacía: los fotógrafos se dan de alta registrándose desde la web.

## Actualizar a una versión nueva

Cada versión publicada en `main` genera imágenes nuevas con la etiqueta `latest`. Para instalarla:

1. Lee la entrada de la versión en `CHANGELOG.md`, sobre todo sus **Notas de despliegue**.
2. Haz una copia de seguridad (ver abajo).
3. En la carpeta del proyecto: `sudo docker compose pull` y después `sudo docker compose up -d`.

Los datos se conservan: están en las carpetas del NAS, no en los contenedores. Si la versión cambia el esquema de la
base de datos, la migración se aplica sola al arrancar el `backend`.

Si una versión trae cambios en `docker-compose.yml` o en las variables de `.env`, sus notas de despliegue lo dicen:
copia el `docker-compose.yml` nuevo antes de `pull`.

## Convertir las fotos a AVIF (desde la versión con fotos en AVIF)

Desde esa versión las fotos se guardan en AVIF de alta resolución y la original no se conserva. Las fotos subidas antes
siguen en su formato hasta que se convierten. La conversión **borra las originales**, así que primero haz una copia de
seguridad (ver abajo) y después, en la carpeta del proyecto:

1. `sudo docker compose exec backend node dist/scripts/convertir-fotos.js`

Tarda unos segundos por foto y al final muestra cuánto ocupaban antes y cuánto ahora. Se puede hacer con la aplicación
en marcha y, si se interrumpe, basta con repetirlo: solo convierte las que faltan.

## Copias de seguridad

- **Lo más sencillo y seguro**: una instantánea de la carpeta compartida `docker` (o de la carpeta `contenido`) con
  la función de instantáneas de UGOS Pro. Copia a la vez la base de datos (con su fichero `-wal`) y las fotos, de
  forma coherente, aunque la aplicación esté en marcha.
- **Copia de ficheros**: copiar `contenido/datos/` con la aplicación en marcha **no es seguro** (con WAL,
  `portfolio.db` sola puede estar incompleta). Para el backend antes (`sudo docker compose stop backend`), copia la
  carpeta `contenido` entera y vuelve a arrancarlo (`sudo docker compose start backend`).
- **Copia en caliente solo de la base de datos**:
  `sudo docker compose exec backend node -e "require('better-sqlite3')('datos/BD/portfolio.db').backup('datos/BD/copia.db').then(() => console.log('ok'))"`
  deja la copia en `contenido/datos/BD/copia.db`, visible en el NAS.

Las miniaturas (`contenido/datos/miniaturas/`) y los logos no hace falta guardarlos: se regeneran solos cuando se piden.

## Cargar datos existentes

**Una base de datos de otra instalación.** Con el backend parado (`sudo docker compose stop backend`), copia
`portfolio.db` a `contenido/datos/BD/` y su carpeta de fotos a `contenido/fotos/`, y arráncalo (`sudo docker compose start backend`).
Copia solo `portfolio.db`, sin los ficheros `-wal` y `-shm`, después de haber parado la instalación de origen para que
el WAL se consolide.

**Un catálogo en JSON.** Copia antes las fotos a `contenido/fotos/` con los nombres de carpeta normalizados (sin mayúsculas,
tildes ni espacios) y después:

1. `sudo docker compose cp catalogo.json backend:/tmp/catalogo.json`
2. `sudo docker compose exec backend node dist/scripts/importar-json.js /tmp/catalogo.json --anyadir`

Sin `--anyadir` solo se importa si la base de datos está vacía; con `--reemplazar` se borra antes todo el catálogo
(se conserva el administrador). Haz una copia de seguridad antes.

## Pasar a la carpeta contenido

Las instalaciones hechas con versiones anteriores tienen las carpetas `fotos` y `datos` directamente en la carpeta
del proyecto. Para llevarlas a `contenido`, desde la carpeta del proyecto:

1. `sudo docker compose down` (para los contenedores; los datos no se borran)
2. `sudo mkdir contenido`
3. `sudo mv fotos datos contenido/`
4. En el `.env`, cambia las rutas: `FOTOS_PATH=/volume1/docker/portfolio-fotografico/contenido/fotos` y `DATOS_PATH=/volume1/docker/portfolio-fotografico/contenido/datos`.
5. `sudo docker compose up -d`

Si alguna de las dos no existe (por ejemplo, porque los datos estaban aún en el volumen interno), mueve solo la que
haya y sigue el apartado siguiente para la otra.

## Pasar del volumen interno a la carpeta del NAS

Las instalaciones anteriores a la 2.2.0 guardaban los datos en el volumen interno `datos-internos`. Para llevarlos a
la carpeta `contenido/datos/`:

1. `sudo docker compose stop backend`
2. `sudo mkdir -p /volume1/docker/portfolio-fotografico/contenido/datos`
3. `sudo docker compose cp backend:/app/datos/. /volume1/docker/portfolio-fotografico/contenido/datos/`
4. Añade `DATOS_PATH=/volume1/docker/portfolio-fotografico/contenido/datos` al `.env`.
5. `sudo docker compose up -d`

Cuando hayas comprobado que todo está bien, el volumen antiguo se puede borrar desde la aplicación Docker de UGOS Pro
o con `sudo docker volume rm portfolio-fotografico_datos-internos` (el prefijo es el nombre de la carpeta del
proyecto; `sudo docker volume ls` lo muestra).

## Problemas frecuentes

| Síntoma | Causa probable y solución |
|---|---|
| `Falta FOTOS_PATH en .env` al arrancar | El `.env` no está en la carpeta desde la que se ejecuta `docker compose`, o le falta la variable. |
| `denied` o `unauthorized` al hacer `pull` | Las imágenes son privadas: haz `sudo docker login ghcr.io` con un token con `read:packages`. |
| El puerto ya está en uso | Otro servicio del NAS usa `FRONTEND_PORT`: cambia el valor en `.env` y repite `sudo docker compose up -d`. |
| El `backend` no llega a `healthy` | Mira su registro: `sudo docker compose logs backend`. Si dice que la base de datos es de otra versión, se ha cargado una BD anterior a la versión 15 del esquema o de una versión más nueva de la aplicación. |
| La web carga pero las fotos no se ven | Las carpetas de `fotos/` no coinciden con los nombres de la base de datos (fotógrafo, portfolio y colección normalizados). Al arrancar, el registro del backend avisa de los fotógrafos sin carpeta. |
| Error al subir fotos o al crear portfolios | La carpeta de fotos no se puede escribir desde el contenedor: revisa sus permisos en UGOS Pro. |

## Seguridad

La aplicación está pensada para la red local. Antes de publicarla en Internet (redirección de puertos, proxy inverso
o similar) hay que servirla por **https** —la cookie de sesión solo lleva `Secure` con https, y la cámara de la foto
de perfil lo exige— y cambiar la contraseña del administrador. El CORS de la API acepta hoy cualquier origen.

# Instalación en un NAS UGREEN

Guía paso a paso para instalar, actualizar y mantener la aplicación en un NAS UGREEN con UGOS Pro y Docker. Para
quien administra el NAS: no hace falta el código fuente ni saber programar. Se puede instalar de dos formas:

- **Con la interfaz de la aplicación Docker de UGOS Pro** (apartado "Instalación con la aplicación Docker"): todo
  desde el navegador, sin escribir comandos.
- **Por SSH** (apartado "Instalación por SSH"): con algunos comandos en una terminal. Es la forma que se usa en el
  resto de la guía para las tareas de mantenimiento menos habituales.

Las dos dejan la aplicación igual y se pueden combinar: lo instalado con una se puede gestionar después con la otra.

Corresponde a la versión 2.3.1 de la aplicación, a 7 de octubre de 2026. Para una instalación nueva bastan los
apartados "Requisitos", "Estructura de carpetas", uno de los dos de instalación y "Primer uso"; los apartados "Pasar a la carpeta contenido",
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
- Un ordenador en la misma red, con un navegador. Solo para la instalación por SSH, además, un cliente SSH (en
  Windows, la terminal o PowerShell ya lo traen: comando `ssh`).
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

## Instalación con la aplicación Docker

Todo se hace desde UGOS Pro, en el navegador. Los nombres de los menús pueden variar un poco según la versión de
UGOS Pro y de su aplicación Docker.

### 1. Crear las carpetas

1. Abre el **Gestor de archivos** de UGOS Pro y entra en la carpeta compartida `docker`.
2. Crea la carpeta `portfolio-fotografico`; dentro de ella, la carpeta `contenido`, y dentro de `contenido`, las
   carpetas `fotos` y `datos`.

Debe quedar como en "Estructura de carpetas": `docker/portfolio-fotografico/contenido/fotos` y
`docker/portfolio-fotografico/contenido/datos`.

### 2. Acceso a las imágenes

Si los paquetes de GHCR son públicos, sáltate este paso. Si son privados:

1. En GitHub, crea un token clásico (**Settings → Developer settings → Personal access tokens**) con el permiso
   `read:packages`.
2. En la aplicación Docker, busca la configuración de los registros de imágenes (en **Imagen** o en
   **Configuración**, según la versión) y añade el registro `ghcr.io` con tu usuario de GitHub como usuario y el
   token como contraseña.

Si tu versión de la aplicación Docker no permite añadir registros con credenciales, haz este paso una sola vez por
SSH (pasos 1 y 4 de "Instalación por SSH") y sigue después con la interfaz.

### 3. Crear el proyecto

En la aplicación Docker, abre **Proyecto** y pulsa **Crear**. Rellena:

1. **Nombre del proyecto**: `portfolio-fotografico` (solo minúsculas, números y guiones).
2. **Ruta de almacenamiento**: la carpeta `docker/portfolio-fotografico` creada en el paso 1. Ahí guarda la
   aplicación Docker el fichero `docker-compose.yml` del proyecto.
3. **Configuración de Compose**: elige escribirla (o pegarla) y copia este contenido completo.

```
services:
  backend:
    image: ghcr.io/sestevez5/portoliosfotograficos-backend:latest
    restart: unless-stopped
    volumes:
      - /volume1/docker/portfolio-fotografico/contenido/fotos:/app/fotos
      - /volume1/docker/portfolio-fotografico/contenido/datos:/app/datos
    networks:
      - portfolio
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/tags"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 5s

  frontend:
    image: ghcr.io/sestevez5/portoliosfotograficos-frontend:latest
    restart: unless-stopped
    ports:
      - "8080:80"
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - portfolio

networks:
  portfolio:
```

Es el `docker-compose.yml` del repositorio con las rutas y el puerto ya escritos, en lugar de tomarlos del fichero
`.env`, que la interfaz no siempre permite crear ni editar. Ajústalo si hace falta:

- Si tu volumen no es `volume1` o la carpeta del proyecto se llama de otra forma, cambia las dos rutas de `volumes`:
  solo la parte de la izquierda de los dos puntos; la de la derecha (`/app/fotos` y `/app/datos`) no se toca.
- Si el puerto 8080 está ocupado en el NAS, cambia el primer `8080` de `ports` por otro libre.
- Respeta los espacios del principio de cada línea: en este formato son significativos.

Por último, pulsa **Implementar** (o **Aceptar** y después **Iniciar**). La aplicación Docker descarga las dos
imágenes y crea y arranca los contenedores; la primera vez tarda unos minutos.

### 4. Comprobar que está en marcha

1. En **Proyecto**, `portfolio-fotografico` debe aparecer en ejecución.
2. En **Contenedor** aparecen sus dos contenedores (`portfolio-fotografico-backend-1` y
   `portfolio-fotografico-frontend-1`), los dos en marcha. Si alguno se para o se reinicia una y otra vez, ábrelo y
   mira su registro (ver "Problemas frecuentes").

Los contenedores llevan `restart: unless-stopped`: vuelven a arrancar solos al reiniciar el NAS. Sigue con "Primer
uso".

### Equivalencias con los comandos

El resto de la guía indica las tareas de mantenimiento con comandos (`sudo docker compose …`, que se escriben por
SSH en la carpeta del proyecto). Las más habituales también se hacen desde la aplicación Docker:

| Comando | En la aplicación Docker |
|---|---|
| `sudo docker compose ps` | **Proyecto** o **Contenedor**: estado de cada contenedor. |
| `sudo docker compose logs backend` | **Contenedor** → `portfolio-fotografico-backend-1` → registro. |
| `sudo docker compose stop backend` / `start backend` | **Contenedor** → `portfolio-fotografico-backend-1` → detener / iniciar. |
| `sudo docker compose down` / `up -d` | **Proyecto** → `portfolio-fotografico` → detener / iniciar. |
| `sudo docker compose exec backend <comando>` | **Contenedor** → `portfolio-fotografico-backend-1` → **Terminal**: abre una terminal dentro del contenedor, ya en su carpeta `/app`, donde se escribe `<comando>` tal cual. |
| `sudo docker compose pull` y `up -d` | Ver "Actualizar a una versión nueva". |

Lo que copia ficheros entre el contenedor y el NAS (`docker compose cp`) no tiene equivalente en la interfaz: hazlo
por SSH.

## Instalación por SSH

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
registros (ver "Equivalencias con los comandos").

## Primer uso

1. Abre `http://<ip-del-nas>:8080` (o el puerto que hayas puesto en `FRONTEND_PORT`).
2. La primera vez la web muestra la bienvenida del administrador: entra con el usuario `admin` y la contraseña
   `admin`, y cámbiala ahí mismo (después, en `/admin/contrasenya`).
3. La base de datos empieza vacía: los fotógrafos se dan de alta registrándose desde la web.

## Actualizar a una versión nueva

Cada versión publicada en `main` genera imágenes nuevas con la etiqueta `latest`. Para instalarla:

1. Lee la entrada de la versión en `CHANGELOG.md`, sobre todo sus **Notas de despliegue**.
2. Haz una copia de seguridad (ver abajo).
3. Descarga las imágenes nuevas y vuelve a crear los contenedores, por SSH o con la aplicación Docker (ver abajo).

**Por SSH**, en la carpeta del proyecto: `sudo docker compose pull` y después `sudo docker compose up -d`.

**Con la aplicación Docker**: en **Proyecto**, detén `portfolio-fotografico`; en **Imagen**, descarga de nuevo las
dos imágenes con la etiqueta `latest` (o usa la opción de actualizar la imagen, si la tiene), y vuelve a implementar
o iniciar el proyecto. Si tu versión ofrece **Reconstruir** en el proyecto, hace las tres cosas de una vez. Comprueba
en **Contenedor** que los contenedores se han creado de nuevo (su fecha de creación es la de ahora): si no, siguen
con la versión anterior.

Los datos se conservan: están en las carpetas del NAS, no en los contenedores. Si la versión cambia el esquema de la
base de datos, la migración se aplica sola al arrancar el `backend`.

Si una versión trae cambios en `docker-compose.yml` o en las variables de `.env`, sus notas de despliegue lo dicen:
copia el `docker-compose.yml` nuevo antes de `pull`. Si instalaste con la aplicación Docker, edita la configuración
de Compose del proyecto con esos cambios antes de volver a implementarlo, conservando tus rutas y tu puerto.

## Convertir las fotos a AVIF (desde la versión con fotos en AVIF)

Desde esa versión las fotos se guardan en AVIF de alta resolución y la original no se conserva. Las fotos subidas antes
siguen en su formato hasta que se convierten. La conversión **borra las originales**, así que primero haz una copia de
seguridad (ver abajo) y después, en la carpeta del proyecto:

1. `sudo docker compose exec backend node dist/scripts/convertir-fotos.js`

Con la aplicación Docker, abre la **Terminal** del contenedor `portfolio-fotografico-backend-1` y escribe
`node dist/scripts/convertir-fotos.js`.

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
  deja la copia en `contenido/datos/BD/copia.db`, visible en el NAS. En la **Terminal** del contenedor del backend
  de la aplicación Docker se escribe lo mismo, sin `sudo docker compose exec backend`.

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
| `Falta FOTOS_PATH en .env` al arrancar | El `.env` no está en la carpeta desde la que se ejecuta `docker compose`, o le falta la variable. Con la aplicación Docker, usa la configuración de Compose de "Instalación con la aplicación Docker", que lleva las rutas escritas. |
| La aplicación Docker no acepta la configuración de Compose | Revisa los espacios del principio de cada línea: tienen que ser espacios (no tabuladores) y estar alineados como en la guía. |
| `denied` o `unauthorized` al hacer `pull` o al implementar el proyecto | Las imágenes son privadas: haz `sudo docker login ghcr.io` con un token con `read:packages`, o añade el registro `ghcr.io` con ese token en la aplicación Docker. |
| El puerto ya está en uso | Otro servicio del NAS usa `FRONTEND_PORT`: cambia el valor en `.env` y repite `sudo docker compose up -d` (con la aplicación Docker, cambia el puerto en la configuración de Compose y vuelve a implementar el proyecto). |
| El `backend` no llega a `healthy` | Mira su registro: `sudo docker compose logs backend` (o su registro en la aplicación Docker). Si dice que la base de datos es de otra versión, se ha cargado una BD anterior a la versión 15 del esquema o de una versión más nueva de la aplicación. |
| La web carga pero las fotos no se ven | Las carpetas de `fotos/` no coinciden con los nombres de la base de datos (fotógrafo, portfolio y colección normalizados). Al arrancar, el registro del backend avisa de los fotógrafos sin carpeta. |
| Error al subir fotos o al crear portfolios | La carpeta de fotos no se puede escribir desde el contenedor: revisa sus permisos en UGOS Pro. |

## Seguridad

La aplicación está pensada para la red local. Antes de publicarla en Internet (redirección de puertos, proxy inverso
o similar) hay que servirla por **https** —la cookie de sesión solo lleva `Secure` con https, y la cámara de la foto
de perfil lo exige— y cambiar la contraseña del administrador. El CORS de la API acepta hoy cualquier origen.

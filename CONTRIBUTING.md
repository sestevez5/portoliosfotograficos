# Cómo colaborar

Guía para preparar tu entorno, montar un entorno de preproducción propio y proponer cambios. La descripción
detallada de la arquitectura (modelo de datos, API, reglas de negocio, despliegue) está en [CLAUDE.md](CLAUDE.md).

## Antes de empezar: cómo se organizan los datos

La aplicación tiene dos partes independientes: `backend/` (API en Node.js + Express + SQLite) y `frontend/`
(Angular). El catálogo vive en una base de datos SQLite y las fotos son ficheros en carpetas:

```
backend/datos/
├── BD/portfolio.db          base de datos (fotógrafos, portfolios, colecciones, fotos, tags)
├── logos/                   logos de los fotógrafos (se generan solos)
└── fotos/<fotógrafo>/<portfolio>/<colección>/<fichero>.jpg
```

**La carpeta `backend/datos` no está en el repositorio** (está en `.gitignore`). Cada entorno tiene sus propios
datos y nunca se suben a git. Al clonar, no tendrás ni fotos ni base de datos: la base de datos se crea vacía la
primera vez que arranca el backend.

Los nombres de las carpetas no se eligen a mano: son la forma "normalizada" del nombre del fotógrafo, portfolio o
colección (minúsculas, sin tildes, "ñ" → "ny", espacios → guiones). Por ejemplo, la colección "Montaña" de "Irene Castaño"
está en `fotos/irene-castanyo/<portfolio>/montanya/`. Si creas o renombras desde la web, la aplicación crea y
renombra las carpetas por ti.

## 1. Preparar el entorno de desarrollo

### Requisitos

- **Git**.
- **Node.js 22 o superior** (las imágenes Docker usan Node 22) y **npm 11**.
- **Docker** (Docker Desktop en Windows/macOS), solo para el entorno de preproducción.
- En Windows, si `npm install` del backend intentara compilar `better-sqlite3` (no suele pasar, hay binarios
  precompilados), necesitarás las Build Tools de Visual Studio con C++.

### Instalación

```bash
git clone https://github.com/sestevez5/portoliosfotograficos.git
cd portoliosfotograficos
git checkout develop

cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### Arrancar la aplicación

Hacen falta dos terminales:

```bash
# Terminal 1: API en http://localhost:3000 (recarga al guardar)
cd backend
npm run dev

# Terminal 2: web en http://localhost:4200 (recarga al guardar)
cd frontend
npm start
```

Abre http://localhost:4200. La primera vez aparece la **bienvenida del primer uso**: identifícate como administrador
con usuario `admin` y contraseña `admin` (puedes cambiarla ahí mismo o más tarde en
http://localhost:4200/admin/contrasenya). Después la aplicación estará vacía: la base de datos se acaba de crear en
`backend/datos/BD/portfolio.db`.

### Cargar datos de prueba

Tienes dos opciones:

**a) Desde la web.** Crea un fotógrafo registrándote ("Iniciar sesión" → "Regístrate") y, en su página, portfolios y colecciones. La aplicación
crea las carpetas. Todavía no se pueden subir fotos desde la web ("Gestionar fotos" aún no funciona).

**b) Con un catálogo en JSON (incluye fotos).** Coloca las imágenes en carpetas con los nombres normalizados:

```
backend/datos/fotos/ana-ejemplo/viajes/mar/01.jpg
backend/datos/fotos/ana-ejemplo/viajes/mar/02.jpg
```

Crea un fichero, por ejemplo `catalogo.json`, **fuera** de `backend/datos/fotos` (todo lo que hay ahí se sirve en la
web):

```json
[
  {
    "fotografo": {
      "nombreInformal": "Ana Ejemplo",
      "nombre": "Ana",
      "primerApellido": "Ejemplo",
      "descripcion": "Fotógrafa de prueba para desarrollo."
    },
    "portfolios": [
      {
        "nombre": "Viajes",
        "colecciones": [
          {
            "nombre": "Mar",
            "tags": ["costa"],
            "fotos": [
              { "nombreFichero": "01.jpg", "orden": 1 },
              { "nombreFichero": "02.jpg", "orden": 2 }
            ]
          }
        ]
      }
    ]
  }
]
```

E impórtalo:

```bash
cd backend
npm run db:importar -- ../catalogo.json             # con la base de datos vacía
npm run db:importar -- ../catalogo.json --anyadir   # si ya tiene datos, lo añade
```

La importación comprueba las mismas reglas que la web (nombres repetidos, etc.) y, si alguna falla, no guarda nada.
Las carpetas tienen que existir ya con el nombre normalizado ("Ana Ejemplo" → `ana-ejemplo`, "Viajes" → `viajes`).

### Usar otra carpeta de datos

Por defecto el backend usa `backend/datos`. Para trabajar con otra (p. ej. una copia de datos reales para
reproducir un fallo, sin tocar la tuya), indica la variable `DATOS_DIR` al arrancar:

```bash
cd backend
DATOS_DIR=../../datos-copia npm run dev                  # bash, macOS, Linux, Git Bash
$env:DATOS_DIR="..\..\datos-copia"; npm run dev          # PowerShell
```

Dentro de esa carpeta se usan las mismas subcarpetas `BD/`, `fotos/` y `logos/`. El frontend en desarrollo siempre
llama a la API en `localhost:3000`, así que solo puede haber un backend de desarrollo a la vez.

### Comprobar tus cambios

Antes de proponer un cambio, todo esto debe pasar:

```bash
cd backend
npm run typecheck
npm test

cd ../frontend
npx ng test --watch=false
npm run build
```

Los tests del backend usan siempre una carpeta de datos temporal: nunca tocan tu base de datos.

## 2. Entorno de preproducción

La preproducción ejecuta la aplicación **igual que en producción** (el NAS): con Docker, detrás de nginx, con un único
puerto y las imágenes construidas desde tu código. Tiene **su propia base de datos y su propia carpeta de fotos**,
separadas de las de desarrollo y de las de cualquier otro entorno.

En Docker los datos se reparten así:

| Datos | Dónde |
|---|---|
| Fotos | Una carpeta de tu equipo que tú eliges (`FOTOS_PATH`), montada en el contenedor |
| Base de datos, logos, miniaturas y fotos de perfil | Un volumen interno de Docker, propio de cada entorno (en el NAS, en cambio, una carpeta: `DATOS_PATH`) |

### Configuración

En la raíz del repositorio crea el fichero `.env.pre` (no se sube a git) a partir de `.env.example`:

```bash
# .env.pre
COMPOSE_PROJECT_NAME=portfolio-pre
FOTOS_PATH=C:/portfolio-pre/fotos
FRONTEND_PORT=8081
```

- `COMPOSE_PROJECT_NAME` separa este entorno de cualquier otro: sus contenedores y su volumen de datos se llaman
  `portfolio-pre_…`, así que su base de datos no se mezcla con ninguna otra.
- `FOTOS_PATH` es la ruta absoluta de la carpeta de fotos de preproducción. Créala antes (puede estar vacía) y no uses
  la de desarrollo (`backend/datos/fotos`): la preproducción crea, renombra y borra carpetas dentro.
- `DATOS_PATH` no se define en preproducción: sin ella los datos van en el volumen interno. En Windows es lo
  recomendable, porque SQLite en modo WAL no es fiable sobre una carpeta de Windows montada en Docker Desktop. En el
  NAS sí se define (carpeta junto a la de fotos; ver `.env.example`).
- `FRONTEND_PORT` es el puerto por el que abrirás la web (distinto del 4200 de desarrollo y de otros entornos).

### Arrancar, parar y actualizar

Todos los comandos llevan `--env-file .env.pre`:

```bash
docker compose --env-file .env.pre up -d --build   # construye las imágenes con tu código y arranca
docker compose --env-file .env.pre ps              # estado de los contenedores
docker compose --env-file .env.pre logs -f backend # registro del backend
docker compose --env-file .env.pre down            # parar (los datos se conservan)
```

Abre http://localhost:8081 (la primera vez, bienvenida con `admin` / `admin`, igual que en desarrollo). Para probar una versión nueva de tu código, repite `up -d --build`: la base de datos y las
fotos se conservan.

> `docker compose --env-file .env.pre down -v` **borra la base de datos de preproducción** (el volumen). Úsalo solo
> si quieres empezar de cero.

### Cargar datos en preproducción

La base de datos de preproducción empieza vacía. Puedes:

**a) Usarla desde la web**, igual que en desarrollo.

**b) Importar un catálogo en JSON.** Copia las fotos a `FOTOS_PATH` con los nombres normalizados y después:

```bash
docker compose --env-file .env.pre cp catalogo.json backend:/tmp/catalogo.json
docker compose --env-file .env.pre exec backend node dist/scripts/importar-json.js /tmp/catalogo.json --anyadir
```

**c) Partir de una base de datos existente** (p. ej. la de tu desarrollo), junto con su carpeta de fotos:

1. Para el backend de desarrollo (`npm run dev`) para que la base de datos quede completa en `portfolio.db`.
2. Copia `backend/datos/fotos` a la carpeta `FOTOS_PATH`.
3. Carga la base de datos en el volumen:

```bash
docker compose --env-file .env.pre stop backend
docker compose --env-file .env.pre cp backend/datos/BD/portfolio.db backend:/app/datos/BD/portfolio.db
docker compose --env-file .env.pre start backend
```

Copia solo `portfolio.db`, no los ficheros `-wal`/`-shm`. Los logos no hace falta copiarlos: se regeneran solos.

### Probar las imágenes publicadas

Por defecto `up --build` construye las imágenes con tu código. Para probar exactamente las publicadas en GitHub
Container Registry (las que usa el NAS), ignora `docker-compose.override.yml`:

```bash
docker compose -f docker-compose.yml --env-file .env.pre pull
docker compose -f docker-compose.yml --env-file .env.pre up -d
```

### Importante

La aplicación **todavía no tiene autenticación**: cualquiera que abra la web puede crear, modificar o borrar
fotógrafos con todas sus fotos. No publiques el entorno de preproducción fuera de tu red local.

## 3. Flujo de trabajo con git

- `main` solo recibe versiones publicadas (cada push a `main` publica las imágenes Docker que usa el NAS). **No
  trabajes ni hagas push directamente en `main`.**
- El desarrollo se integra en `develop`. Crea tu rama a partir de ella:

```bash
git checkout develop
git pull
git checkout -b feature/descripcion-corta
```

- Haz commits pequeños con mensajes en español, en presente y describiendo el cambio ("Añade el formulario de
  colecciones", "Corrige el orden de las fotos").
- Cuando esté listo y pasen las comprobaciones, sube la rama y abre un pull request **contra `develop`**.
- Si tu cambio es visible para el usuario, añade una línea en `CHANGELOG.md`, sección "Sin publicar".
- Nunca subas datos: ni fotos, ni bases de datos, ni ficheros `.env`/`.env.pre`.

## 4. Convenciones del código

- Todo en español: nombres de variables, funciones, rutas, comentarios y mensajes (la API usa el mismo vocabulario
  que la base de datos).
- Lo que la aplicación no permite ("dos portfolios con el mismo nombre") es una **regla de negocio**: se define en
  `backend/src/reglas/catalogo.ts`, se comprueba en `validaciones.ts` y lleva su test. No valides reglas sueltas por
  el código.
- Cualquier operación que cambie la base de datos y las carpetas lo hace en la misma transacción (ver los servicios de
  `backend/src/services/`).
- `normalizarNombre()` está duplicada en backend y frontend a propósito: si cambias una, cambia la otra.
- El frontend no usa librerías de componentes: estilos propios en SCSS, junto a cada componente, con los tokens de
  `frontend/src/styles.scss`.

Para todo lo demás, consulta [CLAUDE.md](CLAUDE.md).

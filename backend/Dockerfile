# --- Etapa de build (solo compila TypeScript) ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts: para compilar con tsc no hace falta el binario nativo de better-sqlite3
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- Dependencias de producción ---
# better-sqlite3 es un módulo nativo: si no hay binario precompilado para la plataforma
# (p. ej. un NAS ARM) se compila, y para eso hacen falta python3, make y g++. Se instalan
# solo en esta etapa para que no acaben en la imagen final.
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Etapa de ejecución ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Fuentes usadas para generar los logos de los fotógrafos
COPY assets ./assets

# backend/datos se monta como volumen externo (fotos, logos, base de datos SQLite y el
# organizacionFotos.json del que se importa el catálogo si la base de datos está vacía)
EXPOSE 3000
CMD ["node", "dist/index.js"]

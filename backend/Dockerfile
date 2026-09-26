# --- Etapa de build ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Etapa de ejecución ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
# Fuentes usadas para generar los logos de los fotógrafos
COPY assets ./assets

# backend/datos se monta como volumen externo (fotos + organizacionFotos.json)
EXPOSE 3000
CMD ["node", "dist/index.js"]

# Dockerfile para DiagramaServers (multi-stage, Fase 4.1 / OPS-MED-04)
#
#   deps      -> instala todo (incluye CLI de prisma) y genera Prisma Client
#   prod-deps -> node_modules solo de producción + el cliente generado
#   runtime -> imagen final: sin compiladores, sin scripts/, código propiedad de root (solo lectura
#              para el usuario nodejs); solo uploads/, data/ y logs/ son escribibles
#   tools   -> runtime + scripts/ (CLI de administración, p. ej. manage-users.js). No se usa para
#              servir la app: se ejecuta bajo demanda con `docker compose run --rm tools ...`
#
# El último stage (app) es el que se construye por defecto.

# ---------- 1) Dependencias ----------
FROM node:22-alpine AS deps

# Herramientas para compilar módulos nativos (bcrypt) SOLO en esta etapa
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
COPY backend/prisma/ ./backend/prisma/

# Instala TODO (incluye el CLI de prisma fijado en package-lock) para generar el cliente
RUN npm ci --no-audit --no-fund

# Generar Prisma Client (la URL es ficticia: generate no se conecta a la BD)
RUN DATABASE_URL="postgresql://user:pass@localhost:5432/db" \
    npx prisma generate --schema=backend/prisma/schema.prisma

# ---------- 1b) Dependencias de producción ----------
# Instalación limpia SIN devDependencies, peers ni opcionales (el CLI de prisma entra como
# peer opcional de @prisma/client y arrastra Studio/React: cientos de MB sin uso en producción;
# los únicos opcionales reales son fsevents (macOS) y pg-cloudflare (Workers)).
# Solo se copia el cliente ya generado en la etapa anterior.
FROM node:22-alpine AS prod-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --omit=peer --omit=optional --no-audit --no-fund && npm cache clean --force
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma

# ---------- 2) Runtime ----------
FROM node:22-alpine AS runtime

# iputils: ping real para los checks ICMP (funciona sin root gracias a
# net.ipv4.ping_group_range definido en docker-compose.yml)
RUN apk add --no-cache iputils

ENV NODE_ENV=production \
    PORT=3000 \
    MONITORING_ENABLED=1

WORKDIR /app

# Código y dependencias propiedad de root: el usuario nodejs solo puede leerlos
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package*.json ./
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Usuario sin privilegios; solo estos directorios le pertenecen (escritura)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    mkdir -p /app/backend/uploads /app/backend/data /app/logs && \
    chown -R nodejs:nodejs /app/backend/uploads /app/backend/data /app/logs

USER nodejs

EXPOSE 3000

CMD ["node", "backend/server.js"]

# ---------- 3) Tools (administración bajo demanda) ----------
FROM runtime AS tools
COPY scripts/ ./scripts/
CMD ["node", "scripts/manage-users.js"]

# ---------- 4) App (imagen por defecto, sin scripts/) ----------
FROM runtime AS app

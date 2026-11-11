# Dockerfile para DiagramaServers
# Aplicación Node.js con frontend estático

FROM node:22-alpine

# Instalar dependencias del sistema para bcrypt y ping
RUN apk add --no-cache python3 make g++ iputils

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias primero (para cache de Docker)
COPY package*.json ./

# Copiar schema de Prisma (necesario para prisma generate durante install)
COPY backend/prisma/ ./backend/prisma/

# Instalar dependencias (incluye @prisma/client)
RUN npm ci --only=production

# Generar Prisma Client
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
RUN npx prisma generate --schema=backend/prisma/schema.prisma
ENV DATABASE_URL=""

# Copiar el resto del código fuente
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY docs/ ./docs/
COPY scripts/ ./scripts/

# Crear directorios necesarios
RUN mkdir -p /app/backend/data /app/backend/uploads /app/logs

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000
ENV MONITORING_ENABLED=1

# Puerto expuesto
EXPOSE 3000

# Usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Comando de inicio
CMD ["node", "backend/server.js"]

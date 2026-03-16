# 🐳 Despliegue con Docker

## Requisitos
- Docker Engine 20.10+
- Docker Compose 2.0+

## Inicio Rápido

### 1. Configurar variables de entorno
```bash
cp .env.docker.example .env
# Editar .env con tus valores
```

### 2. Construir y levantar contenedores
```bash
# Primera vez (construye imagen)
docker-compose up -d --build

# Siguientes veces
docker-compose up -d
```

### 3. Acceder a la aplicación
- **App**: http://localhost:3000
- **PostgreSQL**: localhost:5432 (usuario: diagrama)

## Comandos Útiles

### Ver logs
```bash
# Todos los servicios
docker-compose logs -f

# Solo la app
docker-compose logs -f app

# Solo PostgreSQL
docker-compose logs -f postgres
```

### Reiniciar servicios
```bash
docker-compose restart

# Solo la app
docker-compose restart app
```

### Detener servicios
```bash
docker-compose down

# Detener y eliminar volúmenes (¡CUIDADO! Borra datos)
docker-compose down -v
```

### Reconstruir después de cambios
```bash
docker-compose up -d --build
```

### Acceder a la base de datos
```bash
# Consola PostgreSQL
docker-compose exec postgres psql -U diagrama -d diagrama_servers

# Backup
docker-compose exec postgres pg_dump -U diagrama diagrama_servers > backup.sql

# Restore
docker-compose exec -T postgres psql -U diagrama diagrama_servers < backup.sql
```

### Ejecutar comandos en la app
```bash
# Shell interactivo
docker-compose exec app sh

# Ejecutar script
docker-compose exec app node scripts/manage-users.js list
```

## Estructura de Contenedores

```
┌─────────────────────────────────────────┐
│          docker-compose.yml              │
├────────────────┬────────────────────────┤
│   diagrama-app │   diagrama-postgres    │
│   (Node.js)    │   (PostgreSQL 15)      │
│   Puerto 3000  │   Puerto 5432          │
└────────────────┴────────────────────────┘
         │                │
    app_uploads      postgres_data
    app_logs         (volúmenes)
```

## Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `POSTGRES_USER` | Usuario de PostgreSQL | diagrama |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL | DiagramaServers2025 |
| `POSTGRES_DB` | Nombre de la base de datos | diagrama_servers |
| `POSTGRES_PORT` | Puerto expuesto de PostgreSQL | 5432 |
| `APP_PORT` | Puerto expuesto de la app | 3000 |
| `SESSION_SECRET` | Secreto para sesiones | (generado) |
| `MONITORING_ENABLED` | Habilitar monitoreo | 1 |
| `SMTP_HOST` | Servidor SMTP para alertas | (vacío) |
| `SMTP_PORT` | Puerto SMTP | 587 |
| `SMTP_USER` | Usuario SMTP | (vacío) |
| `SMTP_PASS` | Contraseña SMTP | (vacío) |
| `ALERT_EMAIL_TO` | Emails destino de alertas | (vacío) |
| `TEAMS_WEBHOOK_URL` | Webhook de Teams | (vacío) |

## Producción

### Recomendaciones de Seguridad
1. **Cambiar contraseñas**: Modifica `POSTGRES_PASSWORD` y `SESSION_SECRET`
2. **Red**: Usa una red Docker aislada
3. **HTTPS**: Configura un reverse proxy (nginx/traefik) con SSL
4. **Backups**: Programa backups automáticos de PostgreSQL

### Reverse Proxy con Nginx
```nginx
server {
    listen 80;
    server_name diagrama.tudominio.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name diagrama.tudominio.com;

    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Health Checks
La app incluye health checks automáticos:
- **App**: `GET /api/auth/session`
- **PostgreSQL**: `pg_isready`

## Solución de Problemas

### La app no conecta a PostgreSQL
```bash
# Verificar que PostgreSQL está listo
docker-compose exec postgres pg_isready -U diagrama

# Ver logs de PostgreSQL
docker-compose logs postgres
```

### Error de permisos en volúmenes
```bash
# Recrear volúmenes
docker-compose down -v
docker-compose up -d
```

### Limpiar todo y empezar de cero
```bash
docker-compose down -v --rmi local
docker-compose up -d --build
```

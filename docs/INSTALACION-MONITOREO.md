# Instalación y Configuración del Módulo de Monitoreo (Windows)

Última actualización: 2025-11-06

## 1. Objetivo
Dejar listo el entorno para que el monitoreo (scheduler + workers) pueda usar PostgreSQL para persistencia y Redis para colas/eventos.

## 2. Variables Clave
| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| POSTGRES_URL | Cadena de conexión a PostgreSQL | postgres://mon_user:TuPassword@localhost:5432/monitoring |
| REDIS_URL | Cadena de conexión a Redis | redis://localhost:6379 |
| MONITORING_ENABLED | Activa el módulo | 1 |

## 3. PostgreSQL
### 3.1 Instalación
1. Descarga el instalador oficial: https://www.postgresql.org/download/windows/
2. Instala (anota puerto, por defecto 5432, y contraseña del superusuario `postgres`).
3. Marca la opción de instalar *psql* (cliente de línea de comandos).

### 3.2 Crear base y usuario
Abre PowerShell y entra a `psql`:
```powershell
# Si el instalador agregó psql al PATH:
psql -U postgres
```
Dentro de `psql` ejecuta:
```sql
CREATE DATABASE monitoring;
CREATE USER mon_user WITH PASSWORD 'TuPasswordSegura123';
GRANT ALL PRIVILEGES ON DATABASE monitoring TO mon_user;
```

(Elige una contraseña robusta; evita comillas conflictivas.)

### 3.3 Aplicar esquema
Desde la raíz del proyecto:
```powershell
psql -U mon_user -d monitoring -f .\scripts\sql\schema.monitoring.sql
```
Si pide contraseña, ingresa la de `mon_user`.

### 3.4 Probar conexión en Node
```powershell
# Temporal: probar conexión rápida
node -e "import('pg').then(async m=>{const c=new m.Client({connectionString:'postgres://mon_user:TuPasswordSegura123@localhost:5432/monitoring'});await c.connect();console.log('OK Postgres');await c.end();})" 
```

## 4. Redis
Redis no tiene build oficial moderno para Windows nativo; opciones:

### Opción A: Docker (recomendado si puedes usar Docker Desktop)
1. Instala Docker Desktop.
2. Ejecuta:
```powershell
docker run -d --name redis -p 6379:6379 redis:7-alpine
```
3. Prueba:
```powershell
# Instalar redis-cli rápido (WSL recomendado) o usar imagen:
docker exec -it redis redis-cli ping
# Debe responder: PONG
```

### Opción B: WSL (Ubuntu)
1. Activa WSL y Ubuntu (Microsoft Store).
2. En Ubuntu:
```bash
sudo apt update && sudo apt install -y redis-server
sudo service redis-server start
```
3. Asegura que esté escuchando en 0.0.0.0 si necesitas (editar /etc/redis/redis.conf).

### Opción C: Redis Stack (GUI + extras)
Descarga: https://redis.io/docs/latest/operate/redis-stack/ y sigue instalador. Usa el puerto 6379 por defecto.

### Opción D: Memurai (alternativa comercial con versión gratuita)
https://www.memurai.com/ — instalación similar a servicio Windows.

Si ninguna opción viable de inmediato: puedes arrancar el monitoreo sólo con Postgres y dejar Redis para después (la cola no funcionará, pero el resto del código no se romperá si MONITORING_ENABLED=0).

## 5. Configurar .env
Crea/edita `.env` en la raíz:
```env
MONITORING_ENABLED=1
POSTGRES_URL=postgres://mon_user:TuPasswordSegura123@localhost:5432/monitoring
REDIS_URL=redis://localhost:6379
# Opcionales
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
TEAMS_WEBHOOK_URL=
CHECK_WORKER_CONCURRENCY=10
DEFAULT_PING_TIMEOUT_MS=2000
DEFAULT_TCP_TIMEOUT_MS=2000
DEFAULT_HTTP_TIMEOUT_MS=3000
DEFAULT_CHECK_RETRIES=0
```

## 6. Reiniciar aplicación
```powershell
npm run dev
```
Observa logs:
- Si Redis falta: verás advertencia de cola deshabilitada.
- Si todo está ok: "Scheduler monitoreo iniciado" y "Worker de checks iniciado".

## 7. Probar endpoints
```powershell
Invoke-RestMethod http://localhost:3050/monitoring/health
Invoke-RestMethod -Method POST http://localhost:3050/monitoring/enqueue-test
```

## 8. Importar hosts desde caché existente
```powershell
node .\scripts\import\importHostsFromCache.js
```
Revisa en Postgres:
```powershell
psql -U mon_user -d monitoring -c "SELECT id,name,ip,type,estado_actual FROM monitoring.hosts LIMIT 10;"
```

## 9. Comunes Errores
| Error | Causa | Solución |
|-------|-------|----------|
| `ECONNREFUSED 127.0.0.1:5432` | Postgres no iniciado | Inicia servicio Postgres / reinstala |
| `password authentication failed` | Credenciales incorrectas | Revisa POSTGRES_URL y usuario/contraseña |
| `ERR_MODULE_NOT_FOUND 'pg'` | Dependencia faltante | Ejecuta `npm install` otra vez |
| Redis PING no responde | Contenedor caído | `docker start redis` |

## 10. Próximo Paso
Persistir resultados reales de checks en `check_runs` y leer checks desde la tabla `checks` (crearemos un CRUD mínimo).

---
Guía lista. Ajusta la contraseña y procede; después confirmamos que el scheduler y el worker realmente generan jobs con Redis y guardan resultados en Postgres.

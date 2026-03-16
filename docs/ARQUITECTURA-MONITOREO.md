# Arquitectura del Sistema de Monitoreo

Última actualización: 2025-11-06

## 🎯 Objetivo
Implementar un motor de monitoreo modular y escalable que ejecute checks periódicos sobre hosts, evalúe estados, gestione incidentes y despache notificaciones, integrándose con la solución actual de visualización de servidores.

## 🧱 Componentes Principales

| Componente | Responsabilidad | Tipo |
|------------|-----------------|------|
| API / Backend Core | CRUD de hosts/checks/incidentes/mantenimiento, autenticación, endpoints de estado | Servicio Express (existente) |
| Scheduler | Programa la ejecución de checks según sus frecuencias (genera jobs) | Worker Node (pm2 process) |
| Worker de Checks | Consume jobs de la cola, ejecuta ICMP/TCP/HTTP y guarda resultados | Worker Node (escalable) |
| Evaluador de Estado | Calcula nuevo estado de host tras cada check_run y emite eventos | Worker Node (puede ser parte del worker de checks) |
| Gestor de Incidentes | Crea/actualiza/cierra incidentes según reglas y transición de estado | Worker Node |
| Notificador | Envía alertas (email/Teams), aplica deduplicación/cooling/escalamiento | Worker Node |
| SSE/WebSocket Gateway | Publica eventos de estado/incident en tiempo real a clientes | Parte del API |
| Redis | Cola de jobs (BullMQ), pub/sub de eventos, sesiones | Infra |
| PostgreSQL (+Timescale) | Persistencia relacional y series temporales de check_runs | Infra |
| Importador Excel Inicial | Migra datos desde Excel a tabla hosts/checks | Script Node |

## 🔄 Flujos de Datos

### 1. Ciclo de ejecución de un check
```
[Scheduler] --(job)-> [Redis Queue checks] --(take)-> [Worker Checks]
   Worker ejecuta check (ping/tcp/http)
   ↓
[PostgreSQL] INSERT check_runs
   ↓
[Evaluador Estado] calcula estado host y UPDATE hosts.estado
   ↓
[Gestor Incidentes] abre/actualiza/cierra incidente si aplica
   ↓
[Redis Pub/Sub] emite eventos (host_state_changed, incident_opened,...)
   ↓
[SSE Gateway] push a clientes
   ↓
[Notificador] consume eventos y envía alertas si corresponden
```

### 2. Ventana de Mantenimiento
```
[Admin] crea maintenance_window en API
[Scheduler] al disparar jobs verifica si el host está en mantenimiento → omite alertas
[Evaluador] marca estado MAINTENANCE (flag) para UI
```

### 3. Silenciamiento/Muting
```
[Admin/NOC] crea registro mute (en alert_rules / incident) con expires_at
[Notificador] antes de enviar alerta verifica mute + cooling
```

## 🧩 Diseño Lógico

- API expone endpoints REST; integra autenticación existente (extender roles).
- Scheduler obtiene lista de checks habilitados y programa next_run usando jitter (±10%) para evitar picos.
- Workers en paralelo (N instancias) consumen jobs; cada job ejecuta exactamente un check.
- Evaluación de estado desacoplada: tras insertar el check_run se encola evento interno `evaluate_state` (puede ser inline para MVP).
- Estados calculados se escriben en `hosts` y se registran en `incident_events` si cambian.
- Incidentes viven mientras Estado DOWN/DEGRADED sostenido; se cierran al retornar a UP y pasar período estable.

## ⚙️ Tecnologías
- Node.js (ESM) + Express (API existente).
- BullMQ (Redis) para cola de `check:run` y `notify:send`.
- PostgreSQL / TimescaleDB para persistencia; migraciones SQL manuales iniciales.
- OPCIONAL: pino para logging estructurado.

## 📦 Paquetes sugeridos
- `bullmq` (colas)
- `ping` o `net-ping` (ICMP) — considerar manejo de permisos (Windows/Linux).
- `node-fetch` / `undici` (HTTP checks)
- Core Node `net` (TCP connect)
- `nodemailer` (email)

## 🗃️ Modelado (Resumen)

- hosts(id, name, ip, type, rack, critical, estado_actual, estado_changed_at, enabled)
- checks(id, host_id, kind, config, frequency_sec, timeout_ms, retries, enabled, next_run_at)
- check_runs(time, check_id, host_id, status, latency_ms, code, error, sample)
- incidents(id, host_id, state, severity, opened_at, last_update_at, closed_at)
- incident_events(id, incident_id, type, payload, at)
- maintenance_windows(...)

(Ver DDL detallado en `scripts/sql/schema.monitoring.sql` una vez creado.)

## 🔐 Seguridad y Roles
- Reutilizar sesión actual, expandiendo roles: admin, operator, viewer.
- Endpoints de escritura (crear check, ventana mantenimiento, cerrar incidente) requieren admin/operator.
- Rate limit en /auth y /checks para evitar abusos.

## 🏗️ Despliegue (PM2 Fase MVP)
```
App principal (API + SSE): instances=1
Scheduler: instances=1
Workers Checks: instances=2..N (escala horizontal)
Notificador: instances=1
```
Redis y PostgreSQL externos (o locales para desarrollo). Más adelante: cluster/containers.

## 🧪 Estrategia de Testing
- Unit tests: funciones de evaluación de estado y transición de incidente.
- Integration tests: ejecución de un check run (falso) y ver cambio de estado + apertura de incidente.
- Load test: simular 1k checks para validar latencias y distribución.

## 🚨 Reglas de Estado (Ejemplo MVP)
- DOWN: ≥3 fallos consecutivos o 100% fallos últimos 5 minutos.
- DEGRADED: p95 latencia HTTP/TCP > umbral (ej. 1000 ms) durante 5 minutos o código != esperado.
- UP: p95 latencia < umbral y éxitos consecutivos ≥2.
- MAINTENANCE: flag activo en ventana → fuerza estado visible.

## 🔔 Política de Alertas (MVP)
- Apertura de incidente (DOWN o DEGRADED sostenido): enviar alerta inmediata.
- Cooling: no repetir alerta del mismo incidente más de 1 vez cada 10 min.
- Cierre de incidente: enviar notificación de recuperación.

## 📊 Métricas Internas (iniciales)
- checks_executed_total
- check_latency_ms_histogram
- incidents_open_total
- notification_sent_total
- queue_depth_checks / queue_depth_notify

## 🛠️ Extensiones Futuras
- Agente propio para métricas de sistema (CPU/RAM/Disk) y consolidación.
- Descubrimiento automático de hosts vía subred configurada.
- WS bidireccional para control en vivo (pausar un host, forzar check inmediato).

## 📌 Decisiones Clave
- Almacenar todos los check_runs (retención con particiones) → da flexibilidad analítica.
- Uso de colas garantiza desacoplamiento y permite escalado horizontal fácil.
- Estados calculados en base a ventana temporal + consecutivos para reducir falsos positivos.

## ✅ Criterios para pasar a implementación
- Documento de requerimientos aprobado.
- Diagrama de componentes validado (este documento + flujos).
- DDL revisada y aceptada.
- Variables de entorno definidas (.env) para Postgres, Redis, SMTP, Teams webhook.

## 🗂️ Variables de Entorno (borrador)
```
POSTGRES_URL=postgres://user:pass@host:5432/monitoring
REDIS_URL=redis://localhost:6379
SMTP_HOST=smtp.dominio.com
SMTP_PORT=587
SMTP_USER=usuario
SMTP_PASS=secreto
TEAMS_WEBHOOK_URL=https://... (opcional)
CHECK_WORKER_CONCURRENCY=20
DEFAULT_PING_TIMEOUT_MS=2000
```

---
Una vez aceptada esta arquitectura, el siguiente paso es la creación del esquema SQL y script de migración inicial, seguido de la integración incremental en el código.

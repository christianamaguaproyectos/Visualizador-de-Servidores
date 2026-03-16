# Sistema de Monitoreo de Servidores — Requerimientos

Última actualización: 2025-11-06

## 🎯 Objetivo

Diseñar y construir un sistema de monitoreo integral para servidores físicos y virtuales del Centro de Datos (Grupo Danec), capaz de:
- Verificar disponibilidad (ping/puerto/HTTP) y marcar automáticamente estados (UP/DOWN/DEGRADED/MAINTENANCE). 
- Registrar y visualizar métricas clave y su histórico. 
- Gestionar ventanas de mantenimiento y silenciamiento de alertas. 
- Notificar incidentes a los canales adecuados con deduplicación y escalamiento.
- Integrarse con la visualización de racks/hosts ya existente.

## 📌 Alcance (versión inicial)
- Cobertura de servidores físicos y virtuales ya cargados en el sistema.
- Monitoreo agente-less (ICMP/TCP/HTTP). Agente opcional considerado para fases siguientes.
- Persistencia en BD relacional + time-series para históricos.
- Alertas por correo y Microsoft Teams (webhook). 

Fuera de alcance inicial (posible fase futura): SNMP/WMI profundo, discovery automático en red, integraciones con CMDB externas, dashboards avanzados tipo Grafana, SSO corporativo.

## 🧩 Glosario
- Check: Definición de verificación (p.ej., "ICMP ping a 10.1.1.5 cada 30s").
- Check Run: Ejecución individual con resultado (OK/FAIL, latencia, timestamp).
- Incident: Agregación de fallos correlacionados en una entidad rastreable con ciclo de vida.
- Maintenance Window: Intervalo en que un host o grupo queda en mantenimiento (silencio de alertas y estado MAINTENANCE).

## 👥 Stakeholders y roles
- Admin: configura checks, umbrales, programación, mantenimiento, destinatarios. Gestiona usuarios.
- Operaciones (NOC): visualiza estado, recibe alertas, gestiona incidentes, cierra/nota resoluciones.
- Viewer: solo lectura de dashboards e historial.

## ✅ Requerimientos funcionales

### F1. Inventario y descubrimiento
- F1.1 Importar servidores desde DB (fuente primaria) y mantener compatibilidad con Excel como import inicial.
- F1.2 Entidades: Rack, Host (físico/virtual), Servicio (opcional), Grupo/Etiqueta.
- F1.3 Campos mínimos del Host: id, nombre, IP, tipo, rack, crítico (sí/no), área responsable.

### F2. Tipos de checks soportados (MVP)
- F2.1 ICMP Ping (latencia, pérdida).
- F2.2 TCP Port (p.ej., 22/3389/80/443) con timeout y latencia de connect.
- F2.3 HTTP/HTTPS GET (código esperado, palabra clave opcional, latencia, tamaño).
- F2.4 Compuestos (futuro): secuencia TCP→HTTP, o varios puertos.

### F3. Programación de checks
- F3.1 Frecuencia configurable por check (p.ej., 15s/30s/60s/5m).
- F3.2 Timeout configurable (p.ej., 2s/5s/10s) y reintentos (0..3) con backoff y jitter.
- F3.3 Paralelismo controlado por worker y por destino para evitar tormenta.
- F3.4 Ventanas de mantenimiento: excluir de ejecución o no generar alertas.

### F4. Estados y reglas
- F4.1 Estados por Host: UNKNOWN, UP, DEGRADED, DOWN, MAINTENANCE.
- F4.2 Transición a DOWN: N fallos consecutivos o SLA de la última ventana < umbral.
- F4.3 DEGRADED: latencia > umbral o HTTP != 200 pero servicio responde.
- F4.4 Estado se deriva de las reglas configuradas (policy por host/grupo).

### F5. Alertas y notificaciones
- F5.1 Canales: Email (SMTP) y Microsoft Teams (webhook). Slack opcional.
- F5.2 Políticas: por severidad, agrupación por host/grupo, cooling/dedup (no spam), escalamiento por tiempo.
- F5.3 Notificar apertura/cierre de incidentes y cambios a/de mantenimiento.
- F5.4 Silenciamiento manual por tiempo/alcance.

### F6. Incidentes
- F6.1 Crear incidente cuando un host cambie a DOWN o DEGRADED sostenido.
- F6.2 Estados del incidente: OPEN → ACK → RESOLVED → CLOSED.
- F6.3 Línea de tiempo: cambios de estado, notas, eventos de alerta.

### F7. Mantenimiento
- F7.1 Planificar ventanas por host/grupo (una vez o recurrentes).
- F7.2 Estado MAINTENANCE visible; suspensión de alertas durante la ventana.
- F7.3 Registro de quién creó/modificó la ventana y comentarios.

### F8. Dashboards y UX
- F8.1 Tablero general: KPIs (hosts UP/DOWN/DEGRADED/MAINT.), mapa por rack y por clúster virtual.
- F8.2 Vista detalle de Host: estado actual, últimos check-runs, métricas y timeline de incidentes.
- F8.3 Reportes de uptime/SLA por periodo (semana/mes) con export (CSV/PDF).
- F8.4 Búsqueda y filtros por nombre, IP, grupo, estado, criticidad.

### F9. Historial y métricas
- F9.1 Guardar todos los check-runs (resultado, latencia, payload) con retención configurable (p.ej., 90 días crudos, 13 meses agregados).
- F9.2 Agregaciones automáticas (min/avg/p95) por 1m/5m/1h.

### F10. API y eventos
- F10.1 API REST segura para listar/configurar hosts, checks, incidentes, mantenimiento, reportes.
- F10.2 SSE/WebSocket para push de cambios (estados/alertas), con autenticación.
- F10.3 Webhooks salientes (opcional) para integraciones.

### F11. Usuarios y permisos
- F11.1 Roles: admin, operator, viewer (ya existe sesión; extender a RBAC granular).
- F11.2 Auditoría de cambios (quién, cuándo, qué).

## 📐 Requerimientos no funcionales
- N1 Escalabilidad: scheduler distribuible; workers horizontales (cola de trabajos); soportar 1k–10k checks/min.
- N2 Rendimiento: p95 de ejecución de check dentro de su ventana; baja latencia para actualizaciones de estado.
- N3 Confiabilidad: tolerancia a fallos; reintentos; no perder resultados en caída.
- N4 Seguridad: sesiones seguras, CSRF en UI, validación entrada, secretos en variables de entorno, restricciones CORS, rate limiting.
- N5 Observabilidad: logs estructurados, métricas internas (colas, tiempo de check), health endpoints.
- N6 Portabilidad: despliegue en Windows/PM2 actual y opción Docker; sin dependencias propietarias.

## 🗄️ Base de datos propuesta

- Motor: PostgreSQL + extensión TimescaleDB para series temporales (alternativas: InfluxDB/ClickHouse; empezar con Postgres puro si se prefiere simplicidad).
- Cache/Mensajería: Redis para colas (BullMQ) y pub/sub de eventos en tiempo real, sesiones y rate limiting.

### Esquema (borrador inicial)

Entidades principales (relacional):
- users(id, username, name, role, created_at)
- teams(id, name)
- user_teams(user_id, team_id)
- hosts(id, name, ip, type[fisico|virtual], rack, critical:boolean, group_tags text[], enabled:boolean, created_at, updated_at)
- checks(id, host_id, kind[icmp|tcp|http], config jsonb, frequency_sec, timeout_ms, retries, enabled:boolean, created_at)
- incidents(id, host_id, severity[critical|warning], state[open|ack|resolved|closed], opened_at, closed_at, summary, last_event_at)
- incident_events(id, incident_id, type[open|ack|note|auto_resolve|close|alert_sent], payload jsonb, at)
- maintenance_windows(id, scope[type:host|group|all], target_ids text[], starts_at, ends_at, recurrence jsonb, created_by)
- notifications(id, channel[email|teams], target, policy jsonb, enabled:boolean)
- alert_rules(id, scope, conditions jsonb, actions jsonb)
- audit_log(id, actor, action, entity, entity_id, diff jsonb, at)

Series temporales (Timescale/tabla particionada):
- check_runs(time timestamptz, check_id, host_id, status[ok|fail|timeout|degraded], latency_ms int, code int, error text, sample jsonb)
- metrics_agg(time_bucket, host_id, metric, min, avg, p95, max, count)

Claves y consideraciones:
- Índices por (host_id, time DESC) en check_runs.
- Particionamiento por tiempo para retención.
- Constraints FK con hosts/checks/incidents.

### Estados y transición (máquina de estados)

- UNKNOWN → UP/DEGRADED/DOWN según primeros resultados.
- UP → DEGRADED cuando latency > threshold sostenido; → DOWN tras N fallos.
- DOWN/DEGRADED → UP tras M éxitos.
- MAINTENANCE forzado por ventana; no genera alertas; al finalizar, reevaluación inmediata.

## ⚙️ Motor de ejecución (Scheduler + Workers)

- Scheduler produce jobs periódicos por check (con jitter para distribuir carga).
- Workers concurrentes ejecutan checks y escriben resultados en BD.
- Evaluador de estado por host aplica políticas y emite eventos (pub/sub) y actualiza estado en `hosts`.
- Notificador consume eventos de estado/incident y aplica dedup/cooling y políticas por canal.

Herramientas sugeridas:
- BullMQ (Redis) para cola de jobs de checks y de notificaciones.
- Node workers separados (pm2 apps) o un proceso con colas dedicadas.

## 🔔 Notificaciones

- Email: SMTP corporativo.
- Teams: Incoming Webhook configurable por canal/equipo.
- Deduplicación: ventana de enfriamiento por incidente (p.ej., no más de 1 alerta/10min por host).
- Escalamiento: si no se ACK en X min, notificar a nivel 2.

## 🖥️ Dashboards (UI)

- Tablero General: tarjetas de conteo, mapa de racks, lista de incidentes abiertos, últimos cambios, buscador.
- Vista Host: estado actual, latencia última hora/24h, último downtime, ventanas de mantenimiento futuras.
- Vista Incidente: timeline con eventos/notas, severidad, responsables.
- Reportes: uptime por host/grupo; export CSV.

## 🔐 Seguridad

- Sesiones persistentes en Redis; cookies secure+sameSite en producción.
- RBAC por rol y, opcionalmente, por equipo/área.
- Validación exhaustiva de `config` de checks y entradas de usuario.
- Rate limiting en endpoints sensibles.

## 🔭 Observabilidad y Operación

- Logs estructurados (nivel info/warn/error/debug).
- /healthz y /readyz para orquestación.
- Métricas internas: tamaño de colas, jobs/seg, tiempos p95 de checks, errores por canal.

## 🔌 Integraciones y migración

- Importador desde Excel → hosts/checks iniciales (mapeo de columnas existente en config).
- Mantener compatibilidad de vista actual de racks/virtuales consumiendo datos desde la BD (o cache sincronizado).

## 📈 Roadmap por fases

- MVP (Fase 1)
  - ICMP, TCP, HTTP checks
  - Scheduler + Workers + Redis
  - Persistencia en Postgres (check_runs + entidades)
  - Estados automáticos, incidentes básicos
  - Ventanas de mantenimiento (manuales)
  - Notificaciones Email/Teams con dedup simple
  - Dashboard general + detalle de host

- Fase 2
  - Políticas avanzadas (degradación, multi-umbral)
  - Reportes SLA mensuales + export
  - Silenciamientos granulares y recurrentes
  - Webhooks externos
  - UI modularizada (refactor `app.js`)

- Fase 3
  - Descubrimiento de servicios, SNMP/WMI opcional
  - Agente ligero para métricas del SO (CPU/RAM/Disk) en hosts críticos
  - SSO corporativo (AD/Azure AD)
  - Escalamiento multi-sitio (pollers distribuidos)

## ✅ Criterios de aceptación (MVP)

- CA1: Un host que no responde ICMP por 3 intentos consecutivos pasa a DOWN en < 2 minutos y se abre incidente + alerta a Teams.
- CA2: Host en mantenimiento programado no genera alertas; UI muestra estado MAINTENANCE durante la ventana.
- CA3: Latencia HTTP > 1s durante 5 minutos marca host como DEGRADED y crea incidente WARNING.
- CA4: Tablero general lista correctamente conteos y permite filtrar por estado/host.
- CA5: Uptime semanal exportado a CSV coincide con agregaciones de check_runs.

## 📝 Supuestos y riesgos

- Algunos servidores pueden bloquear ICMP; se requerirá checks TCP/HTTP como sustituto.
- Windows vs Linux: acceso a puertos puede diferir; definir puertos monitoreados por familia.
- El almacenamiento de históricos crecerá: definir políticas de retención y agregación.
- Dependencia de Redis y Postgres: plan de despliegue/backup.

---

Siguiente paso sugerido: revisar y ajustar estos requerimientos (especialmente estados, umbrales y canales de notificación), luego diseñar el esquema SQL definitivo y el diagrama de componentes (scheduler, workers, notificador) para arrancar la implementación del MVP.

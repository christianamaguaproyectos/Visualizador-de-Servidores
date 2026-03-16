# Setup de Base de Datos para Monitoreo

Última actualización: 2025-11-06

## Requisitos
- PostgreSQL 14+ (recomendado)
- (Opcional) TimescaleDB si se desea retención/compresión eficiente de series temporales

## Pasos

1) Crear base de datos y usuario (ejemplo)

```powershell
# Abre psql y ejecuta:
CREATE DATABASE monitoring;
CREATE USER mon_user WITH PASSWORD 'cambia_esto';
GRANT ALL PRIVILEGES ON DATABASE monitoring TO mon_user;
```

2) (Opcional) Instalar TimescaleDB
- Windows: seguir guía de Timescale para Windows o usar Docker.
- Si está instalada, dentro de la DB ejecutar:

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

3) Aplicar el esquema

```powershell
# Desde la raíz del proyecto (ajusta ruta a psql si es necesario)
# Carga el archivo SQL en la base de datos
psql -h localhost -U mon_user -d monitoring -f ".\scripts\sql\schema.monitoring.sql"
```

4) Verificar
- Tablas creadas dentro del esquema `monitoring`.
- `check_runs` disponible para convertirse en hypertable si usas Timescale:

```sql
SELECT create_hypertable('monitoring.check_runs', 'time', if_not_exists => TRUE);
SELECT add_retention_policy('monitoring.check_runs', INTERVAL '90 days', if_not_exists => TRUE);
```

## Variables de entorno (borrador)

```env
POSTGRES_URL=postgres://mon_user:cambia_esto@localhost:5432/monitoring
REDIS_URL=redis://localhost:6379
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
TEAMS_WEBHOOK_URL=
```

## Notas
- Para desarrollo local, puedes omitir Timescale y usar solo Postgres; más adelante activamos particionado.
- Para producción, configura backups de Postgres y Redis (RPO/RTO definidos) y controla recursos de almacenamiento vs retención de `check_runs`.

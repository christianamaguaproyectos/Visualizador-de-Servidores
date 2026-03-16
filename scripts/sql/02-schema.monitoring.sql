-- Schema de Monitoreo - PostgreSQL
-- Fecha: 2025-11-06

-- OPCIONAL: crear esquema dedicado
CREATE SCHEMA IF NOT EXISTS monitoring;
SET search_path TO monitoring, public;

-- Tipos enumerados
DO $$ BEGIN
  CREATE TYPE host_type_enum AS ENUM ('fisico','virtual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE check_kind_enum AS ENUM ('icmp','tcp','http');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE run_status_enum AS ENUM ('ok','fail','timeout','degraded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE incident_state_enum AS ENUM ('open','ack','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE incident_severity_enum AS ENUM ('critical','warning','info');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabla de usuarios (opcional, puede mapear a sistema actual)
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','operator','viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Equipos/áreas (opcional)
CREATE TABLE IF NOT EXISTS teams (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS user_teams (
  user_id       BIGINT REFERENCES users(id) ON DELETE CASCADE,
  team_id       BIGINT REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, team_id)
);

-- Hosts
CREATE TABLE IF NOT EXISTS hosts (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  ip                INET,
  type              host_type_enum NOT NULL,
  rack              TEXT,
  critical          BOOLEAN NOT NULL DEFAULT FALSE,
  group_tags        TEXT[] NOT NULL DEFAULT '{}',
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Estado actual
  estado_actual     TEXT NOT NULL DEFAULT 'UNKNOWN', -- 'UNKNOWN','UP','DEGRADED','DOWN','MAINTENANCE'
  estado_changed_at TIMESTAMPTZ,
  -- Auditoría
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hosts_ip_idx ON hosts(ip);
CREATE INDEX IF NOT EXISTS hosts_estado_idx ON hosts(estado_actual);

-- Checks
CREATE TABLE IF NOT EXISTS checks (
  id             BIGSERIAL PRIMARY KEY,
  host_id        BIGINT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  kind           check_kind_enum NOT NULL,
  config         JSONB NOT NULL DEFAULT '{}', -- {port, path, expect_code, keyword, tls, ...}
  frequency_sec  INT NOT NULL DEFAULT 60,
  timeout_ms     INT NOT NULL DEFAULT 2000,
  retries        INT NOT NULL DEFAULT 0,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS checks_host_idx ON checks(host_id);
CREATE INDEX IF NOT EXISTS checks_enabled_idx ON checks(enabled);
CREATE INDEX IF NOT EXISTS checks_next_run_idx ON checks(next_run_at);

-- Resultados de checks (serie temporal)
CREATE TABLE IF NOT EXISTS check_runs (
  time          TIMESTAMPTZ NOT NULL,
  check_id      BIGINT NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  host_id       BIGINT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  status        run_status_enum NOT NULL,
  latency_ms    INT,
  code          INT,          -- http status code o errno
  error         TEXT,         -- error textual si aplica
  sample        JSONB,        -- payload breve: headers, body fragment hash, etc.
  PRIMARY KEY (time, check_id)
);

CREATE INDEX IF NOT EXISTS check_runs_host_time_idx ON check_runs(host_id, time DESC);
CREATE INDEX IF NOT EXISTS check_runs_check_time_idx ON check_runs(check_id, time DESC);
CREATE INDEX IF NOT EXISTS check_runs_status_idx ON check_runs(status);

-- Incidentes
CREATE TABLE IF NOT EXISTS incidents (
  id             BIGSERIAL PRIMARY KEY,
  host_id        BIGINT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  severity       incident_severity_enum NOT NULL DEFAULT 'critical',
  state          incident_state_enum NOT NULL DEFAULT 'open',
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_event_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at      TIMESTAMPTZ,
  summary        TEXT
);

CREATE INDEX IF NOT EXISTS incidents_host_idx ON incidents(host_id);
CREATE INDEX IF NOT EXISTS incidents_state_idx ON incidents(state);

-- Eventos de incidente (timeline)
CREATE TABLE IF NOT EXISTS incident_events (
  id            BIGSERIAL PRIMARY KEY,
  incident_id   BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  type          TEXT NOT NULL, -- open|ack|note|auto_resolve|close|alert_sent
  payload       JSONB NOT NULL DEFAULT '{}',
  at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS incident_events_incident_idx ON incident_events(incident_id, at DESC);

-- Ventanas de Mantenimiento
CREATE TABLE IF NOT EXISTS maintenance_windows (
  id            BIGSERIAL PRIMARY KEY,
  scope_type    TEXT NOT NULL CHECK (scope_type IN ('host','group','all')),
  target_ids    TEXT[] NOT NULL DEFAULT '{}', -- host ids o etiquetas
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  recurrence    JSONB, -- opcional: RRULE/cron-like
  created_by    BIGINT REFERENCES users(id),
  comment       TEXT
);

CREATE INDEX IF NOT EXISTS maintenance_active_idx ON maintenance_windows(starts_at, ends_at);

-- Reglas de alerta
CREATE TABLE IF NOT EXISTS alert_rules (
  id            BIGSERIAL PRIMARY KEY,
  scope         JSONB NOT NULL,  -- {hosts:[...], groups:[...], states:[...]} 
  conditions    JSONB NOT NULL,  -- {cooldown_sec, severity_map, ...}
  actions       JSONB NOT NULL,  -- {email:[...], teams:[...]} 
  enabled       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Canales de notificación
CREATE TABLE IF NOT EXISTS notifications (
  id            BIGSERIAL PRIMARY KEY,
  channel       TEXT NOT NULL CHECK (channel IN ('email','teams')),
  target        TEXT NOT NULL, -- correo o webhook URL
  policy        JSONB NOT NULL DEFAULT '{}',
  enabled       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Destinatarios de Alertas
CREATE TABLE IF NOT EXISTS alert_recipients (
  id                BIGSERIAL PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  name              TEXT,
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  notify_down       BOOLEAN NOT NULL DEFAULT TRUE,
  notify_degraded   BOOLEAN NOT NULL DEFAULT TRUE,
  notify_recovery   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alert_recipients_enabled_idx ON alert_recipients(enabled);

-- Auditoría
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor         TEXT NOT NULL,             -- username
  action        TEXT NOT NULL,             -- created|updated|deleted|...
  entity        TEXT NOT NULL,             -- hosts|checks|incidents|...
  entity_id     TEXT NOT NULL,
  diff          JSONB,
  at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers de updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_hosts_updated ON hosts;
CREATE TRIGGER t_hosts_updated BEFORE UPDATE ON hosts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Retención y particionamiento (opcional Timescale)
-- CREATE EXTENSION IF NOT EXISTS timescaledb;
-- SELECT create_hypertable('check_runs', 'time', if_not_exists => TRUE);
-- SELECT add_retention_policy('check_runs', INTERVAL '90 days', if_not_exists => TRUE);

-- Agregaciones (ejemplo de vista materializada futura)
-- CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_agg_1h AS
-- SELECT time_bucket('1 hour', time) AS bucket, host_id,
--        MIN(latency_ms) AS min_latency,
--        AVG(latency_ms) AS avg_latency,
--        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency,
--        MAX(latency_ms) AS max_latency,
--        COUNT(*) FILTER (WHERE status='ok') AS ok,
--        COUNT(*) FILTER (WHERE status!='ok') AS fail
-- FROM check_runs
-- GROUP BY bucket, host_id;

-- Índices adicionales recomendados según uso
-- CREATE INDEX IF NOT EXISTS check_runs_bucket_idx ON check_runs (date_trunc('hour', time));

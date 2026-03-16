-- Migración: Agregar tabla alert_recipients
-- Ejecutar en producción si la tabla no existe
-- Fecha: 2025-12-23

SET search_path TO monitoring, public;

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

-- Verificar que la tabla fue creada
DO $$
BEGIN
  RAISE NOTICE 'Tabla alert_recipients creada/verificada correctamente';
END $$;

-- =============================================================
-- Mapa de Dependencias y Topología de Servidores (Fase 1.1)
-- Archivo: 08-schema.dependencies.sql  (idempotente: se puede ejecutar varias veces)
--
-- Semántica de la flecha:  source ──depende de──▶ target
--   source_server_id = servidor que DEPENDE (cliente)
--   target_server_id = servidor PROVEEDOR del que necesita para funcionar
--
-- En bases ya existentes (el volumen de PostgreSQL ya inicializado) ejecutar a mano:
--   docker compose exec -T postgres psql -U <usuario> -d <base> < scripts/sql/08-schema.dependencies.sql
-- =============================================================

CREATE SCHEMA IF NOT EXISTS inventory;

-- Reutiliza la función de 01-schema.inventory.sql (se redefine igual por si este
-- script se ejecuta solo en una base que no la tenga)
CREATE OR REPLACE FUNCTION inventory.inventory_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------
-- 1) Dependencias entre servidores
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory.server_dependencies (
  id                BIGSERIAL PRIMARY KEY,
  source_server_id  BIGINT NOT NULL REFERENCES inventory.servers(id) ON DELETE CASCADE,
  target_server_id  BIGINT NOT NULL REFERENCES inventory.servers(id) ON DELETE CASCADE,
  dependency_type   VARCHAR(40) NOT NULL DEFAULT 'SERVICE',
  criticality       VARCHAR(20) NOT NULL DEFAULT 'CRITICAL',
  port              INT NULL,
  protocol          VARCHAR(20) NULL,
  label             VARCHAR(120) NULL,
  notes             TEXT NULL,
  created_by        VARCHAR(120) NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_server_dep_no_self CHECK (source_server_id <> target_server_id),
  CONSTRAINT chk_server_dep_port CHECK (port IS NULL OR (port >= 1 AND port <= 65535)),
  -- Mismos valores que valida el backend (dtos/topologyDto.js)
  CONSTRAINT chk_server_dep_type CHECK (dependency_type IN
    ('DATABASE','NETWORK','STORAGE','API','AUTH','HYPERVISOR','BACKUP','DNS_INFRA','SERVICE')),
  CONSTRAINT chk_server_dep_criticality CHECK (criticality IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  -- Permite 1 -> 2 y 2 -> 1 (ciclos), pero no dos relaciones idénticas del mismo tipo
  CONSTRAINT uq_server_dependency UNIQUE (source_server_id, target_server_id, dependency_type)
);

CREATE INDEX IF NOT EXISTS idx_server_dependencies_source ON inventory.server_dependencies (source_server_id);
CREATE INDEX IF NOT EXISTS idx_server_dependencies_target ON inventory.server_dependencies (target_server_id);

DROP TRIGGER IF EXISTS t_server_dependencies_updated ON inventory.server_dependencies;
CREATE TRIGGER t_server_dependencies_updated BEFORE UPDATE ON inventory.server_dependencies
  FOR EACH ROW EXECUTE FUNCTION inventory.inventory_set_updated_at();

COMMENT ON TABLE inventory.server_dependencies IS 'Relaciones "source depende de target" entre servidores (admite ciclos)';
COMMENT ON COLUMN inventory.server_dependencies.source_server_id IS 'Servidor que depende (cliente)';
COMMENT ON COLUMN inventory.server_dependencies.target_server_id IS 'Servidor del cual depende (proveedor)';

-- -------------------------------------------------------------
-- 2) Vistas / diagramas guardados
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory.topology_views (
  id             BIGSERIAL PRIMARY KEY,
  name           VARCHAR(120) NOT NULL UNIQUE,
  slug           VARCHAR(120) NOT NULL UNIQUE,
  description    TEXT NULL,
  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  viewport_zoom  DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  viewport_x     DOUBLE PRECISION NOT NULL DEFAULT 0,
  viewport_y     DOUBLE PRECISION NOT NULL DEFAULT 0,
  layout_mode    VARCHAR(30) NOT NULL DEFAULT 'manual',
  filter_config  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by     VARCHAR(120) NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_topology_view_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT chk_topology_view_zoom CHECK (viewport_zoom > 0)
);

-- Como máximo UNA vista por defecto
CREATE UNIQUE INDEX IF NOT EXISTS uq_topology_views_single_default
  ON inventory.topology_views (is_default) WHERE is_default;

DROP TRIGGER IF EXISTS t_topology_views_updated ON inventory.topology_views;
CREATE TRIGGER t_topology_views_updated BEFORE UPDATE ON inventory.topology_views
  FOR EACH ROW EXECUTE FUNCTION inventory.inventory_set_updated_at();

-- Vista por defecto: solo se siembra si NO hay ninguna vista (instalación nueva).
-- Así la re-ejecución nunca falla aunque se haya renombrado/cambiado el slug de
-- "Mapa General", se haya marcado otra vista como predeterminada o se haya
-- borrado a propósito (no se "resucita"). ON CONFLICT sin árbitro cubre todas
-- las restricciones únicas (name, slug y el índice de una sola vista por defecto).
INSERT INTO inventory.topology_views (name, slug, description, is_default, layout_mode)
SELECT 'Mapa General', 'general', 'Vista general con todos los servidores y sus dependencias', TRUE, 'manual'
WHERE NOT EXISTS (SELECT 1 FROM inventory.topology_views)
ON CONFLICT DO NOTHING;

-- -------------------------------------------------------------
-- 3) Posiciones (x, y) de cada servidor en cada vista
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory.topology_node_positions (
  id          BIGSERIAL PRIMARY KEY,
  view_id     BIGINT NOT NULL REFERENCES inventory.topology_views(id) ON DELETE CASCADE,
  server_id   BIGINT NOT NULL REFERENCES inventory.servers(id) ON DELETE CASCADE,
  x           DOUBLE PRECISION NOT NULL,
  y           DOUBLE PRECISION NOT NULL,
  pinned      BOOLEAN NOT NULL DEFAULT TRUE,
  collapsed   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_topology_view_server UNIQUE (view_id, server_id)
);

-- (view_id, ...) ya está cubierto por el índice de uq_topology_view_server
CREATE INDEX IF NOT EXISTS idx_topology_node_positions_server ON inventory.topology_node_positions (server_id);

DROP TRIGGER IF EXISTS t_topology_node_positions_updated ON inventory.topology_node_positions;
CREATE TRIGGER t_topology_node_positions_updated BEFORE UPDATE ON inventory.topology_node_positions
  FOR EACH ROW EXECUTE FUNCTION inventory.inventory_set_updated_at();

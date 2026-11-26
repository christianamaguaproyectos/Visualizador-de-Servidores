-- Impacto de servicios: qué le pasa a un servicio (p. ej. JD Edwards) si cae uno de sus servidores.
-- Idempotente: se puede ejecutar varias veces sobre una base existente (scripts/actualizar-bd.js).

-- Servicio de negocio
CREATE TABLE IF NOT EXISTS inventory.services (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  created_by VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Papel de cada servidor en el servicio y efecto de su caída:
--   TOTAL       el servicio deja de funcionar
--   PARCIAL     el servicio sigue, con limitaciones (impact_detail las describe)
--   NINGUNO     el servicio sigue funcionando
--   SIN_DEFINIR todavía no se sabe (hay que confirmarlo con el equipo responsable)
CREATE TABLE IF NOT EXISTS inventory.service_components (
  id BIGSERIAL PRIMARY KEY,
  service_id BIGINT NOT NULL REFERENCES inventory.services(id) ON DELETE CASCADE,
  server_id BIGINT NOT NULL REFERENCES inventory.servers(id) ON DELETE CASCADE,
  role VARCHAR(200),
  impact VARCHAR(20) NOT NULL DEFAULT 'SIN_DEFINIR',
  impact_detail TEXT,
  workaround TEXT,
  -- Servidores redundantes entre sí (mismo texto): el servicio solo se afecta si caen TODOS los del grupo
  redundancy_group VARCHAR(60),
  created_by VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_service_component UNIQUE (service_id, server_id),
  CONSTRAINT chk_service_component_impact CHECK (impact IN ('TOTAL', 'PARCIAL', 'NINGUNO', 'SIN_DEFINIR'))
);
CREATE INDEX IF NOT EXISTS idx_service_components_server ON inventory.service_components (server_id);

-- "server_id necesita required_server_id para funcionar": si el segundo cae, el primero también
CREATE TABLE IF NOT EXISTS inventory.server_requirements (
  id BIGSERIAL PRIMARY KEY,
  server_id BIGINT NOT NULL REFERENCES inventory.servers(id) ON DELETE CASCADE,
  required_server_id BIGINT NOT NULL REFERENCES inventory.servers(id) ON DELETE CASCADE,
  note TEXT,
  created_by VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_server_requirement UNIQUE (server_id, required_server_id),
  CONSTRAINT chk_server_requirement_no_self CHECK (server_id <> required_server_id)
);
CREATE INDEX IF NOT EXISTS idx_server_requirements_required ON inventory.server_requirements (required_server_id);

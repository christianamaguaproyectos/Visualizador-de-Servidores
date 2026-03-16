-- Schema de Inventario - PostgreSQL
-- Fecha: 2025-11-07

CREATE SCHEMA IF NOT EXISTS inventory;
SET search_path TO inventory, public;

DO $$ BEGIN
  CREATE TYPE server_type_enum AS ENUM ('fisicos','virtuales');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Racks normalizados
CREATE TABLE IF NOT EXISTS racks (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,   -- "Rack 1", "RACK ESXI-01", etc.
  raw_name    TEXT,                   -- valor crudo opcional
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Servidores (inventario principal)
CREATE TABLE IF NOT EXISTS servers (
  id              BIGSERIAL PRIMARY KEY,
  type            server_type_enum NOT NULL,      -- fisicos | virtuales
  identity_key    TEXT NOT NULL,                  -- clave derivada (ip/hostname/nombre/serverLabel)
  rack_id         BIGINT REFERENCES racks(id) ON DELETE SET NULL,
  rack_norm       TEXT,
  rack_raw        TEXT,
  server_label    TEXT,
  nombre          TEXT,
  ip              TEXT,
  hostname        TEXT,
  usuario         TEXT,
  marca           TEXT,
  modelo          TEXT,
  tipo            TEXT,
  hardware        TEXT,
  serie           TEXT,
  socket          TEXT,
  no_por_socket   TEXT,
  procesadores_logicos TEXT,
  ram_gb          TEXT,
  discos          TEXT,
  datastore       TEXT,
  conexion        TEXT,
  software        TEXT,
  so              TEXT,
  fecha_instalacion TEXT,
  fecha_mantenimiento TEXT,
  estado          TEXT,
  backup          TEXT,
  fecha_backup    TEXT,
  activo          TEXT,
  -- Campos para servidores físicos
  storage         TEXT,
  ocs_inventario  TEXT,
  datastore_virtuales TEXT,
  conexion_storage TEXT,
  -- Campos para servidores virtuales (seguridad)
  mtm             TEXT,
  config_backup   TEXT,
  sophos_ep       TEXT,
  vicarius        TEXT,
  acronis         TEXT,
  veeam           TEXT,
  manual          TEXT,
  zabbix          TEXT,
  wazuh           TEXT,
  bluelevel       TEXT,
  pam             TEXT,
  usuario_pam     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (type, identity_key)
);

CREATE INDEX IF NOT EXISTS servers_rack_idx ON servers(rack_id);
CREATE INDEX IF NOT EXISTS servers_type_idx ON servers(type);
CREATE INDEX IF NOT EXISTS servers_ip_idx ON servers(ip);
CREATE INDEX IF NOT EXISTS servers_hostname_idx ON servers(hostname);

CREATE OR REPLACE FUNCTION inventory_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_racks_updated ON racks;
CREATE TRIGGER t_racks_updated BEFORE UPDATE ON racks FOR EACH ROW EXECUTE FUNCTION inventory_set_updated_at();

DROP TRIGGER IF EXISTS t_servers_updated ON servers;
CREATE TRIGGER t_servers_updated BEFORE UPDATE ON servers FOR EACH ROW EXECUTE FUNCTION inventory_set_updated_at();

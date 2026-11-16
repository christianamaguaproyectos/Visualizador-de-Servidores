-- =================================================
-- Script de inicialización de base de datos
-- Se ejecuta automáticamente al crear el contenedor
-- Archivo: 00-init.sql
-- =================================================

-- Crear esquemas necesarios
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS monitoring;

-- Dar permisos al usuario de la app
GRANT ALL PRIVILEGES ON SCHEMA inventory TO CURRENT_USER;
GRANT ALL PRIVILEGES ON SCHEMA monitoring TO CURRENT_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA inventory TO CURRENT_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA monitoring TO CURRENT_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA inventory TO CURRENT_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA monitoring TO CURRENT_USER;

-- Establecer search_path por defecto en la base ACTUAL (antes tenía fijo "diagrama_servers":
-- con otro POSTGRES_DB la inicialización fallaba en este punto)
DO $$ BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path TO inventory, monitoring, public', current_database());
END $$;

-- Mensaje de confirmación
DO $$ BEGIN
  RAISE NOTICE 'Base de datos inicializada correctamente';
END $$;

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

-- Establecer search_path por defecto
ALTER DATABASE diagrama_servers SET search_path TO inventory, monitoring, public;

-- Mensaje de confirmación
DO $$ BEGIN
  RAISE NOTICE 'Base de datos inicializada correctamente';
END $$;

-- Agregar campos para posición y unidades de rack
-- Ejecutar con: psql -U mon_user -d monitoring -f add_rack_position_fields.sql

ALTER TABLE inventory.servers 
  ADD COLUMN IF NOT EXISTS rack_position INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rack_units INTEGER DEFAULT 2;

COMMENT ON COLUMN inventory.servers.rack_position IS 'Posición del servidor en el rack (1-42, comenzando desde abajo)';
COMMENT ON COLUMN inventory.servers.rack_units IS 'Cantidad de unidades que ocupa el servidor (1U, 2U, 4U, etc.)';

-- Actualizar servidores existentes con valores por defecto
UPDATE inventory.servers 
SET rack_units = 2 
WHERE rack_units IS NULL;

SELECT 'Campos rack_position y rack_units agregados exitosamente' AS resultado;

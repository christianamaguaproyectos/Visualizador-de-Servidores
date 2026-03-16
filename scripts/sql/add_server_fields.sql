-- Migración: Agregar campos de inventario a servidores
-- Fecha: 2026-01-07

SET search_path TO inventory, public;

-- Campos para servidores FÍSICOS
ALTER TABLE servers ADD COLUMN IF NOT EXISTS storage TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS ocs_inventario TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS datastore_virtuales TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS conexion_storage TEXT;

-- Campos para servidores VIRTUALES (seguridad y monitoreo)
ALTER TABLE servers ADD COLUMN IF NOT EXISTS mtm TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS config_backup TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS sophos_ep TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS vicarius TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS acronis TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS veeam TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS manual TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS zabbix TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS wazuh TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS bluelevel TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS pam TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS usuario_pam TEXT;

-- Comentarios para documentación
COMMENT ON COLUMN servers.storage IS 'Referencia a Storage físico';
COMMENT ON COLUMN servers.ocs_inventario IS 'Está en OCS Inventario (SI/NO)';
COMMENT ON COLUMN servers.datastore_virtuales IS 'Datastores virtuales asignados';
COMMENT ON COLUMN servers.conexion_storage IS 'Conexión a Storage (IP, HBA)';
COMMENT ON COLUMN servers.mtm IS 'Machine Type Model';
COMMENT ON COLUMN servers.config_backup IS 'Configuración de Backup';
COMMENT ON COLUMN servers.sophos_ep IS 'Sophos Endpoint Protection (SI/NO)';
COMMENT ON COLUMN servers.vicarius IS 'Gestión de Vulnerabilidades (SI/NO)';
COMMENT ON COLUMN servers.acronis IS 'Acronis Backup (SI/NO)';
COMMENT ON COLUMN servers.veeam IS 'Veeam Backup (SI/NO)';
COMMENT ON COLUMN servers.manual IS 'Documentación Manual (SI/NO)';
COMMENT ON COLUMN servers.zabbix IS 'Monitoreo Zabbix (SI/NO)';
COMMENT ON COLUMN servers.wazuh IS 'SIEM/IDS Wazuh (SI/NO)';
COMMENT ON COLUMN servers.bluelevel IS 'Categorización BlueLevel (SI/NO)';
COMMENT ON COLUMN servers.pam IS 'Privileged Access Management (SI/NO)';
COMMENT ON COLUMN servers.usuario_pam IS 'Usuario PAM asignado';

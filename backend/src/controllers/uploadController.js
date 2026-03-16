import configManager from '../config/configManager.js';
import excelParserService from '../services/excelParserService.js';
import sseService from '../services/sseService.js';
import { withClient } from '../config/db.js';
import { normalizeRackName } from '../utils/dataHelpers.js';
import Logger from '../utils/logger.js';

/**
 * Controlador para gestión de archivos subidos
 * Maneja la recepción y procesamiento de nuevos archivos Excel
 */
class UploadController {
  /**
   * Procesa un archivo Excel subido y lo sincroniza a PostgreSQL
   * POST /api/upload?type=fisicos|virtuales
   */
  async uploadFile(req, res) {
    Logger.info('=== SOLICITUD DE UPLOAD ===');
    
    // Validar que se recibió un archivo
    if (!req.file) {
      Logger.warn('No se recibió archivo en la solicitud');
      return res.status(400).json({ error: 'No se recibió archivo' });
    }

    Logger.info('Archivo recibido:', {
      filename: req.file.filename,
      size: req.file.size,
      path: req.file.path
    });

    try {
      // Determinar tipo de servidor
      const type = req.query.type === 'virtuales' ? 'virtuales' : 'fisicos';
      const config = configManager.getConfig();

      // Actualizar ruta en config (respetando lockOnFirstUpload)
      const hadPath = !!config.excelPaths?.[type];
      
      if (!hadPath || config.lockOnFirstUpload === false) {
        configManager.setExcelPath(type, req.file.path);
        Logger.success(`Configuración actualizada (${type}), nueva ruta: ${req.file.path}`);
      } else {
        Logger.info(`Path bloqueado (${type}). Manteniendo ruta: ${config.excelPaths[type]}`);
      }

      // Parsear Excel
      const data = excelParserService.parseExcelByType(type);
      const servers = data.servers || [];
      
      Logger.info(`Sincronizando ${servers.length} servidores (${type}) a PostgreSQL...`);
      
      // Sincronizar a PostgreSQL
      await withClient(async (client) => {
        for (const s of servers) {
          const rackNorm = s.rackNorm || normalizeRackName(s, type);
          if (!rackNorm) continue;
          
          // Upsert rack
          const { rows } = await client.query(
            `INSERT INTO inventory.racks(name, raw_name) VALUES($1,$2)
             ON CONFLICT (name) DO UPDATE SET raw_name = COALESCE(inventory.racks.raw_name, EXCLUDED.raw_name), updated_at = NOW()
             RETURNING id`,
            [rackNorm, s.rack || null]
          );
          const rackId = rows[0].id;
          
          // Upsert server
          const identity = (s.ip || s.hostname || s.nombre || s.serverLabel || '').toString().trim().toLowerCase();
          const cols = [
            'type','identity_key','rack_id','rack_norm','rack_raw','server_label','nombre','ip','hostname','usuario','marca','modelo','tipo','hardware','serie','socket','no_por_socket','procesadores_logicos','ram_gb','discos','datastore','conexion','software','so','fecha_instalacion','fecha_mantenimiento','estado','backup','fecha_backup','activo'
          ];
          const vals = [
            type, identity, rackId, rackNorm, s.rack || null, s.serverLabel, s.nombre, s.ip, s.hostname, s.usuario, s.marca, s.modelo, s.tipo, s.HARDWARE || s.hardware, s.serie, s.socket, s.noPorSocket, s.procesadoresLogicos, s.ramGb, s.discos, s.datastore, s.conexion, s.software, s.so, s.fechaInstalacion, s.fechaMantenimiento, s.estado, s.backup, s.fechaBackup, s.activo
          ];
          const setCols = cols.map((c) => `${c}=EXCLUDED.${c}`).join(', ');
          const placeholders = cols.map((_, i) => `$${i+1}`).join(', ');
          
          await client.query(
            `INSERT INTO inventory.servers(${cols.join(',')}) VALUES (${placeholders})
             ON CONFLICT (type, identity_key) DO UPDATE SET ${setCols}, updated_at = NOW()`,
            vals
          );
        }
      });
      
      Logger.success(`${type}: ${servers.length} servidores sincronizados a PostgreSQL`);

      // Notificar a clientes SSE
      sseService.notifyDataUpdate();

      res.json({
        ok: true,
        type,
        path: config.excelPaths[type],
        serversCount: servers.length,
        message: 'Archivo procesado y sincronizado a PostgreSQL'
      });

    } catch (error) {
      Logger.error('Error procesando upload:', error);
      res.status(500).json({
        error: 'Error procesando archivo',
        details: error?.message || String(error)
      });
    }
  }
}

export default new UploadController();

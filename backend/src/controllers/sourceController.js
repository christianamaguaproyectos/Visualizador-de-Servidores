import fs from 'fs';
import path from 'path';
import configManager from '../config/configManager.js';
import excelParserService from '../services/excelParserService.js';
import sseService from '../services/sseService.js';
import { hasValidExcelExtension, normalizeRackName } from '../utils/dataHelpers.js';
import { withClient } from '../config/db.js';
import Logger from '../utils/logger.js';

/**
 * Controlador para gestión de rutas de origen de archivos Excel
 * Permite vincular/desvincular rutas locales de Excel
 */
class SourceController {
  /**
   * Obtiene la ruta actual del Excel para un tipo
   * GET /api/source-path?type=fisicos|virtuales
   */
  getSourcePath(req, res) {
    const type = this._validateType(req.query.type);
    
    if (!type) {
      return res.status(400).json({
        error: 'Parámetro type requerido (fisicos|virtuales)'
      });
    }

    const config = configManager.getConfig();
    const currentPath = config.excelPaths?.[type] || null;

    res.json({
      type,
      path: currentPath,
      lockOnFirstUpload: config.lockOnFirstUpload
    });
  }

  /**
   * Vincula una nueva ruta local como fuente del Excel y sincroniza a PostgreSQL
   * POST /api/source-path?type=fisicos|virtuales
   * Body: { path: "/ruta/al/archivo.xlsx" }
   */
  async setSourcePath(req, res) {
    try {
      const type = this._validateType(req.query.type);
      
      if (!type) {
        return res.status(400).json({
          error: 'Parámetro type requerido (fisicos|virtuales)'
        });
      }

      // Obtener path del body
      const requestPath = req.body?.path || req.body?.filePath || '';
      
      if (!requestPath) {
        return res.status(400).json({
          error: 'Debe proporcionar "path" en el body'
        });
      }

      // Validar path
      const absolutePath = path.resolve(requestPath);
      
      if (!fs.existsSync(absolutePath)) {
        return res.status(400).json({
          error: `La ruta no existe: ${absolutePath}`
        });
      }

      if (!hasValidExcelExtension(absolutePath)) {
        return res.status(400).json({
          error: 'El archivo debe ser .xlsx o .xls'
        });
      }

      // Actualizar configuración
      configManager.setExcelPath(type, absolutePath);
      Logger.success(`Ruta vinculada (${type}): ${absolutePath}`);

      // Parsear Excel
      const data = excelParserService.parseExcelByType(type);
      const servers = data.servers || [];
      
      Logger.info(`Sincronizando ${servers.length} servidores (${type}) a PostgreSQL...`);
      
      // Sincronizar a PostgreSQL
      await withClient(async (client) => {
        for (const s of servers) {
          const rackNorm = s.rackNorm || normalizeRackName(s, type);
          if (!rackNorm) continue;
          
          const { rows } = await client.query(
            `INSERT INTO inventory.racks(name, raw_name) VALUES($1,$2)
             ON CONFLICT (name) DO UPDATE SET raw_name = COALESCE(inventory.racks.raw_name, EXCLUDED.raw_name), updated_at = NOW()
             RETURNING id`,
            [rackNorm, s.rack || null]
          );
          const rackId = rows[0].id;
          
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

      // Notificar cambios
      sseService.notifyDataUpdate();

      res.json({
        ok: true,
        type,
        path: absolutePath,
        serversCount: servers.length,
        message: 'Ruta vinculada y datos sincronizados a PostgreSQL'
      });

    } catch (error) {
      Logger.error('Error vinculando ruta:', error);
      res.status(500).json({
        error: 'No se pudo vincular la ruta',
        details: error?.message || String(error)
      });
    }
  }

  /**
   * Desvincula la ruta actual (solo actualiza config, datos permanecen en BD)
   * DELETE /api/source-path?type=fisicos|virtuales
   */
  removeSourcePath(req, res) {
    try {
      const type = this._validateType(req.query.type);
      
      if (!type) {
        return res.status(400).json({
          error: 'Parámetro type requerido (fisicos|virtuales)'
        });
      }

      const config = configManager.getConfig();
      const previousPath = config.excelPaths?.[type] || null;

      // Eliminar ruta de configuración
      configManager.removeExcelPath(type);
      Logger.info(`Ruta desvinculada (${type}): ${previousPath}`);

      res.json({
        ok: true,
        type,
        previousPath,
        path: null,
        message: 'Ruta desvinculada (datos permanecen en PostgreSQL)'
      });

    } catch (error) {
      Logger.error('Error desvinculando ruta:', error);
      res.status(500).json({
        error: 'No se pudo desvincular la ruta',
        details: error?.message || String(error)
      });
    }
  }

  /**
   * Valida y normaliza el parámetro de tipo
   * @param {string} typeParam - Parámetro type del query
   * @returns {string|null} Tipo válido o null
   */
  _validateType(typeParam) {
    if (typeParam === 'fisicos' || typeParam === 'virtuales') {
      return typeParam;
    }
    return null;
  }
}

export default new SourceController();

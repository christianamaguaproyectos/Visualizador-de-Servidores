import configManager from '../config/configManager.js';
import cacheService from '../services/cacheService.js';
import Logger from '../utils/logger.js';

/**
 * Controlador para endpoints de metadata
 * Proporciona información sobre configuración y estado del sistema
 */
class MetaController {
  /**
   * Obtiene metadata completa del sistema
   * GET /api/meta
   */
  getMeta(req, res) {
    try {
      const config = configManager.getConfig();
      const cacheMetadata = cacheService.getMetadata();

      res.json({
        excelPaths: config.excelPaths,
        sheetName: config.sheetName || null,
        sheetNameVirtuales: config.sheetNameVirtuales || null,
        caches: cacheMetadata
      });

    } catch (error) {
      Logger.error('Error en /api/meta:', error);
      res.status(500).json({ error: 'Error obteniendo metadata' });
    }
  }
}

export default new MetaController();

import { readFileSync } from 'fs';
import prisma from '../config/prisma.js';
import env from '../config/env.js';

// Versión de la app leída una sola vez desde package.json
const APP_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).version || null;
  } catch {
    return null;
  }
})();

/**
 * Controlador para endpoints de metadata
 * Devuelve información básica y segura del sistema (sin rutas de disco ni secretos).
 */
class MetaController {
  /**
   * Obtiene metadata del sistema
   * GET /api/meta
   */
  async getMeta(req, res, next) {
    try {
      const [racks, servers, clusters] = await Promise.all([
        prisma.rack.count(),
        prisma.server.count(),
        prisma.virtualCluster.count(),
      ]);

      res.json({
        mode: 'postgresql',
        version: APP_VERSION,
        environment: env.NODE_ENV,
        monitoringEnabled: env.MONITORING_ENABLED,
        counts: { racks, servers, clusters },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new MetaController();

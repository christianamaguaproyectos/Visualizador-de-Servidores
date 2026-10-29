/**
 * Data Controller (Clean Architecture)
 * 
 * Responsabilidad ÚNICA: parsear request → delegar al service → formatear response.
 * Toda la lógica de negocio y acceso a datos está en ServerService y ServerRepository.
 */

import serverService from '../services/serverService.js';
import sseService from '../services/sseService.js';
import monitoringSyncService from '../services/monitoringSyncService.js';
import { APP_CONFIG } from '../config/constants.js';

class DataController {
  /**
   * GET /api/data?type=fisicos|virtuales
   */
  async getData(req, res, next) {
    try {
      const type = this._getTypeFromQuery(req.query.type);
      const payload = await serverService.getDataGroupedByRack(type);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/racks?type=fisicos|virtuales
   */
  async getRacks(req, res, next) {
    try {
      const type = this._getTypeFromQuery(req.query.type);
      const racks = await serverService.getRacksWithCounts(type);
      res.json(racks);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/servers?type=fisicos|virtuales
   */
  async getServers(req, res, next) {
    try {
      const type = this._getTypeFromQuery(req.query.type);
      const servers = await serverService.getServersByType(type);
      res.json(servers);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/servers
   */
  async createServer(req, res, next) {
    try {
      const result = await serverService.createServer(req.body);

      // Notificar cambios via SSE
      sseService.notifyDataUpdate();

      // Sincronizar con monitoreo
      let monitoring = null;
      try {
        monitoring = await monitoringSyncService.syncServerToMonitoring({
          id: result.id,
          nombre: req.body.nombre,
          ip: req.body.ip,
          type: req.body.type,
          rack_norm: req.body.rack_norm,
          estado: req.body.estado,
        });
      } catch (_) { /* monitoreo es opcional */ }

      res.status(201).json({
        ok: true,
        id: result.id,
        message: result.message,
        monitoring,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/servers/:id
   */
  async updateServer(req, res, next) {
    try {
      const result = await serverService.updateServer(req.params.id, req.body);

      sseService.notifyDataUpdate();

      // Sincronizar con monitoreo
      let monitoring = null;
      try {
        const s = result.server;
        monitoring = await monitoringSyncService.syncServerToMonitoring({
          id: s.id,
          nombre: s.nombre,
          ip: s.ip,
          type: s.type,
          rack_norm: s.rackNorm,
          estado: s.estado,
        });
      } catch (_) { /* monitoreo es opcional */ }

      res.json({ ok: true, message: result.message, monitoring });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/servers/:id
   */
  async deleteServer(req, res, next) {
    try {
      const result = await serverService.deleteServer(req.params.id);

      sseService.notifyDataUpdate();

      // Deshabilitar en monitoreo
      let monitoring = null;
      try {
        monitoring = await monitoringSyncService.removeServerFromMonitoring({
          nombre: result.deleted.nombre,
          ip: result.deleted.ip,
        });
      } catch (_) { /* monitoreo es opcional */ }

      res.json({ ok: true, message: result.message, monitoring });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/servers/:id/move
   */
  async moveServer(req, res, next) {
    try {
      const result = await serverService.moveServer(req.params.id, req.body);
      sseService.notifyDataUpdate();
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/servers/:id/reposition
   */
  async repositionServer(req, res, next) {
    try {
      const result = await serverService.repositionServer(req.params.id, req.body);
      sseService.notifyDataUpdate();
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/servers/swap
   */
  async swapServers(req, res, next) {
    try {
      const result = await serverService.swapServers(req.body.server1_id, req.body.server2_id);
      sseService.notifyDataUpdate();
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Normaliza el tipo de servidor desde query params
   */
  _getTypeFromQuery(typeQuery) {
    return typeQuery === APP_CONFIG.SERVER_TYPES.VIRTUALES
      ? APP_CONFIG.SERVER_TYPES.VIRTUALES
      : APP_CONFIG.SERVER_TYPES.FISICOS;
  }
}

export default new DataController();
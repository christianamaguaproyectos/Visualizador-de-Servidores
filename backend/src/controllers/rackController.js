/**
 * Rack Controller (Clean Architecture)
 * Delgado: parsea request → delega a rackService → formatea response.
 */

import rackService from '../services/rackService.js';
import sseService from '../services/sseService.js';

class RackController {
  /**
   * POST /api/racks
   */
  async createRack(req, res, next) {
    try {
      const result = await rackService.createRack(req.body);
      sseService.notifyDataUpdate();
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/racks/:id
   */
  async updateRack(req, res, next) {
    try {
      const result = await rackService.updateRack(req.params.id, req.body);
      sseService.notifyDataUpdate();
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/racks/:id
   */
  async deleteRack(req, res, next) {
    try {
      const force = req.query.force === 'true';
      const result = await rackService.deleteRack(req.params.id, force);
      sseService.notifyDataUpdate();
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/racks/by-name/:name
   */
  async deleteRackByName(req, res, next) {
    try {
      const force = req.query.force === 'true';
      const result = await rackService.deleteRackByName(req.params.name, force);
      sseService.notifyDataUpdate();
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/racks/:id
   */
  async getRackDetails(req, res, next) {
    try {
      const result = await rackService.getRackDetails(req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new RackController();

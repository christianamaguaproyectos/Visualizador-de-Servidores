/**
 * Topology Controller (Fase 1.3) — Mapa de Dependencias y Topología.
 * Delgado: valida la entrada (dtos/topologyDto.js) → delega en topologyService → responde JSON.
 * Todo error va a next(err): el errorHandler nunca expone mensajes crudos de PostgreSQL.
 */

import topologyService from '../services/topologyService.js';
import {
  parseBooleanQuery, parseDependencyCreate, parseDependencyUpdate, parseId, parseIdList,
  parsePositionsPayload, parseViewCreate, parseViewSelector, parseViewUpdate, sessionUsername,
} from '../dtos/topologyDto.js';
import { ValidationError } from '../middleware/errorHandler.js';

/** Un parámetro de query repetido (?a=1&a=2) llega como array: se rechaza */
function querySimple(req, nombre) {
  const v = req.query[nombre];
  if (Array.isArray(v) || (v !== undefined && typeof v !== 'string')) {
    throw new ValidationError(`${nombre} solo puede indicarse una vez`);
  }
  return v;
}

class TopologyController {
  // ── /api/topology ──────────────────────────

  /** GET /api/topology/graph?view=<slug|id>&includeIsolated=true|false&simulateDownIds=1,2,3 */
  async getGraph(req, res, next) {
    try {
      const graph = await topologyService.getTopologyGraph({
        viewSelector: parseViewSelector(querySimple(req, 'view')),
        includeIsolated: parseBooleanQuery(querySimple(req, 'includeIsolated'), 'includeIsolated', false),
        simulateDownIds: parseIdList(querySimple(req, 'simulateDownIds'), 'simulateDownIds'),
      });
      res.json(graph);
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/topology/views */
  async listViews(req, res, next) {
    try {
      res.json({ views: await topologyService.listViews() });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/topology/views */
  async createView(req, res, next) {
    try {
      const data = parseViewCreate(req.body);
      const view = await topologyService.createView(data, sessionUsername(req));
      res.status(201).json({ view });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/topology/views/:id */
  async updateView(req, res, next) {
    try {
      const id = parseId(req.params.id);
      const view = await topologyService.updateView(id, parseViewUpdate(req.body));
      res.json({ view });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/topology/views/:id/positions */
  async saveViewPositions(req, res, next) {
    try {
      const id = parseId(req.params.id);
      const result = await topologyService.saveViewPositions(id, parsePositionsPayload(req.body));
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/topology/views/:id */
  async deleteView(req, res, next) {
    try {
      const result = await topologyService.deleteView(parseId(req.params.id));
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  // ── /api/dependencies ──────────────────────

  /** GET /api/dependencies[?serverId=] */
  async listDependencies(req, res, next) {
    try {
      const serverIdRaw = querySimple(req, 'serverId');
      const serverId = serverIdRaw === undefined || serverIdRaw === '' ? null : parseId(serverIdRaw, 'serverId');
      res.json({ dependencies: await topologyService.listDependencies({ serverId }) });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/dependencies/server/:id/impact */
  async getServerImpact(req, res, next) {
    try {
      res.json(await topologyService.getServerImpactAnalysis(parseId(req.params.id)));
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/dependencies */
  async createDependency(req, res, next) {
    try {
      const data = parseDependencyCreate(req.body);
      const result = await topologyService.createDependency(data, sessionUsername(req));
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/dependencies/:id */
  async updateDependency(req, res, next) {
    try {
      const id = parseId(req.params.id);
      const dependency = await topologyService.updateDependency(id, parseDependencyUpdate(req.body));
      res.json({ dependency });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/dependencies/:id */
  async deleteDependency(req, res, next) {
    try {
      const result = await topologyService.deleteDependency(parseId(req.params.id));
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  }
}

export default new TopologyController();

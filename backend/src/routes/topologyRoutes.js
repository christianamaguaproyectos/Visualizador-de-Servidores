/**
 * Rutas del Mapa de Dependencias y Topología (Fase 1.3).
 * Se montan en backend/server.js DESPUÉS de requireAuth (lectura: cualquier
 * usuario autenticado) y ANTES del 404 de /api. Escritura: requireAdmin
 * (+ CSRF global de csrfMiddleware.js).
 *
 *   /api/topology      -> topologyRouter
 *   /api/dependencies  -> dependenciesRouter
 */
import express from 'express';
import topologyController from '../controllers/topologyController.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

export const topologyRouter = express.Router();

topologyRouter.get('/graph', (req, res, next) => topologyController.getGraph(req, res, next));
topologyRouter.get('/views', (req, res, next) => topologyController.listViews(req, res, next));
topologyRouter.post('/views', requireAdmin, (req, res, next) => topologyController.createView(req, res, next));
topologyRouter.put('/views/:id', requireAdmin, (req, res, next) => topologyController.updateView(req, res, next));
topologyRouter.put('/views/:id/positions', requireAdmin, (req, res, next) => topologyController.saveViewPositions(req, res, next));
topologyRouter.delete('/views/:id', requireAdmin, (req, res, next) => topologyController.deleteView(req, res, next));

export const dependenciesRouter = express.Router();

dependenciesRouter.get('/', (req, res, next) => topologyController.listDependencies(req, res, next));
dependenciesRouter.get('/server/:id/impact', (req, res, next) => topologyController.getServerImpact(req, res, next));
dependenciesRouter.post('/', requireAdmin, (req, res, next) => topologyController.createDependency(req, res, next));
dependenciesRouter.put('/:id', requireAdmin, (req, res, next) => topologyController.updateDependency(req, res, next));
dependenciesRouter.delete('/:id', requireAdmin, (req, res, next) => topologyController.deleteDependency(req, res, next));

export default topologyRouter;

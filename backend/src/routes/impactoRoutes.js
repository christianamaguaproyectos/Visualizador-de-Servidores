/**
 * Rutas de Impacto de servicios. Se montan en backend/server.js DESPUÉS de requireAuth
 * (lectura y simulación: cualquier usuario autenticado) y ANTES del 404 de /api.
 * Escritura: requireAdmin (+ CSRF global de csrfMiddleware.js).
 *
 *   /api/impacto -> impactoRouter
 */
import express from 'express';
import c from '../controllers/impactoController.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

const impactoRouter = express.Router();

impactoRouter.get('/', c.panorama);
impactoRouter.get('/servidores', c.servidores);
impactoRouter.get('/simular', c.simular);

impactoRouter.post('/servicios', requireAdmin, c.crearServicio);
impactoRouter.put('/servicios/:id', requireAdmin, c.editarServicio);
impactoRouter.delete('/servicios/:id', requireAdmin, c.eliminarServicio);
impactoRouter.post('/servicios/:id/componentes', requireAdmin, c.agregarComponente);

impactoRouter.put('/componentes/:id', requireAdmin, c.editarComponente);
impactoRouter.delete('/componentes/:id', requireAdmin, c.eliminarComponente);

impactoRouter.post('/requisitos', requireAdmin, c.crearRequisito);
impactoRouter.delete('/requisitos/:id', requireAdmin, c.eliminarRequisito);

export default impactoRouter;

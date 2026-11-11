/**
 * exportRoutes.js - Rutas para exportación de datos a Excel
 */

import express from 'express';
import exportController from '../controllers/exportController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(requireAuth);

// GET /api/export/fisicos - Exportar servidores físicos
router.get('/fisicos', (req, res, next) => exportController.exportFisicos(req, res, next));

// GET /api/export/virtuales - Exportar máquinas virtuales
router.get('/virtuales', (req, res, next) => exportController.exportVirtuales(req, res, next));

export default router;

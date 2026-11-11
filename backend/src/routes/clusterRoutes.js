import express from 'express';
import clusterController from '../controllers/clusterController.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', (req, res, next) => clusterController.getAllClusters(req, res, next));
router.get('/:id', (req, res, next) => clusterController.getClusterById(req, res, next));
router.get('/:id/hosts', (req, res, next) => clusterController.getClusterHosts(req, res, next));

router.post('/', requireAdmin, (req, res, next) => clusterController.createCluster(req, res, next));
router.put('/:id', requireAdmin, (req, res, next) => clusterController.updateCluster(req, res, next));
router.delete('/:id', requireAdmin, (req, res, next) => clusterController.deleteCluster(req, res, next));

router.post('/:id/hosts', requireAdmin, (req, res, next) => clusterController.addHostToCluster(req, res, next));
router.delete('/:id/hosts/:rackId', requireAdmin, (req, res, next) => clusterController.removeHostFromCluster(req, res, next));

export default router;

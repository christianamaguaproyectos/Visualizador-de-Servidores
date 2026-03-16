import express from 'express';
import clusterController from '../controllers/clusterController.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', (req, res) => clusterController.getAllClusters(req, res));
router.get('/:id', (req, res) => clusterController.getClusterById(req, res));
router.get('/:id/hosts', (req, res) => clusterController.getClusterHosts(req, res));

router.post('/', requireAdmin, (req, res) => clusterController.createCluster(req, res));
router.put('/:id', requireAdmin, (req, res) => clusterController.updateCluster(req, res));
router.delete('/:id', requireAdmin, (req, res) => clusterController.deleteCluster(req, res));

router.post('/:id/hosts', requireAdmin, (req, res) => clusterController.addHostToCluster(req, res));
router.delete('/:id/hosts/:rackId', requireAdmin, (req, res) => clusterController.removeHostFromCluster(req, res));

export default router;

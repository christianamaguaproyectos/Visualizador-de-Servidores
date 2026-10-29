/**
 * Cluster Controller (Clean Architecture)
 * Delgado: parsea request → delega a clusterService → formatea response.
 */

import clusterService from '../services/clusterService.js';

class ClusterController {
  async getAllClusters(req, res, next) {
    try {
      const clusters = await clusterService.getAllClusters();
      res.json(clusters);
    } catch (error) {
      next(error);
    }
  }

  async getClusterById(req, res, next) {
    try {
      const cluster = await clusterService.getClusterById(req.params.id);
      res.json(cluster);
    } catch (error) {
      next(error);
    }
  }

  async createCluster(req, res, next) {
    try {
      const cluster = await clusterService.createCluster(req.body);
      res.status(201).json(cluster);
    } catch (error) {
      next(error);
    }
  }

  async updateCluster(req, res, next) {
    try {
      const cluster = await clusterService.updateCluster(req.params.id, req.body);
      res.json(cluster);
    } catch (error) {
      next(error);
    }
  }

  async deleteCluster(req, res, next) {
    try {
      const result = await clusterService.deleteCluster(req.params.id);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getClusterHosts(req, res, next) {
    try {
      const hosts = await clusterService.getClusterHosts(req.params.id);
      res.json(hosts);
    } catch (error) {
      next(error);
    }
  }

  async addHostToCluster(req, res, next) {
    try {
      const result = await clusterService.addHostToCluster(req.params.id, req.body.rack_id);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async removeHostFromCluster(req, res, next) {
    try {
      const result = await clusterService.removeHostFromCluster(req.params.id, req.params.rackId);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  }
}

export default new ClusterController();

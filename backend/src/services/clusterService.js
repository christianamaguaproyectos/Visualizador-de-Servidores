/**
 * Cluster Service
 * Lógica de negocio para clusters virtuales.
 */

import clusterRepository from '../repositories/clusterRepository.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import Logger from '../utils/logger.js';

class ClusterService {
  async getAllClusters() {
    return clusterRepository.findAll();
  }

  async getClusterById(id) {
    const cluster = await clusterRepository.findById(id);
    if (!cluster) throw new NotFoundError('Cluster', id);
    return cluster;
  }

  async createCluster(data) {
    if (!data.name || !data.key) {
      throw new ValidationError('Campos requeridos: name, key');
    }

    const cluster = await clusterRepository.create({
      name: data.name,
      key: data.key,
      description: data.description || null,
      type: data.type || 'cluster',
      displayOrder: data.display_order ?? 0,
    });

    Logger.success(`Cluster creado: ${data.name} (${data.key})`);
    return cluster;
  }

  async updateCluster(id, data) {
    const updateData = {};
    if (data.name != null) updateData.name = data.name;
    if (data.key != null) updateData.key = data.key;
    if (data.description != null) updateData.description = data.description;
    if (data.type != null) updateData.type = data.type;
    if (data.display_order != null) updateData.displayOrder = data.display_order;

    const cluster = await clusterRepository.update(id, updateData);
    Logger.success(`Cluster actualizado: ${cluster.name} (ID: ${id})`);
    return cluster;
  }

  async deleteCluster(id) {
    const existing = await clusterRepository.findById(id);
    if (!existing) throw new NotFoundError('Cluster', id);

    await clusterRepository.delete(id);
    Logger.success(`Cluster eliminado: ${existing.name} (ID: ${id})`);
    return { message: 'Cluster eliminado exitosamente' };
  }

  async getClusterHosts(clusterId) {
    const hosts = await clusterRepository.findHosts(clusterId);
    return hosts.map(h => ({
      id: h.id,
      cluster_id: h.clusterId,
      rack_id: h.rackId,
      rack_name: h.rack?.name,
    }));
  }

  async addHostToCluster(clusterId, rackId) {
    if (!rackId) throw new ValidationError('Campo requerido: rack_id');
    const result = await clusterRepository.addHost(clusterId, rackId);
    return result;
  }

  async removeHostFromCluster(clusterId, rackId) {
    await clusterRepository.removeHost(clusterId, rackId);
    return { message: 'Host removido del cluster' };
  }
}

export default new ClusterService();

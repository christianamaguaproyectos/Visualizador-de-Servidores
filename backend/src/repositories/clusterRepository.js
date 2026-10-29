/**
 * Cluster Repository
 * Capa de acceso a datos para clusters virtuales.
 */

import prisma from '../config/prisma.js';

class ClusterRepository {
  /**
   * Obtiene todos los clusters ordenados
   * @returns {Promise<Array>}
   */
  async findAll() {
    return prisma.virtualCluster.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Busca un cluster por ID
   * @param {number|string} id
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    return prisma.virtualCluster.findUnique({
      where: { id: BigInt(id) },
    });
  }

  /**
   * Crea un nuevo cluster
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async create(data) {
    return prisma.virtualCluster.create({ data });
  }

  /**
   * Actualiza un cluster
   * @param {number|string} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async update(id, data) {
    return prisma.virtualCluster.update({
      where: { id: BigInt(id) },
      data,
    });
  }

  /**
   * Elimina un cluster
   * @param {number|string} id
   * @returns {Promise<Object>}
   */
  async delete(id) {
    return prisma.virtualCluster.delete({
      where: { id: BigInt(id) },
    });
  }

  /**
   * Obtiene los hosts de un cluster (con nombre del rack)
   * @param {number|string} clusterId
   * @returns {Promise<Array>}
   */
  async findHosts(clusterId) {
    return prisma.clusterHost.findMany({
      where: { clusterId: BigInt(clusterId) },
      include: {
        rack: {
          select: { id: true, name: true },
        },
      },
      orderBy: { rack: { name: 'asc' } },
    });
  }

  /**
   * Agrega un host a un cluster (upsert - ignora si ya existe)
   * @param {number|string} clusterId
   * @param {number|string} rackId
   * @returns {Promise<Object>}
   */
  async addHost(clusterId, rackId) {
    return prisma.clusterHost.upsert({
      where: {
        clusterId_rackId: {
          clusterId: BigInt(clusterId),
          rackId: BigInt(rackId),
        },
      },
      update: {},
      create: {
        clusterId: BigInt(clusterId),
        rackId: BigInt(rackId),
      },
    });
  }

  /**
   * Remueve un host de un cluster
   * @param {number|string} clusterId
   * @param {number|string} rackId
   * @returns {Promise<Object>}
   */
  async removeHost(clusterId, rackId) {
    return prisma.clusterHost.delete({
      where: {
        clusterId_rackId: {
          clusterId: BigInt(clusterId),
          rackId: BigInt(rackId),
        },
      },
    });
  }
}

export default new ClusterRepository();

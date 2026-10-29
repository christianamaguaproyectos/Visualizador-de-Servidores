/**
 * Server Repository
 * Capa de acceso a datos — única responsable de hablar con Prisma.
 * NO contiene lógica de negocio ni conoce Express.
 */

import prisma from '../config/prisma.js';

class ServerRepository {
  /**
   * Obtiene todos los servidores de un tipo con su rack asociado
   * @param {'fisicos'|'virtuales'} type
   * @returns {Promise<Array>}
   */
  async findAllByType(type) {
    return prisma.server.findMany({
      where: { type },
      include: { rack: true },
    });
  }

  /**
   * Busca un servidor por ID
   * @param {number|string} id
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    return prisma.server.findUnique({
      where: { id: BigInt(id) },
      include: { rack: true },
    });
  }

  /**
   * Crea un nuevo servidor
   * @param {Object} data - Datos Prisma del servidor
   * @returns {Promise<Object>} Servidor creado
   */
  async create(data) {
    return prisma.server.create({
      data,
      include: { rack: true },
    });
  }

  /**
   * Actualiza un servidor existente
   * @param {number|string} id
   * @param {Object} data - Campos a actualizar
   * @returns {Promise<Object|null>}
   */
  async update(id, data) {
    return prisma.server.update({
      where: { id: BigInt(id) },
      data,
      include: { rack: true },
    });
  }

  /**
   * Elimina un servidor por ID
   * @param {number|string} id
   * @returns {Promise<Object>} Servidor eliminado
   */
  async delete(id) {
    return prisma.server.delete({
      where: { id: BigInt(id) },
    });
  }

  /**
   * Busca servidores en conflicto de posición dentro de un rack
   * @param {string} rackNorm - Nombre normalizado del rack
   * @param {number} minPos - Posición mínima
   * @param {number} maxPos - Posición máxima
   * @param {number|string} [excludeId] - ID del servidor a excluir
   * @returns {Promise<Array>}
   */
  async findPositionConflicts(rackNorm, minPos, maxPos, excludeId = null) {
    const where = {
      rackNorm,
      rackPosition: { not: null },
      OR: [
        { rackPosition: { gte: minPos, lte: maxPos } },
      ],
    };

    if (excludeId) {
      where.id = { not: BigInt(excludeId) };
    }

    return prisma.server.findMany({
      where,
      select: { id: true, nombre: true, rackPosition: true, rackUnits: true },
    });
  }

  /**
   * Actualiza posición y rack de un servidor (para swap / move)
   * @param {number|string} id
   * @param {Object} positionData - { rackId, rackNorm, rackRaw, rackPosition }
   * @returns {Promise<Object>}
   */
  async updatePosition(id, positionData) {
    return prisma.server.update({
      where: { id: BigInt(id) },
      data: positionData,
    });
  }
}

export default new ServerRepository();

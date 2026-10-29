/**
 * Rack Repository
 * Capa de acceso a datos para racks.
 */

import prisma from '../config/prisma.js';

class RackRepository {
  /**
   * Obtiene todos los racks de un tipo
   * @param {'fisicos'|'virtuales'} type
   * @returns {Promise<Array>}
   */
  async findAllByType(type) {
    return prisma.rack.findMany({
      where: { type },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Busca un rack por ID
   * @param {number|string} id
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    return prisma.rack.findUnique({
      where: { id: BigInt(id) },
    });
  }

  /**
   * Busca un rack por nombre y tipo
   * @param {string} name
   * @param {string} [type]
   * @returns {Promise<Object|null>}
   */
  async findByNameAndType(name, type) {
    const where = { name };
    if (type) where.type = type;
    return prisma.rack.findFirst({ where });
  }

  /**
   * Busca un rack por nombre
   * @param {string} name
   * @returns {Promise<Object|null>}
   */
  async findByName(name) {
    return prisma.rack.findFirst({
      where: { name },
    });
  }

  /**
   * Crea un nuevo rack
   * @param {{ name: string, rawName?: string, type?: string }} data
   * @returns {Promise<Object>}
   */
  async create(data) {
    return prisma.rack.create({ data });
  }

  /**
   * Actualiza un rack existente
   * @param {number|string} id
   * @param {Object} data
   * @returns {Promise<Object|null>}
   */
  async update(id, data) {
    return prisma.rack.update({
      where: { id: BigInt(id) },
      data,
    });
  }

  /**
   * Elimina un rack por ID
   * @param {number|string} id
   * @returns {Promise<Object>}
   */
  async delete(id) {
    return prisma.rack.delete({
      where: { id: BigInt(id) },
    });
  }

  /**
   * Obtiene un rack con todos sus servidores
   * @param {number|string} id
   * @returns {Promise<Object|null>}
   */
  async findByIdWithServers(id) {
    return prisma.rack.findUnique({
      where: { id: BigInt(id) },
      include: {
        servers: {
          orderBy: { nombre: 'asc' },
        },
      },
    });
  }

  /**
   * Cuenta servidores en un rack
   * @param {number|string} rackId
   * @returns {Promise<number>}
   */
  async countServers(rackId) {
    return prisma.server.count({
      where: { rackId: BigInt(rackId) },
    });
  }

  /**
   * Elimina todos los servidores de un rack
   * @param {number|string} rackId
   * @returns {Promise<{count: number}>}
   */
  async deleteServersByRackId(rackId) {
    return prisma.server.deleteMany({
      where: { rackId: BigInt(rackId) },
    });
  }

  /**
   * Busca o crea un rack por nombre y tipo
   * @param {string} name
   * @param {string} rawName
   * @param {string} type
   * @returns {Promise<Object>} Rack existente o recién creado
   */
  async findOrCreate(name, rawName, type) {
    let rack = await this.findByNameAndType(name, type);
    if (!rack) {
      rack = await this.create({
        name,
        rawName: rawName || name,
        type: type || 'fisicos',
      });
    }
    return rack;
  }

  /**
   * Conteo de servidores agrupados por rack_id para un tipo
   * @param {'fisicos'|'virtuales'} type
   * @returns {Promise<Array<{rackId: BigInt, _count: {id: number}}>>}
   */
  async serverCountsByType(type) {
    return prisma.server.groupBy({
      by: ['rackId'],
      where: { type },
      _count: { id: true },
    });
  }
}

export default new RackRepository();

/**
 * Rack Service
 * Lógica de negocio pura para racks.
 * NO conoce Express (req/res).
 */

import rackRepository from '../repositories/rackRepository.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import Logger from '../utils/logger.js';

class RackService {
  /**
   * Crea un nuevo rack
   * @param {{ name: string, raw_name?: string, type?: string }} data
   * @returns {Promise<Object>}
   */
  async createRack(data) {
    if (!data.name) {
      throw new ValidationError('Campo requerido: name');
    }

    const rackType = data.type || 'fisicos';

    const rack = await rackRepository.create({
      name: data.name,
      rawName: data.raw_name || data.name,
      type: rackType,
    });

    Logger.success(`Rack creado: ${data.name} tipo=${rackType} (ID: ${rack.id})`);

    return {
      id: rack.id,
      name: rack.name,
      type: rackType,
      message: 'Rack creado exitosamente',
    };
  }

  /**
   * Actualiza un rack existente
   * @param {number|string} id
   * @param {{ name?: string, raw_name?: string }} data
   * @returns {Promise<Object>}
   */
  async updateRack(id, data) {
    if (!data.name && !data.raw_name) {
      throw new ValidationError('Debe proporcionar al menos un campo para actualizar');
    }

    const updateData = {};
    if (data.name) updateData.name = data.name;
    if (data.raw_name) updateData.rawName = data.raw_name;

    const rack = await rackRepository.update(id, updateData);
    Logger.success(`Rack actualizado: ${rack.name} (ID: ${id})`);

    return { message: 'Rack actualizado exitosamente' };
  }

  /**
   * Elimina un rack (verifica si tiene servidores)
   * @param {number|string} id
   * @param {boolean} force - Si true, elimina los servidores también
   * @returns {Promise<Object>}
   */
  async deleteRack(id, force = false) {
    const existing = await rackRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Rack', id);
    }

    const serverCount = await rackRepository.countServers(id);

    if (serverCount > 0 && !force) {
      throw new ValidationError(
        `El rack contiene ${serverCount} servidor(es). Use force=true para eliminar de todas formas.`
      );
    }

    if (force && serverCount > 0) {
      await rackRepository.deleteServersByRackId(id);
      Logger.info(`${serverCount} servidores eliminados del rack`);
    }

    await rackRepository.delete(id);
    Logger.success(`Rack eliminado: ${existing.name} (ID: ${id})`);

    return { message: 'Rack eliminado exitosamente' };
  }

  /**
   * Elimina un rack por nombre
   * @param {string} name
   * @param {boolean} force
   * @returns {Promise<Object>}
   */
  async deleteRackByName(name, force = false) {
    const rack = await rackRepository.findByName(decodeURIComponent(name));
    if (!rack) {
      throw new NotFoundError('Rack');
    }

    return this.deleteRack(rack.id, force);
  }

  /**
   * Obtiene detalles de un rack con sus servidores
   * @param {number|string} id
   * @returns {Promise<Object>}
   */
  async getRackDetails(id) {
    const rack = await rackRepository.findByIdWithServers(id);
    if (!rack) {
      throw new NotFoundError('Rack', id);
    }

    return {
      rack,
      servers: rack.servers,
      serverCount: rack.servers.length,
    };
  }
}

export default new RackService();

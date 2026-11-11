/**
 * Server Service
 * Lógica de negocio pura para servidores.
 * NO conoce Express (req/res). Solo recibe datos y devuelve resultados.
 */

import serverRepository from '../repositories/serverRepository.js';
import rackRepository from '../repositories/rackRepository.js';
import { toFrontendFormat, normalizeInputToPrisma, extractUpdatableFields, validateCreateServer } from '../dtos/serverDto.js';
import { NotFoundError, ValidationError, ConflictError } from '../middleware/errorHandler.js';
import Logger from '../utils/logger.js';

class ServerService {
  /**
   * Obtiene todos los datos (racks + servidores) agrupados por rack
   * @param {'fisicos'|'virtuales'} type
   * @returns {Promise<Object>} { racks, servers, meta }
   */
  async getDataGroupedByRack(type) {
    const typeEnum = type === 'virtuales' ? 'virtuales' : 'fisicos';

    // Obtener racks y servidores en paralelo
    const [allRacks, servers] = await Promise.all([
      rackRepository.findAllByType(typeEnum),
      serverRepository.findAllByType(typeEnum),
    ]);

    Logger.info(`[ServerService] Racks tipo=${typeEnum}: ${allRacks.length}`);

    // Mapear servidores al formato frontend
    const serversMapped = servers.map(toFrontendFormat);

    // Agrupar servidores por rackId
    const rackServerMap = new Map();
    for (const s of serversMapped) {
      const rackId = s.rackId;
      if (rackId != null) {
        if (!rackServerMap.has(rackId)) {
          rackServerMap.set(rackId, []);
        }
        rackServerMap.get(rackId).push(s);
      }
    }

    // Construir respuesta de racks con servidores
    const rackGroups = allRacks.map(rack => ({
      id: rack.id,
      name: rack.name,
      type: rack.type,
      servers: rackServerMap.get(String(rack.id)) || [],
    })).sort((a, b) => a.name.localeCompare(b.name));

    return {
      racks: rackGroups,
      servers: serversMapped,
      meta: {
        type,
        source: 'prisma',
        updatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Obtiene racks con conteo de servidores
   * @param {'fisicos'|'virtuales'} type
   * @returns {Promise<Array>}
   */
  async getRacksWithCounts(type) {
    const typeEnum = type === 'virtuales' ? 'virtuales' : 'fisicos';

    const [allRacks, counts] = await Promise.all([
      rackRepository.findAllByType(typeEnum),
      rackRepository.serverCountsByType(typeEnum),
    ]);

    const countMap = new Map(counts.map(c => [String(c.rackId), c._count.id]));

    return allRacks.map(r => ({
      id: r.id,
      name: r.name,
      servers: [],
      serverCount: countMap.get(String(r.id)) || 0,
    }));
  }

  /**
   * Obtiene solo los servidores de un tipo
   * @param {'fisicos'|'virtuales'} type
   * @returns {Promise<Array>}
   */
  async getServersByType(type) {
    const typeEnum = type === 'virtuales' ? 'virtuales' : 'fisicos';
    const servers = await serverRepository.findAllByType(typeEnum);
    return servers.map(toFrontendFormat);
  }

  /**
   * Crea un nuevo servidor
   * @param {Object} body - Datos del request (snake_case)
   * @returns {Promise<Object>} { id, server, message }
   */
  async createServer(body) {
    const validation = validateCreateServer(body);
    if (!validation.valid) {
      throw new ValidationError(validation.error);
    }

    const normalized = normalizeInputToPrisma(body);

    // Buscar o crear rack
    const rack = await rackRepository.findOrCreate(
      normalized.rackNorm || body.rack_norm,
      normalized.rackRaw || body.rack_raw || body.rack_norm,
      body.type
    );

    // Generar identity_key
    const identity = (body.ip || body.hostname || body.nombre || '').toString().trim().toLowerCase()
      || `server_${Date.now()}`;

    // Construir datos para Prisma
    const serverData = {
      type: body.type,
      identityKey: identity,
      rackId: BigInt(rack.id),
      rackNorm: normalized.rackNorm || body.rack_norm,
      rackRaw: normalized.rackRaw || body.rack_raw,
      serverLabel: normalized.serverLabel || body.server_label,
      nombre: body.nombre,
      ip: body.ip,
      hostname: body.hostname,
      usuario: body.usuario,
      marca: body.marca,
      modelo: body.modelo,
      tipo: body.tipo,
      hardware: body.hardware,
      serie: body.serie,
      socket: body.socket,
      noPorSocket: body.no_por_socket,
      procesadoresLogicos: body.procesadores_logicos,
      ramGb: body.ram_gb,
      discos: body.discos,
      datastore: body.datastore,
      conexion: body.conexion,
      software: body.software,
      so: body.so,
      fechaInstalacion: body.fecha_instalacion,
      fechaMantenimiento: body.fecha_mantenimiento,
      estado: body.estado,
      backup: body.backup,
      fechaBackup: body.fecha_backup,
      activo: body.activo || 'SI',
      rackUnits: body.rack_units ? parseInt(body.rack_units) : 2,
      rackPosition: body.rack_position ? parseInt(body.rack_position) : null,
    };

    const server = await serverRepository.create(serverData);
    Logger.success(`Servidor creado: ${body.nombre} (ID: ${server.id})`);

    return {
      id: server.id,
      server,
      message: 'Servidor creado exitosamente',
    };
  }

  /**
   * Actualiza un servidor existente
   * @param {number|string} id
   * @param {Object} body - Datos del request
   * @returns {Promise<Object>}
   */
  async updateServer(id, body) {
    // Verificar que existe
    const existing = await serverRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Servidor', id);
    }

    const normalized = normalizeInputToPrisma(body);
    const updateData = extractUpdatableFields(normalized);

    // Si cambió el rack, resolver rackId
    const rackNorm = normalized.rackNorm || body.rack_norm;
    if (rackNorm) {
      const rack = await rackRepository.findOrCreate(
        rackNorm,
        normalized.rackRaw || body.rack_raw || rackNorm,
        existing.type
      );
      updateData.rackId = BigInt(rack.id);
      updateData.rackNorm = rackNorm;
    }

    if (Object.keys(updateData).length === 0) {
      throw new ValidationError('No hay campos para actualizar');
    }

    // Convertir tipos numéricos
    if (updateData.rackUnits != null) updateData.rackUnits = parseInt(updateData.rackUnits);
    if (updateData.rackPosition != null) updateData.rackPosition = parseInt(updateData.rackPosition);

    const updated = await serverRepository.update(id, updateData);
    Logger.success(`Servidor actualizado: ID ${id}`);

    return {
      server: updated,
      message: 'Servidor actualizado exitosamente',
    };
  }

  /**
   * Elimina un servidor
   * @param {number|string} id
   * @returns {Promise<Object>}
   */
  async deleteServer(id) {
    const existing = await serverRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Servidor', id);
    }

    await serverRepository.delete(id);
    Logger.success(`Servidor eliminado: ${existing.nombre} (ID: ${id})`);

    return {
      deleted: existing,
      message: 'Servidor eliminado exitosamente',
    };
  }

  /**
   * Mueve un servidor a otro rack
   * @param {number|string} id
   * @param {Object} body - { rack_norm, rack_raw }
   * @returns {Promise<Object>}
   */
  async moveServer(id, body) {
    const rackNorm = body.rack_norm;
    if (!rackNorm) {
      throw new ValidationError('Campo requerido: rack_norm');
    }

    const existing = await serverRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Servidor', id);
    }

    // Buscar o crear rack destino
    const rack = await rackRepository.findOrCreate(rackNorm, body.rack_raw || rackNorm, existing.type);

    await serverRepository.updatePosition(id, {
      rackId: BigInt(rack.id),
      rackNorm,
      rackRaw: body.rack_raw || rackNorm,
    });

    Logger.success(`Servidor ${existing.nombre} movido a rack ${rackNorm}`);
    return { message: `Servidor movido a ${rackNorm} exitosamente` };
  }

  /**
   * Reposiciona un servidor en una posición específica del rack
   * @param {number|string} id
   * @param {Object} body - { rack_norm, rack_raw, rack_position }
   * @returns {Promise<Object>}
   */
  async repositionServer(id, body) {
    const rackNorm = body.rack_norm;
    const rackPosition = body.rack_position;

    if (!rackNorm || rackPosition === undefined) {
      throw new ValidationError('Campos requeridos: rack_norm, rack_position');
    }

    const existing = await serverRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Servidor', id);
    }

    const serverUnits = existing.rackUnits || 2;
    const minPosition = rackPosition - serverUnits + 1;
    const maxPosition = rackPosition;

    // Verificar conflictos de posición
    const conflicts = await serverRepository.findPositionConflicts(rackNorm, minPosition, maxPosition, id);
    if (conflicts.length > 0) {
      throw new ConflictError(
        `La posición ${rackPosition} ya está ocupada por ${conflicts[0].nombre}`
      );
    }

    const rack = await rackRepository.findOrCreate(rackNorm, body.rack_raw || rackNorm, existing.type);

    await serverRepository.updatePosition(id, {
      rackId: BigInt(rack.id),
      rackNorm,
      rackRaw: body.rack_raw || rackNorm,
      rackPosition: parseInt(rackPosition),
    });

    Logger.success(`Servidor ${existing.nombre} reposicionado a posición ${rackPosition}`);
    return { message: `Servidor reposicionado a posición ${rackPosition} exitosamente` };
  }

  /**
   * Intercambia posiciones de dos servidores
   * @param {number|string} server1Id
   * @param {number|string} server2Id
   * @returns {Promise<Object>}
   */
  async swapServers(server1Id, server2Id) {
    if (!server1Id || !server2Id) {
      throw new ValidationError('Se requieren server1_id y server2_id');
    }

    const [s1, s2] = await Promise.all([
      serverRepository.findById(server1Id),
      serverRepository.findById(server2Id),
    ]);

    if (!s1 || !s2) {
      throw new NotFoundError('Uno o ambos servidores');
    }

    // Intercambiar posiciones usando transacciones de Prisma
    const { default: prisma } = await import('../config/prisma.js');

    await prisma.$transaction([
      prisma.server.update({
        where: { id: BigInt(server1Id) },
        data: {
          rackId: s2.rackId,
          rackNorm: s2.rackNorm,
          rackRaw: s2.rackRaw,
          rackPosition: s2.rackPosition,
        },
      }),
      prisma.server.update({
        where: { id: BigInt(server2Id) },
        data: {
          rackId: s1.rackId,
          rackNorm: s1.rackNorm,
          rackRaw: s1.rackRaw,
          rackPosition: s1.rackPosition,
        },
      }),
    ]);

    Logger.success(`Intercambiadas posiciones: ${s1.nombre} <-> ${s2.nombre}`);

    return {
      message: 'Servidores intercambiados exitosamente',
      swap: { server1: s1.nombre, server2: s2.nombre },
    };
  }
}

export default new ServerService();

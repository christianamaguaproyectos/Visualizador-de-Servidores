/**
 * monitoringSyncService.js - Sincronización automática entre inventario y monitoreo
 * Cuando se crea/actualiza/elimina un servidor, se sincroniza con el sistema de monitoreo
 */
import { withClient as dbWithClient } from '../config/db.js';
import Logger from '../utils/logger.js';

// Importación dinámica del scheduler para evitar dependencia circular
let schedulerInstance = null;
async function getScheduler() {
  if (!schedulerInstance) {
    const { default: scheduler } = await import('../monitoring/scheduler/scheduler.js');
    schedulerInstance = scheduler;
  }
  return schedulerInstance;
}

class MonitoringSyncService {
  constructor() {
    this.postgresUrl = process.env.POSTGRES_URL;
  }

  // Helper que usa el pool de conexiones
  async withClient(fn) {
    return dbWithClient(fn);
  }

  /**
   * Obtiene una conexión directa al pool
   */
  async getClient() {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: this.postgresUrl });
    return pool.connect().then(client => {
      // Wrap end to release to pool
      client.end = async () => {
        try { client.release(); } catch (e) { }
        try { await pool.end(); } catch (e) { }
      };
      return client;
    });
  }

  /**
   * Mapea el tipo de servidor del inventario al enum de monitoreo
   */
  mapServerType(inventoryType) {
    const typeMap = {
      'FISICO': 'fisico',
      'FISICOS': 'fisico',
      'fisico': 'fisico',
      'fisicos': 'fisico',
      'VIRTUAL': 'virtual',
      'VIRTUALES': 'virtual',
      'virtual': 'virtual',
      'virtuales': 'virtual',
      'VM': 'virtual'
    };
    return typeMap[inventoryType] || 'virtual';
  }

  /**
   * Valida si una IP es válida
   */
  isValidIP(ip) {
    if (!ip || ip === 'N/A' || ip.trim() === '') return false;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const cleanIP = ip.split(/[\n\s,;]/)[0].trim();
    return ipRegex.test(cleanIP);
  }

  /**
   * Limpia y obtiene la primera IP válida
   */
  cleanIP(ip) {
    if (!ip) return null;
    const cleanIP = ip.split(/[\n\s,;]/)[0].trim();
    return this.isValidIP(cleanIP) ? cleanIP : null;
  }

  /**
   * Sincroniza un servidor del inventario al monitoreo
   * Se llama cuando se crea o actualiza un servidor
   */
  async syncServerToMonitoring(serverData) {
    const { id, nombre, ip, type, rack_norm, estado } = serverData;

    const cleanedIP = this.cleanIP(ip);
    // Si no hay IP válida, usar placeholder para que aparezca en monitoreo
    const finalIP = cleanedIP || '0.0.0.0';
    const hasValidIP = !!cleanedIP;

    let client;
    try {
      client = await this.getClient();

      // Primero buscar por NOMBRE (más confiable para actualizaciones de IP)
      // luego buscar por IP como fallback
      let existing = await client.query(
        'SELECT id FROM monitoring.hosts WHERE name = $1',
        [nombre]
      );

      // Si no encontramos por nombre y tenemos IP válida, buscar por IP
      if (existing.rows.length === 0 && hasValidIP) {
        existing = await client.query(
          'SELECT id FROM monitoring.hosts WHERE host(ip)::text = $1',
          [finalIP]
        );
      }

      const hostType = this.mapServerType(type);
      const isActive = estado !== 'APAGADO' && estado !== 'BAJA';

      if (existing.rows.length > 0) {
        // Actualizar host existente
        await client.query(`
          UPDATE monitoring.hosts 
          SET name = $1, type = $2::monitoring.host_type_enum, rack = $3, enabled = $4, ip = $5::inet, updated_at = NOW()
          WHERE id = $6
        `, [nombre, hostType, rack_norm, isActive, finalIP, existing.rows[0].id]);

        // También actualizar la IP en los checks ICMP existentes
        if (hasValidIP) {
          await client.query(`
            UPDATE monitoring.checks 
            SET config = jsonb_set(jsonb_set(config::jsonb, '{ip}', $1::jsonb), '{host}', $1::jsonb)
            WHERE host_id = $2 AND kind = 'icmp'
          `, [JSON.stringify(finalIP), existing.rows[0].id]);
        }

        Logger.info(`📡 Sync: Host actualizado en monitoreo: ${nombre} (${finalIP})`);

        // Forzar recarga del scheduler para aplicar cambios inmediatamente
        getScheduler().then(s => s.forceReload()).catch(e => Logger.error('Error en forceReload:', e.message));

        return { synced: true, action: 'updated', hostId: existing.rows[0].id };
      } else {
        // Crear nuevo host
        const result = await client.query(`
          INSERT INTO monitoring.hosts (name, ip, type, rack, estado_actual, enabled, group_tags)
          VALUES ($1, $2::inet, $3::monitoring.host_type_enum, $4, 'UNKNOWN', $5, $6)
          RETURNING id
        `, [nombre, finalIP, hostType, rack_norm, isActive, JSON.stringify([])]);

        const hostId = result.rows[0].id;

        // Crear check de ping automáticamente solo si tiene IP válida
        if (hasValidIP) {
          await client.query(`
            INSERT INTO monitoring.checks (host_id, kind, config, frequency_sec, timeout_ms, enabled)
            VALUES ($1, 'icmp', $2, 300, 2000, $3)
            ON CONFLICT DO NOTHING
          `, [hostId, JSON.stringify({ ip: finalIP, host: finalIP }), isActive]);
        }

        Logger.success(`📡 Sync: Host creado en monitoreo: ${nombre} (${finalIP}) ${hasValidIP ? '+ check ICMP' : '(sin IP válida)'}`);

        // Forzar recarga del scheduler para incluir nuevo host
        getScheduler().then(s => s.forceReload()).catch(e => Logger.error('Error en forceReload:', e.message));

        return { synced: true, action: 'created', hostId };
      }
    } catch (err) {
      Logger.error(`Error sincronizando ${nombre} a monitoreo:`, err.message);
      return { synced: false, error: err.message };
    } finally {
      if (client) await client.end().catch(() => { });
    }
  }

  /**
   * Elimina un host del monitoreo cuando se elimina del inventario
   */
  async removeServerFromMonitoring(serverData) {
    const { nombre, ip } = serverData;
    const cleanedIP = this.cleanIP(ip);

    let client;
    try {
      client = await this.getClient();

      // Obtener host_id por IP o por nombre
      let hostResult;
      if (cleanedIP) {
        hostResult = await client.query(
          'SELECT id FROM monitoring.hosts WHERE host(ip)::text = $1',
          [cleanedIP]
        );
      } else {
        hostResult = await client.query(
          'SELECT id FROM monitoring.hosts WHERE name = $1',
          [nombre]
        );
      }

      if (hostResult.rows.length === 0) {
        return { removed: false, reason: 'Host no encontrado en monitoreo' };
      }

      const hostId = hostResult.rows[0].id;

      // Eliminar checks asociados
      await client.query('DELETE FROM monitoring.checks WHERE host_id = $1', [hostId]);

      // Cerrar incidentes abiertos
      await client.query(`
        UPDATE monitoring.incidents 
        SET state = 'closed', closed_at = NOW() 
        WHERE host_id = $1 AND state != 'closed'
      `, [hostId]);

      // Eliminar host completamente
      await client.query('DELETE FROM monitoring.hosts WHERE id = $1', [hostId]);

      Logger.warn(`📡 Sync: Host eliminado de monitoreo: ${nombre}`);
      return { removed: true, hostId };
    } catch (err) {
      Logger.error(`Error eliminando ${nombre} de monitoreo:`, err.message);
      return { removed: false, error: err.message };
    } finally {
      if (client) await client.end().catch(() => { });
    }
  }

  /**
   * Sincronización completa: compara inventario con monitoreo
   */
  async fullSync() {
    let client;
    try {
      client = await this.getClient();

      // Obtener todos los servidores del inventario
      const inventoryResult = await client.query(`
        SELECT id, nombre, ip, type, rack_norm, estado
        FROM inventory.servers
      `);

      const stats = { created: 0, updated: 0, skipped: 0, errors: 0 };

      for (const server of inventoryResult.rows) {
        const result = await this.syncServerToMonitoring(server);
        if (result.synced) {
          stats[result.action === 'created' ? 'created' : 'updated']++;
        } else {
          stats.errors++;
        }
      }

      Logger.success(`📡 Full Sync completado: ${stats.created} creados, ${stats.updated} actualizados, ${stats.errors} errores`);
      return stats;
    } catch (err) {
      Logger.error('Error en full sync:', err.message);
      throw err;
    } finally {
      if (client) await client.end().catch(() => { });
    }
  }
}

export default new MonitoringSyncService();

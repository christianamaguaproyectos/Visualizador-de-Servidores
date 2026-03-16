import { withClient } from '../config/db.js';
import sseService from '../services/sseService.js';
import monitoringSyncService from '../services/monitoringSyncService.js';
import { APP_CONFIG } from '../config/constants.js';
import Logger from '../utils/logger.js';

/**
 * Controlador para endpoints de datos de servidores
 * Maneja las solicitudes de datos (físicos y virtuales)
 */
class DataController {
  /**
   * Obtiene todos los datos (racks + servers) para un tipo
   * GET /api/data?type=fisicos|virtuales
   */
  getData(req, res) {
    const type = this._getTypeFromQuery(req.query.type);

    withClient(async (client) => {
      const typeEnum = type === 'virtuales' ? 'virtuales' : 'fisicos';

      // Obtener racks del tipo especificado (para mostrar incluso los vacíos)
      const { rows: allRacks } = await client.query(
        'SELECT id, name, type FROM inventory.racks WHERE type = $1 ORDER BY name ASC',
        [typeEnum]
      );
      Logger.info(`[DEBUG] Racks encontrados en BD para tipo=${typeEnum}: ${allRacks.length}`);

      // Obtener servidores del tipo especificado
      const { rows: servers } = await client.query(
        'SELECT s.*, r.name as rack_name FROM inventory.servers s LEFT JOIN inventory.racks r ON r.id = s.rack_id WHERE s.type = $1',
        [typeEnum]
      );

      const serversMapped = servers.map(s => ({
        id: s.id.toString(),
        rackId: s.rack_id,
        rack: s.rack_raw || s.rack_name,
        rackNorm: s.rack_norm || s.rack_name,
        rackUnits: s.rack_units || 2,
        rackPosition: s.rack_position,
        serverLabel: s.server_label,
        nombre: s.nombre,
        ip: s.ip,
        hostname: s.hostname,
        usuario: s.usuario,
        marca: s.marca,
        modelo: s.modelo,
        tipo: s.tipo,
        HARDWARE: s.hardware,
        TIPO: s.tipo,
        serie: s.serie,
        socket: s.socket,
        noPorSocket: s.no_por_socket,
        procesadoresLogicos: s.procesadores_logicos,
        ramGb: s.ram_gb,
        discos: s.discos,
        datastore: s.datastore,
        conexion: s.conexion,
        software: s.software,
        so: s.so,
        fechaInstalacion: s.fecha_instalacion,
        fechaMantenimiento: s.fecha_mantenimiento,
        estado: s.estado,
        backup: s.backup,
        fechaBackup: s.fecha_backup,
        activo: s.activo,
        // Campos físicos
        storage: s.storage,
        ocsInventario: s.ocs_inventario,
        datastoreVirtuales: s.datastore_virtuales,
        conexionStorage: s.conexion_storage,
        // Campos virtuales (seguridad)
        mtm: s.mtm,
        configBackup: s.config_backup,
        sophosEp: s.sophos_ep,
        vicarius: s.vicarius,
        acronis: s.acronis,
        veeam: s.veeam,
        manual: s.manual,
        zabbix: s.zabbix,
        wazuh: s.wazuh,
        bluelevel: s.bluelevel,
        pam: s.pam,
        usuarioPam: s.usuario_pam
      }));

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

      const rackGroups = allRacks.map(rack => ({
        id: rack.id,
        name: rack.name,
        type: rack.type,
        servers: rackServerMap.get(rack.id) || []
      })).sort((a, b) => a.name.localeCompare(b.name));

      const payload = { racks: rackGroups, servers: serversMapped, meta: { type, source: 'db', updatedAt: new Date().toISOString() } };
      Logger.debug(`API /api/data(DB) tipo=${type} -> racks=${rackGroups.length}, servers=${serversMapped.length}`);
      res.json(payload);
    }).catch(error => {
      Logger.error('Error en /api/data:', error);
      res.status(500).json({ racks: [], servers: [], meta: { error: 'Error interno del servidor' } });
    });
  }

  /**
   * Obtiene solo los racks para un tipo
   * GET /api/racks?type=fisicos|virtuales
   */
  getRacks(req, res) {
    const type = this._getTypeFromQuery(req.query.type);

    withClient(async (client) => {
      // Obtener conteo de servidores por rack del tipo especificado
      const serverCounts = await client.query(
        'SELECT rack_id, COUNT(*) as count FROM inventory.servers WHERE type=$1 GROUP BY rack_id',
        [type === 'virtuales' ? 'virtuales' : 'fisicos']
      );

      const serverCountMap = new Map(serverCounts.rows.map(r => [r.rack_id, parseInt(r.count)]));

      // Obtener racks del tipo especificado
      const typeEnum = type === 'virtuales' ? 'virtuales' : 'fisicos';
      const { rows: allRacks } = await client.query(
        'SELECT id, name, created_at FROM inventory.racks WHERE type = $1 ORDER BY name ASC',
        [typeEnum]
      );

      // Incluir todos los racks, con su conteo de servidores del tipo
      const racks = allRacks.map(r => ({
        id: r.id,
        name: r.name,
        servers: [],
        serverCount: serverCountMap.get(r.id) || 0
      }));

      res.json(racks);
    }).catch(() => res.json([]));
  }

  /**
   * Obtiene solo los servidores para un tipo
   * GET /api/servers?type=fisicos|virtuales
   */
  getServers(req, res) {
    const type = this._getTypeFromQuery(req.query.type);

    // Siempre usa PostgreSQL
    withClient(async (client) => {
      const { rows } = await client.query('SELECT * FROM inventory.servers WHERE type=$1', [type === 'virtuales' ? 'virtuales' : 'fisicos']);
      const mapped = rows.map(s => ({
        id: s.id.toString(),
        rack: s.rack_raw,
        rackNorm: s.rack_norm,
        serverLabel: s.server_label,
        nombre: s.nombre,
        ip: s.ip,
        hostname: s.hostname,
        usuario: s.usuario,
        marca: s.marca,
        modelo: s.modelo,
        tipo: s.tipo,
        HARDWARE: s.hardware,
        TIPO: s.tipo,
        serie: s.serie,
        socket: s.socket,
        noPorSocket: s.no_por_socket,
        procesadoresLogicos: s.procesadores_logicos,
        ramGb: s.ram_gb,
        discos: s.discos,
        datastore: s.datastore,
        conexion: s.conexion,
        software: s.software,
        so: s.so,
        fechaInstalacion: s.fecha_instalacion,
        fechaMantenimiento: s.fecha_mantenimiento,
        estado: s.estado,
        backup: s.backup,
        fechaBackup: s.fecha_backup,
        activo: s.activo,
        // Campos físicos
        storage: s.storage,
        ocsInventario: s.ocs_inventario,
        datastoreVirtuales: s.datastore_virtuales,
        conexionStorage: s.conexion_storage,
        // Campos virtuales (seguridad)
        mtm: s.mtm,
        configBackup: s.config_backup,
        sophosEp: s.sophos_ep,
        vicarius: s.vicarius,
        acronis: s.acronis,
        veeam: s.veeam,
        manual: s.manual,
        zabbix: s.zabbix,
        wazuh: s.wazuh,
        bluelevel: s.bluelevel,
        pam: s.pam,
        usuarioPam: s.usuario_pam
      }));
      res.json(mapped);
    }).catch(() => res.json([]));
  }

  /**
   * Normaliza el tipo desde query params
   * @param {string} typeQuery - Valor del parámetro type
   * @returns {string} Tipo normalizado
   */
  _getTypeFromQuery(typeQuery) {
    return typeQuery === APP_CONFIG.SERVER_TYPES.VIRTUALES
      ? APP_CONFIG.SERVER_TYPES.VIRTUALES
      : APP_CONFIG.SERVER_TYPES.FISICOS;
  }

  /**
   * Crea un nuevo servidor
   * POST /api/servers
   */
  async createServer(req, res) {
    try {
      const data = req.body;

      if (!data.type || !data.nombre || !data.rack_norm) {
        return res.status(400).json({ error: 'Campos requeridos: type, nombre, rack_norm' });
      }

      await withClient(async (client) => {
        // Buscar o crear rack (del mismo tipo que el servidor)
        let rackId;
        const rackResult = await client.query(
          'SELECT id FROM inventory.racks WHERE name = $1 AND type = $2',
          [data.rack_norm, data.type]
        );

        if (rackResult.rows.length > 0) {
          rackId = rackResult.rows[0].id;
        } else {
          const newRack = await client.query(
            'INSERT INTO inventory.racks(name, raw_name, type) VALUES($1, $2, $3) RETURNING id',
            [data.rack_norm, data.rack_raw || data.rack_norm, data.type]
          );
          rackId = newRack.rows[0].id;
        }

        // Crear identity_key
        const identity = (data.ip || data.hostname || data.nombre || '').toString().trim().toLowerCase() || `server_${Date.now()}`;

        // Insertar servidor
        const result = await client.query(
          `INSERT INTO inventory.servers(
            type, identity_key, rack_id, rack_norm, rack_raw, server_label, nombre, ip, hostname, 
            usuario, marca, modelo, tipo, hardware, serie, socket, no_por_socket, procesadores_logicos, 
            ram_gb, discos, datastore, conexion, software, so, fecha_instalacion, fecha_mantenimiento, 
            estado, backup, fecha_backup, activo, rack_units, rack_position
          ) VALUES(
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 
            $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
          ) RETURNING id`,
          [
            data.type, identity, rackId, data.rack_norm, data.rack_raw, data.server_label, data.nombre,
            data.ip, data.hostname, data.usuario, data.marca, data.modelo, data.tipo, data.hardware,
            data.serie, data.socket, data.no_por_socket, data.procesadores_logicos, data.ram_gb,
            data.discos, data.datastore, data.conexion, data.software, data.so, data.fecha_instalacion,
            data.fecha_mantenimiento, data.estado, data.backup, data.fecha_backup, data.activo || 'SI',
            data.rack_units || 2, data.rack_position
          ]
        );

        Logger.success(`Servidor creado: ${data.nombre} (ID: ${result.rows[0].id})`);

        // Notificar cambios
        sseService.notifyDataUpdate();

        // Sincronizar con monitoreo automáticamente
        const syncResult = await monitoringSyncService.syncServerToMonitoring({
          id: result.rows[0].id,
          nombre: data.nombre,
          ip: data.ip,
          type: data.type,
          rack_norm: data.rack_norm,
          estado: data.estado
        });

        res.status(201).json({
          ok: true,
          id: result.rows[0].id,
          message: 'Servidor creado exitosamente',
          monitoring: syncResult
        });
      });
    } catch (error) {
      Logger.error('Error creando servidor:', error);
      res.status(500).json({ error: 'Error creando servidor', details: error.message });
    }
  }

  /**
   * Actualiza un servidor existente
   * PUT /api/servers/:id
   */
  async updateServer(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;

      await withClient(async (client) => {
        // Si cambió el rack, actualizar rack_id
        let rackId = null;
        if (data.rack_norm) {
          // Obtener el tipo del servidor para buscar/crear rack del mismo tipo
          const serverTypeResult = await client.query('SELECT type FROM inventory.servers WHERE id = $1', [id]);
          const serverType = serverTypeResult.rows[0]?.type || 'fisicos';

          const rackResult = await client.query(
            'SELECT id FROM inventory.racks WHERE name = $1 AND type = $2',
            [data.rack_norm, serverType]
          );
          if (rackResult.rows.length > 0) {
            rackId = rackResult.rows[0].id;
          } else {
            const newRack = await client.query(
              'INSERT INTO inventory.racks(name, raw_name, type) VALUES($1, $2, $3) RETURNING id',
              [data.rack_norm, data.rack_raw || data.rack_norm, serverType]
            );
            rackId = newRack.rows[0].id;
          }
        }

        // Construir query de actualización dinámicamente
        const updates = [];
        const values = [];
        let paramCount = 1;

        const fields = [
          'server_label', 'nombre', 'ip', 'hostname', 'usuario', 'marca', 'modelo', 'tipo',
          'hardware', 'serie', 'socket', 'no_por_socket', 'procesadores_logicos', 'ram_gb',
          'discos', 'datastore', 'conexion', 'software', 'so', 'fecha_instalacion',
          'fecha_mantenimiento', 'estado', 'backup', 'fecha_backup', 'activo', 'rack_raw',
          'rack_units', 'rack_position',
          // Campos físicos
          'storage', 'ocs_inventario', 'datastore_virtuales', 'conexion_storage',
          // Campos virtuales (seguridad)
          'mtm', 'config_backup', 'sophos_ep', 'vicarius', 'acronis', 'veeam',
          'manual', 'zabbix', 'wazuh', 'bluelevel', 'pam', 'usuario_pam'
        ];

        for (const field of fields) {
          if (data[field] !== undefined) {
            updates.push(`${field} = $${paramCount}`);
            values.push(data[field]);
            paramCount++;
          }
        }

        if (rackId) {
          updates.push(`rack_id = $${paramCount}`);
          values.push(rackId);
          paramCount++;

          if (data.rack_norm) {
            updates.push(`rack_norm = $${paramCount}`);
            values.push(data.rack_norm);
            paramCount++;
          }
        }

        if (updates.length === 0) {
          return res.status(400).json({ error: 'No hay campos para actualizar' });
        }

        updates.push('updated_at = NOW()');
        values.push(id);

        const result = await client.query(
          `UPDATE inventory.servers SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id`,
          values
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        Logger.success(`Servidor actualizado: ID ${id}`);

        // Notificar cambios
        sseService.notifyDataUpdate();

        // Sincronizar con monitoreo automáticamente
        // Obtener datos completos del servidor actualizado
        const serverResult = await client.query(
          'SELECT id, nombre, ip, type, rack_norm, estado FROM inventory.servers WHERE id = $1',
          [id]
        );

        if (serverResult.rows.length > 0) {
          const syncResult = await monitoringSyncService.syncServerToMonitoring(serverResult.rows[0]);
          return res.json({ ok: true, message: 'Servidor actualizado exitosamente', monitoring: syncResult });
        }

        res.json({ ok: true, message: 'Servidor actualizado exitosamente' });
      });
    } catch (error) {
      Logger.error('Error actualizando servidor:', error);
      res.status(500).json({ error: 'Error actualizando servidor', details: error.message });
    }
  }

  /**
   * Elimina un servidor
   * DELETE /api/servers/:id
   */
  async deleteServer(req, res) {
    try {
      const { id } = req.params;

      await withClient(async (client) => {
        // Obtener datos del servidor antes de eliminarlo (para sync)
        const serverData = await client.query(
          'SELECT nombre, ip FROM inventory.servers WHERE id = $1',
          [id]
        );

        const result = await client.query('DELETE FROM inventory.servers WHERE id = $1 RETURNING nombre', [id]);

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        Logger.success(`Servidor eliminado: ${result.rows[0].nombre} (ID: ${id})`);

        // Notificar cambios
        sseService.notifyDataUpdate();

        // Deshabilitar en monitoreo
        let syncResult = null;
        if (serverData.rows.length > 0) {
          syncResult = await monitoringSyncService.removeServerFromMonitoring(serverData.rows[0]);
        }

        res.json({ ok: true, message: 'Servidor eliminado exitosamente', monitoring: syncResult });
      });
    } catch (error) {
      Logger.error('Error eliminando servidor:', error);
      res.status(500).json({ error: 'Error eliminando servidor', details: error.message });
    }
  }

  /**
   * Mueve un servidor a otro rack
   * PUT /api/servers/:id/move
   */
  async moveServer(req, res) {
    try {
      const { id } = req.params;
      const { rack_norm, rack_raw } = req.body;

      if (!rack_norm) {
        return res.status(400).json({ error: 'Campo requerido: rack_norm' });
      }

      await withClient(async (client) => {
        // Buscar o crear rack destino
        let rackId;
        const rackResult = await client.query('SELECT id FROM inventory.racks WHERE name = $1', [rack_norm]);

        if (rackResult.rows.length > 0) {
          rackId = rackResult.rows[0].id;
        } else {
          const newRack = await client.query(
            'INSERT INTO inventory.racks(name, raw_name) VALUES($1, $2) RETURNING id',
            [rack_norm, rack_raw || rack_norm]
          );
          rackId = newRack.rows[0].id;
        }

        // Mover servidor
        const result = await client.query(
          'UPDATE inventory.servers SET rack_id = $1, rack_norm = $2, rack_raw = $3, updated_at = NOW() WHERE id = $4 RETURNING nombre',
          [rackId, rack_norm, rack_raw || rack_norm, id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        Logger.success(`Servidor ${result.rows[0].nombre} movido a rack ${rack_norm}`);

        // Notificar cambios
        sseService.notifyDataUpdate();

        res.json({ ok: true, message: `Servidor movido a ${rack_norm} exitosamente` });
      });
    } catch (error) {
      Logger.error('Error moviendo servidor:', error);
      res.status(500).json({ error: 'Error moviendo servidor', details: error.message });
    }
  }

  /**
   * Reposiciona un servidor a una posición específica en un rack
   * PUT /api/servers/:id/reposition
   */
  async repositionServer(req, res) {
    try {
      const { id } = req.params;
      const { rack_norm, rack_raw, rack_position } = req.body;

      if (!rack_norm || rack_position === undefined) {
        return res.status(400).json({ error: 'Campos requeridos: rack_norm, rack_position' });
      }

      await withClient(async (client) => {
        // Obtener info del servidor a mover
        const serverInfo = await client.query(
          'SELECT nombre, rack_units FROM inventory.servers WHERE id = $1',
          [id]
        );

        if (serverInfo.rows.length === 0) {
          return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const serverName = serverInfo.rows[0].nombre;
        const serverUnits = serverInfo.rows[0].rack_units || 2;

        // Verificar si hay conflicto de posición en el rack destino
        // Un servidor de 2U en posición 42 ocupa las unidades 42 y 41
        const minPosition = rack_position - serverUnits + 1;
        const maxPosition = rack_position;

        const conflictCheck = await client.query(
          `SELECT nombre, rack_position, rack_units 
           FROM inventory.servers 
           WHERE rack_norm = $1 
           AND id != $2 
           AND rack_position IS NOT NULL
           AND (
             (rack_position BETWEEN $3 AND $4)
             OR (rack_position - rack_units + 1 BETWEEN $3 AND $4)
             OR ($3 BETWEEN rack_position - rack_units + 1 AND rack_position)
           )`,
          [rack_norm, id, minPosition, maxPosition]
        );

        if (conflictCheck.rows.length > 0) {
          const conflictingServer = conflictCheck.rows[0];
          Logger.warn(`Conflicto de posición: ${conflictingServer.nombre} ya ocupa esa posición`);
          return res.status(409).json({
            error: `La posición ${rack_position} ya está ocupada por ${conflictingServer.nombre}`,
            conflict: true,
            occupiedBy: conflictingServer.nombre
          });
        }

        // Buscar o crear rack destino
        let rackId;
        const rackResult = await client.query('SELECT id FROM inventory.racks WHERE name = $1', [rack_norm]);

        if (rackResult.rows.length > 0) {
          rackId = rackResult.rows[0].id;
        } else {
          const newRack = await client.query(
            'INSERT INTO inventory.racks(name, raw_name) VALUES($1, $2) RETURNING id',
            [rack_norm, rack_raw || rack_norm]
          );
          rackId = newRack.rows[0].id;
        }

        // Reposicionar servidor
        const result = await client.query(
          'UPDATE inventory.servers SET rack_id = $1, rack_norm = $2, rack_raw = $3, rack_position = $4, updated_at = NOW() WHERE id = $5 RETURNING nombre',
          [rackId, rack_norm, rack_raw || rack_norm, rack_position, id]
        );

        Logger.success(`Servidor ${serverName} reposicionado a posición ${rack_position} en rack ${rack_norm}`);

        // Notificar cambios
        sseService.notifyDataUpdate();

        res.json({ ok: true, message: `Servidor reposicionado a posición ${rack_position} exitosamente` });
      });
    } catch (error) {
      Logger.error('Error reposicionando servidor:', error);
      res.status(500).json({ error: 'Error reposicionando servidor', details: error.message });
    }
  }
  /**
   * Intercambia las posiciones de dos servidores
   * POST /api/servers/swap
   */
  async swapServers(req, res) {
    try {
      const { server1_id, server2_id } = req.body;

      if (!server1_id || !server2_id) {
        return res.status(400).json({ error: 'Se requieren server1_id y server2_id' });
      }

      await withClient(async (client) => {
        // Iniciar transacción
        await client.query('BEGIN');

        try {
          // Obtener datos actuales de ambos servidores
          const server1Result = await client.query(
            'SELECT rack_id, rack_norm, rack_raw, rack_position, nombre FROM inventory.servers WHERE id = $1',
            [server1_id]
          );
          const server2Result = await client.query(
            'SELECT rack_id, rack_norm, rack_raw, rack_position, nombre FROM inventory.servers WHERE id = $1',
            [server2_id]
          );

          if (server1Result.rows.length === 0 || server2Result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Uno o ambos servidores no encontrados' });
          }

          const server1 = server1Result.rows[0];
          const server2 = server2Result.rows[0];

          // Intercambiar posiciones
          await client.query(
            'UPDATE inventory.servers SET rack_id = $1, rack_norm = $2, rack_raw = $3, rack_position = $4, updated_at = NOW() WHERE id = $5',
            [server2.rack_id, server2.rack_norm, server2.rack_raw, server2.rack_position, server1_id]
          );

          await client.query(
            'UPDATE inventory.servers SET rack_id = $1, rack_norm = $2, rack_raw = $3, rack_position = $4, updated_at = NOW() WHERE id = $5',
            [server1.rack_id, server1.rack_norm, server1.rack_raw, server1.rack_position, server2_id]
          );

          await client.query('COMMIT');

          Logger.success(`Intercambiadas posiciones: ${server1.nombre} <-> ${server2.nombre}`);

          // Notificar cambios
          sseService.notifyDataUpdate();

          res.json({
            ok: true,
            message: 'Servidores intercambiados exitosamente',
            swap: {
              server1: server1.nombre,
              server2: server2.nombre
            }
          });
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      });
    } catch (error) {
      Logger.error('Error intercambiando servidores:', error);
      res.status(500).json({ error: 'Error intercambiando servidores', details: error.message });
    }
  }
}

export default new DataController();
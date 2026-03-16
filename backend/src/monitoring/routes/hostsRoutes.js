/**
 * hostsRoutes.js - API para gestión de hosts en monitoreo
 */
import express from 'express';
import { withMonitoringClient } from '../config/monitoringDb.js';
import Logger from '../../utils/logger.js';
import scheduler from '../scheduler/scheduler.js';

const router = express.Router();

// Helper que usa el pool de conexiones con schema correcto
async function withClient(fn) {
  return withMonitoringClient(async (client) => {
    await client.query('SET search_path TO monitoring, public');
    return fn(client);
  });
}


/**
 * GET /api/monitoring/hosts
 * Lista todos los hosts con su estado actual
 */
router.get('/', async (req, res) => {
  try {
    const { estado, type, critical, search } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '100', 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10) || 0, 0);

    if (estado && !['UP', 'DOWN', 'DEGRADED', 'UNKNOWN', 'MAINTENANCE'].includes(String(estado).toUpperCase())) {
      return res.status(400).json({ error: 'estado invalido' });
    }

    const result = await withClient(async (client) => {
      let whereConditions = [];
      let params = [];
      let idx = 1;

      if (estado) {
        whereConditions.push(`estado_actual = $${idx++}`);
        params.push(estado.toUpperCase());
      }
      if (type) {
        whereConditions.push(`type = $${idx++}`);
        params.push(type);
      }
      if (critical === 'true') {
        whereConditions.push(`critical = true`);
      }
      if (search) {
        whereConditions.push(`(name ILIKE $${idx} OR ip::text ILIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      params.push(limit, offset);
      const { rows } = await client.query(`
        SELECT 
          h.*,
          (SELECT COUNT(*) FROM checks WHERE host_id = h.id AND enabled = true) AS active_checks,
          (SELECT COUNT(*) FROM incidents WHERE host_id = h.id AND state = 'open') AS open_incidents
        FROM hosts h
        ${whereClause}
        ORDER BY 
          CASE estado_actual 
            WHEN 'DOWN' THEN 1 
            WHEN 'DEGRADED' THEN 2 
            WHEN 'UNKNOWN' THEN 3
            WHEN 'MAINTENANCE' THEN 4
            ELSE 5 
          END,
          critical DESC,
          name ASC
        LIMIT $${idx++} OFFSET $${idx}
      `, params);

      // Contar total
      const { rows: countRows } = await client.query(`
        SELECT COUNT(*) FROM hosts ${whereClause}
      `, params.slice(0, -2));

      return {
        hosts: rows,
        total: parseInt(countRows[0].count),
        limit,
        offset
      };
    });

    res.json(result);
  } catch (err) {
    Logger.error('Error listando hosts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/monitoring/hosts/summary
 * Resumen de estados de hosts (para dashboard)
 */
router.get('/summary', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      const { rows } = await client.query(`
        SELECT 
          estado_actual,
          COUNT(*) AS count,
          COUNT(*) FILTER (WHERE critical = true) AS critical_count
        FROM hosts
        WHERE enabled = true
        GROUP BY estado_actual
      `);

      const summary = {
        UP: 0,
        DOWN: 0,
        DEGRADED: 0,
        UNKNOWN: 0,
        MAINTENANCE: 0,
        total: 0,
        critical_down: 0
      };

      rows.forEach(row => {
        summary[row.estado_actual] = parseInt(row.count);
        summary.total += parseInt(row.count);
        if (row.estado_actual === 'DOWN') {
          summary.critical_down = parseInt(row.critical_count);
        }
      });

      // Obtener incidentes abiertos
      const { rows: incRows } = await client.query(`
        SELECT COUNT(*) FROM incidents WHERE state IN ('open', 'ack')
      `);
      summary.open_incidents = parseInt(incRows[0].count);

      return summary;
    });

    res.json(result);
  } catch (err) {
    Logger.error('Error obteniendo summary:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/monitoring/hosts/:id/history
 * Historial de checks de un host
 */
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to, limit = 500 } = req.query;

    const result = await withClient(async (client) => {
      // Validar host
      const { rows: hostRows } = await client.query('SELECT id, name FROM hosts WHERE id = $1', [id]);
      if (hostRows.length === 0) {
        throw { status: 404, message: 'Host no encontrado' };
      }

      // Construir filtro de fechas
      let timeFilter = '';
      const params = [id];
      let pIdx = 2;

      if (from) {
        timeFilter += ` AND cr.time >= $${pIdx++}`;
        params.push(from);
      }
      if (to) {
        timeFilter += ` AND cr.time <= $${pIdx++}`;
        params.push(to);
      }

      params.push(Math.min(parseInt(limit), 2000)); // Max 2000 rows

      const { rows } = await client.query(`
        SELECT cr.time, cr.status, cr.latency_ms, cr.error, c.kind, c.config
        FROM check_runs cr
        LEFT JOIN checks c ON cr.check_id = c.id
        WHERE cr.host_id = $1 ${timeFilter}
        ORDER BY cr.time DESC
        LIMIT $${pIdx}
      `, params);

      return {
        host: hostRows[0],
        history: rows
      };
    });

    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error obteniendo historial:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/monitoring/hosts/:id
 * Detalle de un host con checks e historial
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await withClient(async (client) => {
      // Host
      const { rows: hostRows } = await client.query('SELECT * FROM hosts WHERE id = $1', [id]);
      if (hostRows.length === 0) {
        throw { status: 404, message: 'Host no encontrado' };
      }

      // Checks del host
      const { rows: checks } = await client.query(`
        SELECT * FROM checks WHERE host_id = $1 ORDER BY kind, id
      `, [id]);

      // Últimos 50 check_runs
      const { rows: runs } = await client.query(`
        SELECT cr.*, c.kind 
        FROM check_runs cr
        JOIN checks c ON cr.check_id = c.id
        WHERE cr.host_id = $1
        ORDER BY cr.time DESC
        LIMIT 50
      `, [id]);

      // Incidentes del host
      const { rows: incidents } = await client.query(`
        SELECT * FROM incidents WHERE host_id = $1 ORDER BY opened_at DESC LIMIT 10
      `, [id]);

      // Estadísticas últimas 24h
      const { rows: stats } = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'ok') AS ok_count,
          COUNT(*) FILTER (WHERE status != 'ok') AS fail_count,
          AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS avg_latency,
          MIN(latency_ms) AS min_latency,
          MAX(latency_ms) AS max_latency
        FROM check_runs
        WHERE host_id = $1 AND time > NOW() - INTERVAL '24 hours'
      `, [id]);

      return {
        host: hostRows[0],
        checks,
        recentRuns: runs,
        incidents,
        stats24h: stats[0]
      };
    });

    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error obteniendo host:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/hosts
 * Crea un nuevo host en monitoreo
 */
router.post('/', async (req, res) => {
  try {
    const { name, ip, type = 'fisico', rack, critical = false, group_tags = [], enabled = true } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name es requerido' });
    }
    if (!ip) {
      return res.status(400).json({ error: 'ip es requerida' });
    }

    const result = await withClient(async (client) => {
      // Verificar duplicado por IP
      const { rows: existingIP } = await client.query('SELECT id FROM hosts WHERE ip = $1', [ip]);
      if (existingIP.length > 0) {
        throw { status: 409, message: 'Ya existe un host con esa IP', existing_id: existingIP[0].id };
      }

      // Verificar duplicado por nombre
      const { rows: existingName } = await client.query('SELECT id, host(ip)::text as ip FROM hosts WHERE name = $1', [name]);
      if (existingName.length > 0) {
        throw { status: 409, message: `Ya existe un host con el nombre "${name}" (IP: ${existingName[0].ip}). Use el endpoint PUT para actualizar.`, existing_id: existingName[0].id };
      }

      const { rows } = await client.query(`
        INSERT INTO hosts (name, ip, type, rack, critical, group_tags, enabled, estado_actual)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'UNKNOWN')
        RETURNING *
      `, [name, ip, type, rack, critical, group_tags, enabled]);

      return rows[0];
    });

    Logger.success(`Host de monitoreo creado: ${name} (${ip})`);

    // Forzar recarga del scheduler para que tome el nuevo host
    scheduler.forceReload().catch(e => Logger.error('Error en forceReload:', e.message));

    res.status(201).json({ host: result });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message, existing_id: err.existing_id });
    }
    Logger.error('Error creando host:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/monitoring/hosts/:id
 * Actualiza un host
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, ip, type, rack, critical, group_tags, enabled } = req.body;

    const result = await withClient(async (client) => {
      const updates = [];
      const values = [];
      let idx = 1;

      if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
      if (ip !== undefined) { updates.push(`ip = $${idx++}`); values.push(ip); }
      if (type !== undefined) { updates.push(`type = $${idx++}`); values.push(type); }
      if (rack !== undefined) { updates.push(`rack = $${idx++}`); values.push(rack); }
      if (critical !== undefined) { updates.push(`critical = $${idx++}`); values.push(critical); }
      if (group_tags !== undefined) { updates.push(`group_tags = $${idx++}`); values.push(group_tags); }
      if (enabled !== undefined) { updates.push(`enabled = $${idx++}`); values.push(enabled); }

      if (updates.length === 0) {
        throw { status: 400, message: 'No hay campos para actualizar' };
      }

      values.push(id);
      const { rows, rowCount } = await client.query(`
        UPDATE hosts SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *
      `, values);

      if (rowCount === 0) {
        throw { status: 404, message: 'Host no encontrado' };
      }

      return rows[0];
    });

    Logger.info(`Host actualizado: ID=${id}`);

    // Forzar recarga del scheduler para aplicar cambios inmediatamente
    scheduler.forceReload().catch(e => Logger.error('Error en forceReload:', e.message));

    res.json({ host: result });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error actualizando host:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/monitoring/hosts/:id
 * Elimina un host y sus datos asociados
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await withClient(async (client) => {
      const { rowCount } = await client.query('DELETE FROM hosts WHERE id = $1', [id]);
      if (rowCount === 0) {
        throw { status: 404, message: 'Host no encontrado' };
      }
    });

    Logger.info(`Host eliminado: ID=${id}`);

    // Forzar recarga del scheduler para remover el host
    scheduler.forceReload().catch(e => Logger.error('Error en forceReload:', e.message));

    res.json({ success: true });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error eliminando host:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/hosts/:id/maintenance
 * Pone un host en mantenimiento
 */
router.post('/:id/maintenance', async (req, res) => {
  try {
    const { id } = req.params;
    const { duration_hours = 1, comment = '' } = req.body;

    const ends_at = await withClient(async (client) => {
      // Actualizar estado del host
      await client.query(`
        UPDATE hosts SET estado_actual = 'MAINTENANCE', estado_changed_at = NOW() WHERE id = $1
      `, [id]);

      // Crear ventana de mantenimiento
      const starts_at = new Date();
      const ends = new Date(starts_at.getTime() + duration_hours * 60 * 60 * 1000);

      await client.query(`
        INSERT INTO maintenance_windows (scope_type, target_ids, starts_at, ends_at, comment)
        VALUES ('host', $1, $2, $3, $4)
      `, [[id], starts_at, ends, comment]);

      return ends;
    });

    Logger.info(`Host ${id} puesto en mantenimiento por ${duration_hours}h`);
    res.json({ success: true, ends_at });
  } catch (err) {
    Logger.error('Error poniendo en mantenimiento:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/monitoring/hosts/:id/maintenance
 * Saca un host de mantenimiento
 */
router.delete('/:id/maintenance', async (req, res) => {
  try {
    const { id } = req.params;

    await withClient(async (client) => {
      // Cambiar estado a UNKNOWN para que se re-evalúe
      await client.query(`
        UPDATE hosts SET estado_actual = 'UNKNOWN', estado_changed_at = NOW() WHERE id = $1
      `, [id]);

      // Cerrar ventanas de mantenimiento activas
      await client.query(`
        UPDATE maintenance_windows 
        SET ends_at = NOW() 
        WHERE scope_type = 'host' AND $1 = ANY(target_ids) AND ends_at > NOW()
      `, [id]);
    });

    Logger.info(`Host ${id} sacado de mantenimiento`);
    res.json({ success: true });
  } catch (err) {
    Logger.error('Error sacando de mantenimiento:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/hosts/import
 * Importa hosts desde el inventario existente
 */
router.post('/import', async (req, res) => {
  try {
    const { type = 'fisicos' } = req.body;

    const result = await withClient(async (client) => {
      // Leer del esquema de inventario filtrado por tipo
      // El campo 'type' en inventory.servers contiene 'fisicos' o 'virtuales'
      const monitoringType = type === 'virtuales' ? 'virtual' : 'fisico';

      const { rows: servers } = await client.query(`
        SELECT 
          nombre AS name,
          ip,
          $1 AS type,
          rack_norm AS rack
        FROM inventory.servers
        WHERE LOWER(type::text) = LOWER($2)
      `, [monitoringType, type]);

      let imported = 0;
      let skipped = 0;

      for (const server of servers) {
        try {
          // Verificar si ya existe por IP (si tiene) o por Nombre
          let existing = [];

          if (server.ip) {
            const res = await client.query('SELECT id FROM hosts WHERE ip = $1', [server.ip]);
            existing = res.rows;
          } else {
            // Si no tiene IP, intentar buscar por nombre para evitar duplicados obvios
            // Solo si el nombre no es nulo
            if (server.name) {
              const res = await client.query('SELECT id FROM hosts WHERE name = $1', [server.name]);
              existing = res.rows;
            }
          }

          if (existing.length === 0) {
            // Usar IP o '0.0.0.0' si no existe
            await client.query(`
              INSERT INTO hosts (name, ip, type, rack, enabled, estado_actual)
              VALUES ($1, $2, $3, $4, true, 'UNKNOWN')
            `, [server.name || server.ip || 'Sin Nombre', server.ip || '0.0.0.0', server.type, server.rack]);
            imported++;
          } else {
            skipped++;
          }
        } catch (e) {
          skipped++;
        }
      }

      return { imported, skipped, total: servers.length };
    });

    Logger.success(`Importación completada: ${result.imported} hosts importados, ${result.skipped} omitidos`);
    res.json(result);
  } catch (err) {
    Logger.error('Error importando hosts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/hosts/cleanup-duplicates
 * Limpia hosts duplicados (mismo nombre), manteniendo el que tiene más checks o actividad más reciente
 */
router.post('/cleanup-duplicates', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      // Encontrar nombres duplicados
      const { rows: duplicates } = await client.query(`
        SELECT name, COUNT(*) as count, array_agg(id ORDER BY id) as ids
        FROM hosts
        GROUP BY name
        HAVING COUNT(*) > 1
      `);

      if (duplicates.length === 0) {
        return { cleaned: 0, message: 'No se encontraron duplicados' };
      }

      let cleaned = 0;
      const details = [];

      for (const dup of duplicates) {
        const hostIds = dup.ids;

        // Para cada grupo de duplicados, encontrar el mejor host para mantener
        // Criterios: más checks, más ejecuciones recientes, más checks OK
        const { rows: hostDetails } = await client.query(`
          SELECT h.id, h.name, host(h.ip)::text as ip, h.estado_actual, h.updated_at,
                 COUNT(c.id) as check_count,
                 (SELECT COUNT(*) FROM check_results cr WHERE cr.check_id IN (SELECT id FROM checks WHERE host_id = h.id)) as executions
          FROM hosts h
          LEFT JOIN checks c ON c.host_id = h.id
          WHERE h.id = ANY($1)
          GROUP BY h.id
          ORDER BY check_count DESC, executions DESC, h.updated_at DESC
        `, [hostIds]);

        if (hostDetails.length <= 1) continue;

        // El primero es el que mantenemos (más checks/actividad)
        const keepHost = hostDetails[0];
        const removeHosts = hostDetails.slice(1);

        for (const toRemove of removeHosts) {
          // Mover checks del host a eliminar al host a mantener (si no existen)
          await client.query(`
            UPDATE checks SET host_id = $1 WHERE host_id = $2
            AND NOT EXISTS (SELECT 1 FROM checks c2 WHERE c2.host_id = $1 AND c2.kind = checks.kind)
          `, [keepHost.id, toRemove.id]);

          // Cerrar incidentes abiertos del host a eliminar
          await client.query(`
            UPDATE incidents SET state = 'closed', closed_at = NOW() 
            WHERE host_id = $1 AND state != 'closed'
          `, [toRemove.id]);

          // Eliminar checks restantes del host a eliminar
          await client.query('DELETE FROM checks WHERE host_id = $1', [toRemove.id]);

          // Eliminar el host duplicado
          await client.query('DELETE FROM hosts WHERE id = $1', [toRemove.id]);

          cleaned++;
          details.push({
            removed: { id: toRemove.id, name: toRemove.name, ip: toRemove.ip },
            keptWith: { id: keepHost.id, name: keepHost.name, ip: keepHost.ip }
          });

          Logger.warn(`🧹 Host duplicado eliminado: ${toRemove.name} (${toRemove.ip}) - Mantenido: ${keepHost.name} (${keepHost.ip})`);
        }
      }

      return { cleaned, duplicateGroups: duplicates.length, details };
    });

    // Forzar recarga del scheduler
    scheduler.forceReload().catch(e => Logger.error('Error en forceReload:', e.message));

    res.json(result);
  } catch (err) {
    Logger.error('Error limpiando duplicados:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/monitoring/hosts/duplicates
 * Lista hosts duplicados (mismo nombre)
 */
router.get('/duplicates', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      const { rows } = await client.query(`
        SELECT h.name, COUNT(*) as count, 
               json_agg(json_build_object('id', h.id, 'ip', host(h.ip)::text, 'estado', h.estado_actual, 'updated_at', h.updated_at)) as hosts
        FROM hosts h
        GROUP BY h.name
        HAVING COUNT(*) > 1
        ORDER BY h.name
      `);
      return rows;
    });

    res.json({ duplicates: result, count: result.length });
  } catch (err) {
    Logger.error('Error listando duplicados:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

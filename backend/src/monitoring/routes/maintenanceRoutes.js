/**
 * maintenanceRoutes.js - API para mantenimiento y depuración del sistema
 * Incluye limpieza de logs antiguos de check_runs e incidents
 */
import express from 'express';
import { withMonitoringClient } from '../config/monitoringDb.js';
import Logger from '../../utils/logger.js';
import { createRateLimiter } from '../../middleware/rateLimitMiddleware.js';

const router = express.Router();
const mantenimientoRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  message: 'Demasiadas operaciones de mantenimiento. Espere un minuto antes de reintentar.'
});

// Helper que usa el pool de conexiones con schema correcto
async function withClient(fn) {
  return withMonitoringClient(async (client) => {
    await client.query('SET search_path TO monitoring, public');
    return fn(client);
  });
}


/**
 * GET /api/monitoring/maintenance/stats
 * Obtiene estadísticas de almacenamiento de logs
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      // Contar registros por tabla
      const { rows: checkRunsCount } = await client.query(`
        SELECT COUNT(*) as total FROM check_runs
      `);

      const { rows: incidentsCount } = await client.query(`
        SELECT COUNT(*) as total FROM incidents
      `);

      const { rows: incidentEventsCount } = await client.query(`
        SELECT COUNT(*) as total FROM incident_events
      `);

      // Registros por antigüedad (check_runs)
      const { rows: checkRunsAge } = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE time > NOW() - INTERVAL '24 hours') AS last_24h,
          COUNT(*) FILTER (WHERE time > NOW() - INTERVAL '7 days' AND time <= NOW() - INTERVAL '24 hours') AS last_7d,
          COUNT(*) FILTER (WHERE time > NOW() - INTERVAL '30 days' AND time <= NOW() - INTERVAL '7 days') AS last_30d,
          COUNT(*) FILTER (WHERE time <= NOW() - INTERVAL '30 days') AS older_30d
        FROM check_runs
      `);

      // Tamaño aproximado de las tablas
      const { rows: tableSizes } = await client.query(`
        SELECT 
          relname as table_name,
          pg_size_pretty(pg_total_relation_size(relid)) as total_size,
          pg_total_relation_size(relid) as size_bytes
        FROM pg_catalog.pg_statio_user_tables 
        WHERE schemaname = 'monitoring'
        ORDER BY pg_total_relation_size(relid) DESC
      `);

      // Rango de fechas de check_runs
      const { rows: dateRange } = await client.query(`
        SELECT 
          MIN(time) as oldest_record,
          MAX(time) as newest_record
        FROM check_runs
      `);

      return {
        check_runs: {
          total: parseInt(checkRunsCount[0].total),
          by_age: {
            last_24h: parseInt(checkRunsAge[0].last_24h),
            last_7d: parseInt(checkRunsAge[0].last_7d),
            last_30d: parseInt(checkRunsAge[0].last_30d),
            older_30d: parseInt(checkRunsAge[0].older_30d)
          },
          date_range: {
            oldest: dateRange[0].oldest_record,
            newest: dateRange[0].newest_record
          }
        },
        incidents: {
          total: parseInt(incidentsCount[0].total)
        },
        incident_events: {
          total: parseInt(incidentEventsCount[0].total)
        },
        table_sizes: tableSizes.map(t => ({
          table: t.table_name,
          size: t.total_size,
          size_bytes: parseInt(t.size_bytes)
        }))
      };
    });

    res.json(result);
  } catch (err) {
    Logger.error('Error obteniendo stats de mantenimiento:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/maintenance/purge-check-runs
 * Elimina check_runs antiguos
 * Body: { days: 30 } - elimina registros más antiguos que X días
 */
router.post('/purge-check-runs', mantenimientoRateLimiter, async (req, res) => {
  try {
    const { days = 30 } = req.body;

    if (days < 1) {
      return res.status(400).json({ error: 'days debe ser al menos 1' });
    }

    const result = await withClient(async (client) => {
      // Contar cuántos se van a eliminar
      const { rows: countBefore } = await client.query(`
        SELECT COUNT(*) as total
        FROM check_runs
        WHERE time < NOW() - ($1::int * INTERVAL '1 day')
      `, [days]);
      const toDelete = parseInt(countBefore[0].total);

      if (toDelete === 0) {
        return {
          deleted: 0,
          message: `No hay registros más antiguos de ${days} días`
        };
      }

      // Eliminar en lotes para evitar bloqueos largos
      let totalDeleted = 0;
      const batchSize = 10000;

      while (true) {
        const { rowCount } = await client.query(`
          DELETE FROM check_runs 
          WHERE ctid IN (
            SELECT ctid FROM check_runs 
            WHERE time < NOW() - ($1::int * INTERVAL '1 day')
            LIMIT ${batchSize}
          )
        `, [days]);

        totalDeleted += rowCount;

        if (rowCount < batchSize) break;

        // Pequeña pausa entre lotes
        await new Promise(r => setTimeout(r, 100));
      }

      return {
        deleted: totalDeleted,
        days_threshold: days,
        message: `Se eliminaron ${totalDeleted} registros de check_runs`
      };
    });

    Logger.success(`Depuración: ${result.deleted} check_runs eliminados (>${days} días)`);
    res.json(result);
  } catch (err) {
    Logger.error('Error purgando check_runs:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/maintenance/purge-incidents
 * Elimina incidentes cerrados antiguos
 * Body: { days: 90, states: ['closed'] }
 */
router.post('/purge-incidents', mantenimientoRateLimiter, async (req, res) => {
  try {
    const { days = 90, states = ['closed'] } = req.body;

    if (days < 1) {
      return res.status(400).json({ error: 'days debe ser al menos 1' });
    }

    const validStates = ['closed', 'resolved'];
    const filteredStates = states.filter(s => validStates.includes(s));

    if (filteredStates.length === 0) {
      return res.status(400).json({ error: 'states debe incluir al menos: closed o resolved' });
    }

    const result = await withClient(async (client) => {
      // Obtener IDs de incidentes a eliminar
      const { rows: incidentsToDelete } = await client.query(`
        SELECT id FROM incidents 
        WHERE state = ANY($1::text[])
        AND closed_at < NOW() - ($2::int * INTERVAL '1 day')
      `, [filteredStates, days]);

      if (incidentsToDelete.length === 0) {
        return {
          deleted_incidents: 0,
          deleted_events: 0,
          message: `No hay incidentes cerrados más antiguos de ${days} días`
        };
      }

      const incidentIds = incidentsToDelete.map(r => r.id);

      // Eliminar eventos asociados primero
      const { rowCount: eventsDeleted } = await client.query(`
        DELETE FROM incident_events WHERE incident_id = ANY($1)
      `, [incidentIds]);

      // Eliminar incidentes
      const { rowCount: incidentsDeleted } = await client.query(`
        DELETE FROM incidents WHERE id = ANY($1)
      `, [incidentIds]);

      return {
        deleted_incidents: incidentsDeleted,
        deleted_events: eventsDeleted,
        days_threshold: days,
        states: filteredStates
      };
    });

    Logger.success(`Depuración: ${result.deleted_incidents} incidentes y ${result.deleted_events} eventos eliminados`);
    res.json(result);
  } catch (err) {
    Logger.error('Error purgando incidents:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/maintenance/vacuum
 * Ejecuta VACUUM ANALYZE en las tablas de monitoreo
 * Libera espacio y actualiza estadísticas
 */
router.post('/vacuum', mantenimientoRateLimiter, async (req, res) => {
  try {
    await withClient(async (client) => {
      // VACUUM no puede ejecutarse dentro de una transacción
      // Necesitamos usar autocommit
      await client.query('VACUUM ANALYZE monitoring.check_runs');
      await client.query('VACUUM ANALYZE monitoring.incidents');
      await client.query('VACUUM ANALYZE monitoring.incident_events');
      await client.query('VACUUM ANALYZE monitoring.hosts');
      await client.query('VACUUM ANALYZE monitoring.checks');
    });

    Logger.success('VACUUM ANALYZE ejecutado en tablas de monitoreo');

    res.json({
      success: true,
      message: 'VACUUM ANALYZE completado en todas las tablas de monitoreo'
    });
  } catch (err) {
    Logger.error('Error ejecutando VACUUM:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/monitoring/maintenance/retention-policy
 * Obtiene la política de retención actual (configuración)
 */
router.get('/retention-policy', (req, res) => {
  res.json({
    check_runs: {
      recommended_days: 30,
      description: 'Logs de ejecución de checks (ping, tcp, http)'
    },
    incidents: {
      recommended_days: 90,
      states_to_purge: ['closed', 'resolved'],
      description: 'Incidentes cerrados y resueltos'
    },
    recommendations: [
      'Ejecutar purge-check-runs mensualmente con days=30',
      'Ejecutar purge-incidents trimestralmente con days=90',
      'Ejecutar vacuum después de cada purga grande'
    ]
  });
});

export default router;

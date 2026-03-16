/**
 * incidentsRoutes.js - API para gestión de incidentes
 */
import express from 'express';
import { withMonitoringClient } from '../config/monitoringDb.js';
import notificationService from '../services/notificationService.js';
import Logger from '../../utils/logger.js';
import { requireAdmin } from '../../middleware/authMiddleware.js';
import { createRateLimiter } from '../../middleware/rateLimitMiddleware.js';

const router = express.Router();
const incidentesAccionRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'Demasiadas acciones sobre incidentes. Espere un minuto e intente nuevamente.'
});

function parseIncidentId(rawId) {
  const id = parseInt(rawId, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function sanitizeTextInput(value, max = 1000) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

// Helper que usa el pool de conexiones con schema correcto
async function withClient(fn) {
  return withMonitoringClient(async (client) => {
    await client.query('SET search_path TO monitoring, public');
    return fn(client);
  });
}


/**
 * GET /api/monitoring/incidents
 * Lista incidentes con filtros
 */
router.get('/', async (req, res) => {
  try {
    const { state, severity } = req.query;
    const hostId = req.query.host_id ? parseInt(req.query.host_id, 10) : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10) || 0, 0);

    if (state && !['open', 'ack', 'resolved', 'closed'].includes(String(state))) {
      return res.status(400).json({ error: 'state invalido' });
    }
    if (severity && !['critical', 'warning', 'info'].includes(String(severity))) {
      return res.status(400).json({ error: 'severity invalida' });
    }
    if (req.query.host_id && (!Number.isInteger(hostId) || hostId <= 0)) {
      return res.status(400).json({ error: 'host_id invalido' });
    }

    const result = await withClient(async (client) => {
      let whereConditions = [];
      let params = [];
      let idx = 1;

      if (state) {
        whereConditions.push(`i.state = $${idx++}`);
        params.push(state);
      }
      if (severity) {
        whereConditions.push(`i.severity = $${idx++}`);
        params.push(severity);
      }
      if (hostId) {
        whereConditions.push(`i.host_id = $${idx++}`);
        params.push(hostId);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      params.push(limit, offset);
      const { rows } = await client.query(`
        SELECT 
          i.*,
          h.name AS host_name,
          h.ip AS host_ip,
          h.type AS host_type,
          h.rack AS host_rack,
          h.critical AS host_critical,
          (SELECT COUNT(*) FROM incident_events WHERE incident_id = i.id) AS event_count
        FROM incidents i
        JOIN hosts h ON i.host_id = h.id
        ${whereClause}
        ORDER BY 
          CASE i.state WHEN 'open' THEN 1 WHEN 'ack' THEN 2 ELSE 3 END,
          i.severity DESC,
          i.opened_at DESC
        LIMIT $${idx++} OFFSET $${idx}
      `, params);

      const { rows: countRows } = await client.query(`
        SELECT COUNT(*) FROM incidents i ${whereClause}
      `, params.slice(0, -2));

      return {
        incidents: rows,
        total: parseInt(countRows[0].count),
        limit,
        offset
      };
    });

    res.json(result);
  } catch (err) {
    Logger.error('Error listando incidentes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/monitoring/incidents/active
 * Lista solo incidentes activos (open o ack)
 */
router.get('/active', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      const { rows } = await client.query(`
        SELECT 
          i.*,
          h.name AS host_name,
          h.ip AS host_ip,
          h.type AS host_type,
          h.rack AS host_rack,
          h.critical AS host_critical
        FROM incidents i
        JOIN hosts h ON i.host_id = h.id
        WHERE i.state IN ('open', 'ack')
        ORDER BY 
          i.severity DESC,
          i.opened_at DESC
      `);

      return { incidents: rows };
    });

    res.json(result);
  } catch (err) {
    Logger.error('Error listando incidentes activos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/monitoring/incidents/:id
 * Detalle de un incidente con timeline
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseIncidentId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'id invalido' });
    }

    const result = await withClient(async (client) => {
      // Incidente
      const { rows: incidentRows } = await client.query(`
        SELECT 
          i.*,
          h.name AS host_name,
          h.ip AS host_ip,
          h.type AS host_type,
          h.rack AS host_rack,
          h.critical AS host_critical,
          h.estado_actual AS host_estado
        FROM incidents i
        JOIN hosts h ON i.host_id = h.id
        WHERE i.id = $1
      `, [id]);

      if (incidentRows.length === 0) {
        throw { status: 404, message: 'Incidente no encontrado' };
      }

      // Timeline de eventos
      const { rows: events } = await client.query(`
        SELECT * FROM incident_events 
        WHERE incident_id = $1 
        ORDER BY at DESC
      `, [id]);

      // Check runs durante el incidente
      const incident = incidentRows[0];
      const { rows: runs } = await client.query(`
        SELECT cr.*, c.kind
        FROM check_runs cr
        JOIN checks c ON cr.check_id = c.id
        WHERE cr.host_id = $1 
          AND cr.time >= $2
          AND cr.time <= COALESCE($3, NOW())
        ORDER BY cr.time DESC
        LIMIT 100
      `, [incident.host_id, incident.opened_at, incident.closed_at]);

      return {
        incident,
        events,
        checkRuns: runs
      };
    });

    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error obteniendo incidente:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/incidents/:id/ack
 * Acknowledges un incidente
 */
router.post('/:id/ack', requireAdmin, incidentesAccionRateLimiter, async (req, res) => {
  try {
    const id = parseIncidentId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'id invalido' });
    }
    const { user = 'system', note = '' } = req.body;
    const usuarioSeguro = sanitizeTextInput(user, 120);
    const notaSegura = sanitizeTextInput(note, 2000);

    await withClient(async (client) => {
      // Verificar que existe y está open
      const { rows: existing } = await client.query(
        'SELECT * FROM incidents WHERE id = $1',
        [id]
      );
      if (existing.length === 0) {
        throw { status: 404, message: 'Incidente no encontrado' };
      }
      if (existing[0].state !== 'open') {
        throw { status: 400, message: 'Solo se puede ACK incidentes en estado open' };
      }

      // Actualizar estado
      await client.query(`
        UPDATE incidents SET state = 'ack', last_event_at = NOW() WHERE id = $1
      `, [id]);

      // Registrar evento
      await client.query(`
        INSERT INTO incident_events (incident_id, type, payload, at)
        VALUES ($1, 'ack', $2, NOW())
      `, [id, JSON.stringify({ user: usuarioSeguro, note: notaSegura })]);
    });

    Logger.info(`Incidente ${id} acknowledged por ${usuarioSeguro}`);
    res.json({ success: true, state: 'ack' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error en ACK:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/incidents/:id/resolve
 * Marca un incidente como resuelto
 */
router.post('/:id/resolve', requireAdmin, incidentesAccionRateLimiter, async (req, res) => {
  try {
    const id = parseIncidentId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'id invalido' });
    }
    const { user = 'system', resolution = '' } = req.body;
    const usuarioSeguro = sanitizeTextInput(user, 120);
    const resolucionSegura = sanitizeTextInput(resolution, 2000);

    await withClient(async (client) => {
      const { rows: existing } = await client.query(
        'SELECT i.*, h.name AS host_name, h.ip AS host_ip FROM incidents i JOIN hosts h ON i.host_id = h.id WHERE i.id = $1',
        [id]
      );
      if (existing.length === 0) {
        throw { status: 404, message: 'Incidente no encontrado' };
      }
      if (existing[0].state === 'closed') {
        throw { status: 400, message: 'Incidente ya está cerrado' };
      }

      await client.query(`
        UPDATE incidents SET state = 'resolved', last_event_at = NOW() WHERE id = $1
      `, [id]);

      await client.query(`
        INSERT INTO incident_events (incident_id, type, payload, at)
        VALUES ($1, 'resolved', $2, NOW())
      `, [id, JSON.stringify({ user: usuarioSeguro, resolution: resolucionSegura })]);
    });

    Logger.info(`Incidente ${id} resuelto por ${usuarioSeguro}`);
    res.json({ success: true, state: 'resolved' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error resolviendo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/incidents/:id/close
 * Cierra un incidente definitivamente
 */
router.post('/:id/close', requireAdmin, incidentesAccionRateLimiter, async (req, res) => {
  try {
    const id = parseIncidentId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'id invalido' });
    }
    const { user = 'system', note = '' } = req.body;
    const usuarioSeguro = sanitizeTextInput(user, 120);
    const notaSegura = sanitizeTextInput(note, 2000);

    const incident = await withClient(async (client) => {
      const { rows: existing } = await client.query(
        'SELECT i.*, h.name AS host_name, h.ip AS host_ip, h.type AS host_type, h.rack AS host_rack FROM incidents i JOIN hosts h ON i.host_id = h.id WHERE i.id = $1',
        [id]
      );
      if (existing.length === 0) {
        throw { status: 404, message: 'Incidente no encontrado' };
      }

      await client.query(`
        UPDATE incidents SET state = 'closed', closed_at = NOW(), last_event_at = NOW() WHERE id = $1
      `, [id]);

      await client.query(`
        INSERT INTO incident_events (incident_id, type, payload, at)
        VALUES ($1, 'close', $2, NOW())
      `, [id, JSON.stringify({ user: usuarioSeguro, note: notaSegura })]);

      return existing[0];
    });

    // Notificar cierre
    try {
      await notificationService.notifyIncidentClosed(incident, {
        id: incident.host_id,
        name: incident.host_name,
        ip: incident.host_ip,
        type: incident.host_type,
        rack: incident.host_rack
      });
    } catch (notifyErr) {
      Logger.warn('Error notificando cierre:', notifyErr.message);
    }

    Logger.info(`Incidente ${id} cerrado por ${usuarioSeguro}`);
    res.json({ success: true, state: 'closed' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error cerrando:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/incidents/:id/note
 * Añade una nota al incidente
 */
router.post('/:id/note', requireAdmin, incidentesAccionRateLimiter, async (req, res) => {
  try {
    const id = parseIncidentId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'id invalido' });
    }
    const { user = 'system', note } = req.body;

    if (!note) {
      return res.status(400).json({ error: 'note es requerida' });
    }
    const usuarioSeguro = sanitizeTextInput(user, 120);
    const notaSegura = sanitizeTextInput(note, 4000);

    const result = await withClient(async (client) => {
      const { rowCount } = await client.query('SELECT 1 FROM incidents WHERE id = $1', [id]);
      if (rowCount === 0) {
        throw { status: 404, message: 'Incidente no encontrado' };
      }

      const { rows } = await client.query(`
        INSERT INTO incident_events (incident_id, type, payload, at)
        VALUES ($1, 'note', $2, NOW())
        RETURNING *
      `, [id, JSON.stringify({ user: usuarioSeguro, note: notaSegura })]);

      await client.query('UPDATE incidents SET last_event_at = NOW() WHERE id = $1', [id]);

      return rows[0];
    });

    Logger.info(`Nota añadida al incidente ${id} por ${usuarioSeguro}`);
    res.json({ success: true, event: result });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error añadiendo nota:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/monitoring/incidents/stats
 * Estadísticas de incidentes
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    const periodToDays = {
      '24h': 1,
      '7d': 7,
      '30d': 30
    };
    const dias = periodToDays[period] || 7;

    const result = await withClient(async (client) => {
      const { rows: byState } = await client.query(`
        SELECT state, COUNT(*) AS count
        FROM incidents
        GROUP BY state
      `);

      const { rows: bySeverity } = await client.query(`
        SELECT severity, COUNT(*) AS count
        FROM incidents
        WHERE opened_at > NOW() - ($1::int * INTERVAL '1 day')
        GROUP BY severity
      `, [dias]);

      const { rows: recent } = await client.query(`
        SELECT 
          DATE_TRUNC('day', opened_at) AS day,
          COUNT(*) AS opened,
          COUNT(*) FILTER (WHERE closed_at IS NOT NULL) AS closed
        FROM incidents
        WHERE opened_at > NOW() - ($1::int * INTERVAL '1 day')
        GROUP BY DATE_TRUNC('day', opened_at)
        ORDER BY day ASC
      `, [dias]);

      // MTTR (Mean Time To Resolve)
      const { rows: mttr } = await client.query(`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (closed_at - opened_at))) AS mttr_seconds
        FROM incidents
        WHERE closed_at IS NOT NULL 
          AND opened_at > NOW() - ($1::int * INTERVAL '1 day')
      `, [dias]);

      return {
        byState: byState.reduce((acc, r) => ({ ...acc, [r.state]: parseInt(r.count) }), {}),
        bySeverity: bySeverity.reduce((acc, r) => ({ ...acc, [r.severity]: parseInt(r.count) }), {}),
        dailyTrend: recent.map(r => ({
          day: r.day,
          opened: parseInt(r.opened),
          closed: parseInt(r.closed)
        })),
        mttr_minutes: mttr[0]?.mttr_seconds ? Math.round(mttr[0].mttr_seconds / 60) : null
      };
    });

    res.json(result);
  } catch (err) {
    Logger.error('Error en stats:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

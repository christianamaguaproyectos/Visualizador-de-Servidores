/**
 * alertRecipientsRoutes.js - API para gestionar destinatarios de alertas
 * Permite agregar, editar y eliminar emails que recibirán notificaciones
 */
import express from 'express';
import { withMonitoringClient } from '../config/monitoringDb.js';
import Logger from '../../utils/logger.js';
import { requireAdmin } from '../../middleware/authMiddleware.js';
import { createRateLimiter } from '../../middleware/rateLimitMiddleware.js';

const router = express.Router();
const alertasOperacionRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  message: 'Demasiadas operaciones de alertas. Espere un minuto antes de reintentar.'
});

function parseRecipientId(rawId) {
  const id = parseInt(rawId, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Formatea una fecha con la zona horaria de Ecuador (UTC-5)
 */
function formatDateEcuador(date = new Date()) {
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

// Helper que usa el pool de conexiones con schema correcto
async function withClient(fn) {
  return withMonitoringClient(async (client) => {
    await client.query('SET search_path TO monitoring, public');
    return fn(client);
  });
}


/**
 * GET /api/monitoring/alert-recipients
 * Lista todos los destinatarios de alertas
 */
router.get('/', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      const { rows } = await client.query(`
        SELECT id, email, name, enabled, notify_down, notify_degraded, notify_recovery, created_at, updated_at
        FROM alert_recipients
        ORDER BY name ASC, email ASC
      `);
      return rows;
    });
    res.json(result);
  } catch (err) {
    Logger.error('Error listando destinatarios:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/alert-recipients
 * Crea un nuevo destinatario de alertas
 */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { email, name, notify_down = true, notify_degraded = true, notify_recovery = true } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    const result = await withClient(async (client) => {
      const { rows } = await client.query(`
        INSERT INTO alert_recipients (email, name, notify_down, notify_degraded, notify_recovery)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [email.toLowerCase().trim(), name?.trim() || null, notify_down, notify_degraded, notify_recovery]);
      return rows[0];
    });

    Logger.success(`📧 Destinatario agregado: ${email}`);
    res.status(201).json(result);
  } catch (err) {
    if (err.code === '23505') { // unique violation
      return res.status(409).json({ error: 'Este email ya está registrado' });
    }
    Logger.error('Error creando destinatario:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/monitoring/alert-recipients/:id
 * Actualiza un destinatario de alertas
 */
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseRecipientId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'id invalido' });
    }
    const { email, name, enabled, notify_down, notify_degraded, notify_recovery } = req.body;

    const result = await withClient(async (client) => {
      // Construir query dinámicamente
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (email !== undefined) {
        updates.push(`email = $${paramCount++}`);
        values.push(email.toLowerCase().trim());
      }
      if (name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        values.push(name?.trim() || null);
      }
      if (enabled !== undefined) {
        updates.push(`enabled = $${paramCount++}`);
        values.push(enabled);
      }
      if (notify_down !== undefined) {
        updates.push(`notify_down = $${paramCount++}`);
        values.push(notify_down);
      }
      if (notify_degraded !== undefined) {
        updates.push(`notify_degraded = $${paramCount++}`);
        values.push(notify_degraded);
      }
      if (notify_recovery !== undefined) {
        updates.push(`notify_recovery = $${paramCount++}`);
        values.push(notify_recovery);
      }

      if (updates.length === 0) {
        throw { status: 400, message: 'No hay campos para actualizar' };
      }

      updates.push('updated_at = NOW()');
      values.push(id);

      const { rows } = await client.query(`
        UPDATE alert_recipients 
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `, values);

      if (rows.length === 0) {
        throw { status: 404, message: 'Destinatario no encontrado' };
      }

      return rows[0];
    });

    Logger.success(`📧 Destinatario actualizado: ${result.email}`);
    res.json(result);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Este email ya está registrado' });
    }
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error actualizando destinatario:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/monitoring/alert-recipients/:id
 * Elimina un destinatario de alertas
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseRecipientId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'id invalido' });
    }

    const result = await withClient(async (client) => {
      const { rows } = await client.query(`
        DELETE FROM alert_recipients WHERE id = $1 RETURNING email
      `, [id]);

      if (rows.length === 0) {
        throw { status: 404, message: 'Destinatario no encontrado' };
      }
      return rows[0];
    });

    Logger.success(`📧 Destinatario eliminado: ${result.email}`);
    res.json({ success: true, deleted: result.email });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error eliminando destinatario:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/alert-recipients/:id/toggle
 * Activa/desactiva un destinatario
 */
router.post('/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const id = parseRecipientId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'id invalido' });
    }

    const result = await withClient(async (client) => {
      const { rows } = await client.query(`
        UPDATE alert_recipients 
        SET enabled = NOT enabled, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id]);

      if (rows.length === 0) {
        throw { status: 404, message: 'Destinatario no encontrado' };
      }
      return rows[0];
    });

    Logger.info(`📧 Destinatario ${result.enabled ? 'activado' : 'desactivado'}: ${result.email}`);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error toggling destinatario:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/alert-recipients/test
 * Envía un email de prueba a todos los destinatarios activos
 */
router.post('/test', requireAdmin, alertasOperacionRateLimiter, async (req, res) => {
  try {
    const recipients = await withClient(async (client) => {
      const { rows } = await client.query(`
        SELECT email, name FROM alert_recipients WHERE enabled = true
      `);
      return rows;
    });

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No hay destinatarios activos' });
    }

    // Importar el servicio de notificaciones
    const notificationService = (await import('../services/notificationService.js')).default;

    const emails = recipients.map(r => r.email);
    const result = await notificationService.sendEmail({
      to: emails,
      subject: '🧪 [TEST] Prueba de Alertas - Sistema de Monitoreo',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1>🧪 Email de Prueba</h1>
          </div>
          <div style="background: white; padding: 20px; border: 1px solid #e5e7eb;">
            <p>Este es un email de prueba del Sistema de Monitoreo.</p>
            <p>Si recibes este mensaje, las alertas están configuradas correctamente.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p><strong>Destinatarios:</strong> ${emails.join(', ')}</p>
            <p><strong>Fecha:</strong> ${formatDateEcuador()}</p>
          </div>
          <div style="background: #f9fafb; padding: 10px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px;">
            Sistema de Monitoreo - Grupo Danec
          </div>
        </div>
      `,
      text: 'Este es un email de prueba del Sistema de Monitoreo.'
    });

    res.json({
      success: result.success,
      recipients: emails,
      messageId: result.messageId,
      error: result.error
    });
  } catch (err) {
    Logger.error('Error enviando test:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monitoring/alert-recipients/simulate
 * Simula una alerta de caída o recuperación de un host
 * Body: { hostId: number, action: 'down' | 'up' }
 */
router.post('/simulate', requireAdmin, alertasOperacionRateLimiter, async (req, res) => {
  try {
    const rawHostId = req.body?.hostId;
    const hostId = Number.parseInt(rawHostId, 10);
    const action = String(req.body?.action || '').toLowerCase();

    if (!Number.isInteger(hostId) || hostId <= 0 || !['down', 'up'].includes(action)) {
      return res.status(400).json({
        error: 'Parámetros inválidos',
        usage: { hostId: 'number', action: "'down' | 'up'" }
      });
    }

    const result = await withClient(async (client) => {
      // Obtener info del host
      const { rows: hosts } = await client.query(`
        SELECT id, name, host(ip)::text as ip, estado_actual, critical, type, rack
        FROM monitoring.hosts WHERE id = $1
      `, [hostId]);

      if (hosts.length === 0) {
        throw { status: 404, message: `Host ID ${hostId} no encontrado` };
      }

      const host = hosts[0];
      const previousState = host.estado_actual;
      const newState = action === 'down' ? 'DOWN' : 'UP';

      if (previousState === newState) {
        throw { status: 400, message: `El host ${host.name} ya está en estado ${newState}` };
      }

      // Actualizar estado del host
      await client.query(`
        UPDATE monitoring.hosts 
        SET estado_actual = $1, estado_changed_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `, [newState, hostId]);

      Logger.info(`🔔 Simulación: ${host.name} cambió de ${previousState} a ${newState}`);

      let incident = null;

      // Crear o cerrar incidente según la acción
      if (action === 'down') {
        // Crear incidente
        const { rows: incidentRows } = await client.query(`
          INSERT INTO monitoring.incidents (host_id, severity, state, summary, opened_at)
          VALUES ($1, $2, 'open', $3, NOW())
          RETURNING *
        `, [
          hostId,
          host.critical ? 'critical' : 'warning',
          `${host.name} (${host.ip}) - Simulación de caída`
        ]);
        incident = incidentRows[0];
        Logger.warn(`⚠️ Incidente creado por simulación: ${host.name}`);
      } else {
        // Cerrar incidentes abiertos
        const { rowCount } = await client.query(`
          UPDATE monitoring.incidents 
          SET state = 'resolved', closed_at = NOW()
          WHERE host_id = $1 AND state = 'open'
        `, [hostId]);
        if (rowCount > 0) {
          Logger.success(`✅ ${rowCount} incidente(s) cerrado(s) por simulación: ${host.name}`);
        }
      }

      return { host, previousState, newState, incident };
    });

    // Disparar notificación
    const notificationService = (await import('../services/notificationService.js')).default;

    await notificationService.notifyStateChange({
      host: {
        id: result.host.id,
        name: result.host.name,
        ip: result.host.ip,
        type: result.host.type,
        rack: result.host.rack,
        critical: result.host.critical
      },
      prevState: result.previousState,
      newState: result.newState,
      incident: result.incident
    });

    res.json({
      success: true,
      host: result.host.name,
      ip: result.host.ip,
      previousState: result.previousState,
      newState: result.newState,
      incidentId: result.incident?.id || null,
      message: `Simulación completada: ${result.host.name} ahora está ${result.newState}${result.incident ? ` - Incidente #${result.incident.id} creado` : ''}`
    });

  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error simulando alerta:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/monitoring/alert-recipients/hosts
 * Lista hosts disponibles para simular
 */
router.get('/hosts', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      const { rows } = await client.query(`
        SELECT id, name, ip, estado_actual, critical
        FROM monitoring.hosts 
        WHERE enabled = true 
        ORDER BY estado_actual DESC, name
        LIMIT 30
      `);
      return rows;
    });
    res.json(result);
  } catch (err) {
    Logger.error('Error listando hosts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

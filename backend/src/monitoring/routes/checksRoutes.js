/**
 * checksRoutes.js - API CRUD para gestión de checks de monitoreo
 */
import express from 'express';
import { withMonitoringClient } from '../config/monitoringDb.js';
import Logger from '../../utils/logger.js';
import { responderErrorInterno } from '../../utils/respuestaError.js';
import { requireAdmin } from '../../middleware/authMiddleware.js';
import { validarConfiguracionChequeo, validarParametrosChequeo } from '../domain/validators/checkConfigValidator.js';
import { validarDestinoChequeo } from '../domain/validators/networkTargetValidator.js';
import { TiposChequeo } from '../domain/glosario/terminosDominio.js';

const router = express.Router();
const TIPOS_VALIDOS = [TiposChequeo.ICMP, TiposChequeo.TCP, TiposChequeo.HTTP];

function parseIdOrFail(rawId, res) {
  const id = parseInt(rawId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'id invalido' });
    return null;
  }
  return id;
}

// Helper que usa el pool de conexiones con schema correcto
async function withClient(fn) {
  return withMonitoringClient(async (client) => {
    await client.query('SET search_path TO monitoring, public');
    return fn(client);
  });
}


/**
 * GET /api/monitoring/checks
 * Lista todos los checks con información del host asociado
 */
router.get('/', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      const { rows } = await client.query(`
        SELECT 
          c.id,
          c.host_id,
          c.kind,
          c.config,
          c.frequency_sec,
          c.timeout_ms,
          c.retries,
          c.enabled,
          c.next_run_at,
          c.created_at,
          h.name AS host_name,
          h.ip AS host_ip,
          h.type AS host_type,
          h.estado_actual AS host_estado
        FROM checks c
        JOIN hosts h ON c.host_id = h.id
        ORDER BY c.id ASC
      `);
      return { checks: rows };
    });
    res.json(result);
  } catch (err) {
    Logger.error('Error listando checks:', err.message);
    responderErrorInterno(req, res);
  }
});

/**
 * GET /api/monitoring/checks/:id
 * Obtiene un check específico con historial reciente
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseIdOrFail(req.params.id, res);
    if (!id) return;

    const result = await withClient(async (client) => {
      // Obtener check
      const { rows: checkRows } = await client.query(`
        SELECT 
          c.*,
          h.name AS host_name,
          h.ip AS host_ip,
          h.type AS host_type,
          h.estado_actual AS host_estado
        FROM checks c
        JOIN hosts h ON c.host_id = h.id
        WHERE c.id = $1
      `, [id]);

      if (checkRows.length === 0) {
        throw { status: 404, message: 'Check no encontrado' };
      }

      // Obtener últimos 20 runs
      const { rows: runs } = await client.query(`
        SELECT time, status, latency_ms, code, error
        FROM check_runs
        WHERE check_id = $1
        ORDER BY time DESC
        LIMIT 20
      `, [id]);

      return { check: checkRows[0], recentRuns: runs };
    });

    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error obteniendo check:', err.message);
    responderErrorInterno(req, res);
  }
});

/**
 * Devuelve una copia de la config completando la IP del host para ICMP/TCP
 * cuando no viene ni `host` ni `ip` (así lo envía el modal "Nuevo Check").
 * @param {string} kind
 * @param {Object} config
 * @param {string|undefined} ipHost
 * @returns {Object}
 */
function completarConfigConIpHost(kind, config, ipHost) {
  const finalConfig = { ...(config || {}) };
  if ((kind === 'icmp' || kind === 'tcp') && !finalConfig.host && !finalConfig.ip && ipHost) {
    finalConfig.ip = ipHost;
  }
  return finalConfig;
}

/**
 * Valida la config FINAL de un check: sintaxis y destino de red (anti-SSRF)
 * @param {string} kind
 * @param {Object} finalConfig
 * @returns {Promise<string|null>} mensaje de error o null si es válida
 */
async function validarConfigFinal(kind, finalConfig) {
  const validacionConfig = validarConfiguracionChequeo(kind, finalConfig);
  if (!validacionConfig.valido) return validacionConfig.error;

  const destino = await validarDestinoChequeo(kind, finalConfig);
  if (!destino.valido) return destino.error;

  return null;
}

/**
 * POST /api/monitoring/checks
 * Crea un nuevo check
 * Body: { host_id, kind, config, frequency_sec, timeout_ms, retries, enabled }
 */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      host_id,
      kind,
      config = {},
      frequency_sec = 60,
      timeout_ms = 2000,
      retries = 0,
      enabled = true
    } = req.body;

    // Validaciones
    if (!host_id) {
      return res.status(400).json({ error: 'host_id es requerido' });
    }
    if (!kind || !TIPOS_VALIDOS.includes(kind)) {
      return res.status(400).json({ error: 'kind debe ser icmp, tcp o http' });
    }

    const validacionParametros = validarParametrosChequeo({ frequency_sec, timeout_ms, retries });
    if (!validacionParametros.valido) {
      return res.status(400).json({ error: validacionParametros.error });
    }

    const result = await withClient(async (client) => {
      // Verificar que el host existe (host(ip)::text evita el sufijo /32 del tipo INET)
      const { rows: hostRows } = await client.query('SELECT id, host(ip)::text AS ip FROM hosts WHERE id = $1', [host_id]);
      if (hostRows.length === 0) {
        throw { status: 404, message: 'Host no encontrado' };
      }

      // Primero completar con la IP del host (el modal "Nuevo Check" envía config sin ip)
      // y DESPUÉS validar sintaxis + destino (anti-SSRF) sobre la config final
      const finalConfig = completarConfigConIpHost(kind, config, hostRows[0].ip);
      const errorConfig = await validarConfigFinal(kind, finalConfig);
      if (errorConfig) {
        throw { status: 400, message: errorConfig };
      }

      const { rows } = await client.query(`
        INSERT INTO checks (host_id, kind, config, frequency_sec, timeout_ms, retries, enabled, next_run_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *
      `, [host_id, kind, JSON.stringify(finalConfig), frequency_sec, timeout_ms, retries, enabled]);

      return rows[0];
    });

    Logger.success(`Check creado: ID=${result.id}, kind=${kind}, host_id=${host_id}`);
    res.status(201).json({ check: result });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error creando check:', err.message);
    responderErrorInterno(req, res);
  }
});

/**
 * PUT /api/monitoring/checks/:id
 * Actualiza un check existente
 */
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseIdOrFail(req.params.id, res);
    if (!id) return;
    const {
      kind,
      config,
      frequency_sec,
      timeout_ms,
      retries,
      enabled
    } = req.body;

    const validacionParametros = validarParametrosChequeo({ frequency_sec, timeout_ms, retries });
    if (!validacionParametros.valido) {
      return res.status(400).json({ error: validacionParametros.error });
    }

    const result = await withClient(async (client) => {
      // Verificar que existe
      const { rows: existing } = await client.query('SELECT * FROM checks WHERE id = $1', [id]);
      if (existing.length === 0) {
        throw { status: 404, message: 'Check no encontrado' };
      }

      // Construir query dinámico
      const updates = [];
      const values = [];
      let idx = 1;

      if (kind !== undefined) {
        if (!TIPOS_VALIDOS.includes(kind)) {
          throw { status: 400, message: 'kind debe ser icmp, tcp o http' };
        }
        updates.push(`kind = $${idx++}`);
        values.push(kind);
      }
      if (config !== undefined || kind !== undefined) {
        const tipoFinal = kind ?? existing[0].kind;
        const configBase = config ?? existing[0].config ?? {};

        // IP de respaldo: la que ya tenía el check o, si no, la del host asociado
        let ipRespaldo = existing[0].config?.ip;
        if (!ipRespaldo) {
          const { rows: hostRows } = await client.query('SELECT host(ip)::text AS ip FROM hosts WHERE id = $1', [existing[0].host_id]);
          ipRespaldo = hostRows[0]?.ip;
        }

        const finalConfig = completarConfigConIpHost(tipoFinal, configBase, ipRespaldo);
        const errorConfig = await validarConfigFinal(tipoFinal, finalConfig);
        if (errorConfig) {
          throw { status: 400, message: errorConfig };
        }
        updates.push(`config = $${idx++}`);
        values.push(JSON.stringify(finalConfig));
      }
      if (frequency_sec !== undefined) {
        updates.push(`frequency_sec = $${idx++}`);
        values.push(frequency_sec);
      }
      if (timeout_ms !== undefined) {
        updates.push(`timeout_ms = $${idx++}`);
        values.push(timeout_ms);
      }
      if (retries !== undefined) {
        updates.push(`retries = $${idx++}`);
        values.push(retries);
      }
      if (enabled !== undefined) {
        updates.push(`enabled = $${idx++}`);
        values.push(enabled);
      }

      if (updates.length === 0) {
        throw { status: 400, message: 'No hay campos para actualizar' };
      }

      values.push(id);
      const { rows } = await client.query(`
        UPDATE checks SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *
      `, values);

      return rows[0];
    });

    Logger.info(`Check actualizado: ID=${id}`);
    res.json({ check: result });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error actualizando check:', err.message);
    responderErrorInterno(req, res);
  }
});

/**
 * DELETE /api/monitoring/checks/:id
 * Elimina un check y su historial
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseIdOrFail(req.params.id, res);
    if (!id) return;

    await withClient(async (client) => {
      const { rowCount } = await client.query('DELETE FROM checks WHERE id = $1', [id]);
      if (rowCount === 0) {
        throw { status: 404, message: 'Check no encontrado' };
      }
    });

    Logger.info(`Check eliminado: ID=${id}`);
    res.json({ success: true, message: 'Check eliminado correctamente' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    Logger.error('Error eliminando check:', err.message);
    responderErrorInterno(req, res);
  }
});

/**
 * POST /api/monitoring/checks/:id/run
 * Ejecuta un check INMEDIATAMENTE y devuelve el resultado
 */
router.post('/:id/run', requireAdmin, async (req, res) => {
  try {
    const id = parseIdOrFail(req.params.id, res);
    if (!id) return;

    // Importar scheduler y ejecutar inmediatamente
    const scheduler = (await import('../scheduler/scheduler.js')).default;
    const result = await scheduler.executeCheckNow(id);

    Logger.success(`✅ Check ${id} ejecutado: ${result.status}`);
    res.json({
      success: true,
      message: `Check ejecutado: ${result.status}`,
      result
    });
  } catch (err) {
    Logger.error('Error ejecutando check:', err.message);
    responderErrorInterno(req, res);
  }
});

/**
 * POST /api/monitoring/checks/bulk
 * Crea checks en lote para múltiples hosts
 * Body: { host_ids: [], kind, config, frequency_sec, ... }
 */
router.post('/bulk', requireAdmin, async (req, res) => {
  try {
    const {
      host_ids = [],
      kind,
      config = {},
      frequency_sec = 60,
      timeout_ms = 2000,
      retries = 0,
      enabled = true
    } = req.body;

    if (!host_ids.length) {
      return res.status(400).json({ error: 'host_ids es requerido (array)' });
    }
    if (!kind || !TIPOS_VALIDOS.includes(kind)) {
      return res.status(400).json({ error: 'kind debe ser icmp, tcp o http' });
    }

    const validacionParametros = validarParametrosChequeo({ frequency_sec, timeout_ms, retries });
    if (!validacionParametros.valido) {
      return res.status(400).json({ error: validacionParametros.error });
    }

    const result = await withClient(async (client) => {
      const created = [];
      const errors = [];

      for (const host_id of host_ids) {
        try {
          // Obtener IP del host
          const { rows: hostRows } = await client.query('SELECT id, host(ip)::text AS ip FROM hosts WHERE id = $1', [host_id]);
          if (hostRows.length === 0) {
            errors.push({ host_id, error: 'Host no encontrado' });
            continue;
          }

          // Completar con la IP del host y luego validar sintaxis + destino (anti-SSRF)
          const finalConfig = completarConfigConIpHost(kind, config, hostRows[0].ip);
          const errorConfig = await validarConfigFinal(kind, finalConfig);
          if (errorConfig) {
            errors.push({ host_id, error: errorConfig });
            continue;
          }

          const { rows } = await client.query(`
            INSERT INTO checks (host_id, kind, config, frequency_sec, timeout_ms, retries, enabled, next_run_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING id
          `, [host_id, kind, JSON.stringify(finalConfig), frequency_sec, timeout_ms, retries, enabled]);

          created.push({ host_id, check_id: rows[0].id });
        } catch (err) {
          Logger.error(`Error creando check en lote para host ${host_id}:`, err.message);
          errors.push({ host_id, error: 'No se pudo crear el check' });
        }
      }

      return { created, errors };
    });

    Logger.success(`Checks bulk creados: ${result.created.length} exitosos, ${result.errors.length} errores`);
    res.status(201).json(result);
  } catch (err) {
    Logger.error('Error en bulk create:', err.message);
    responderErrorInterno(req, res);
  }
});

/**
 * GET /api/monitoring/checks/stats
 * Obtiene estadísticas de checks
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      const { rows: stats } = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE enabled = true) AS enabled_count,
          COUNT(*) FILTER (WHERE enabled = false) AS disabled_count,
          COUNT(*) FILTER (WHERE kind = 'icmp') AS icmp_count,
          COUNT(*) FILTER (WHERE kind = 'tcp') AS tcp_count,
          COUNT(*) FILTER (WHERE kind = 'http') AS http_count
        FROM checks
      `);

      const { rows: recentStats } = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'ok') AS ok_count,
          COUNT(*) FILTER (WHERE status = 'fail') AS fail_count,
          COUNT(*) FILTER (WHERE status = 'timeout') AS timeout_count,
          COUNT(*) FILTER (WHERE status = 'degraded') AS degraded_count,
          AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS avg_latency
        FROM check_runs
        WHERE time > NOW() - INTERVAL '1 hour'
      `);

      return {
        checks: stats[0],
        lastHour: {
          ...recentStats[0],
          avg_latency: recentStats[0]?.avg_latency ? Math.round(recentStats[0].avg_latency) : null
        }
      };
    });

    res.json(result);
  } catch (err) {
    Logger.error('Error obteniendo stats:', err.message);
    responderErrorInterno(req, res);
  }
});

export default router;

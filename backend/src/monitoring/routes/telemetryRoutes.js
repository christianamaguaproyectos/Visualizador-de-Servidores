/**
 * telemetryRoutes.js - Telemetría de solo lectura para la vista en tiempo real de Monitoreo
 *
 *  GET /api/monitoring/telemetry/overview            estado de todos los hosts + mini-serie de latencia
 *  GET /api/monitoring/telemetry/hosts/:id/series    serie por check (latencia y disponibilidad) + incidentes
 *
 * Consultas parametrizadas y acotadas: se apoyan en los índices check_runs(host_id, time DESC)
 * y check_runs(check_id, time DESC), con ventana de tiempo y número de puntos limitados.
 */
import express from 'express';
import { withMonitoringClient } from '../config/monitoringDb.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import { parsePositiveBigInt } from '../../utils/ids.js';

const router = express.Router();
router.use(requireAuth);

export const LIMITES = Object.freeze({
  puntosResumen: { min: 5, max: 60, defecto: 24 },
  minutos: { min: 5, max: 1440, defecto: 60 },
  puntosSerie: { min: 10, max: 300, defecto: 120 },
  maxHosts: 1000,
  maxIncidentes: 20,
  maxChecks: 20
});

/** Entero dentro de [min, max]; ausente -> valor por defecto; inválido -> ValidationError (400) */
function enteroAcotado(valor, nombre, { min, max, defecto }) {
  if (valor === undefined || valor === '') return defecto;
  const texto = String(valor).trim();
  if (!/^\d{1,6}$/.test(texto)) throw new ValidationError(`${nombre} debe ser un entero entre ${min} y ${max}`);
  const n = Number(texto);
  if (n < min || n > max) throw new ValidationError(`${nombre} debe ser un entero entre ${min} y ${max}`);
  return n;
}

async function conCliente(fn) {
  return withMonitoringClient(async (client) => {
    await client.query('SET search_path TO monitoring, public');
    return fn(client);
  });
}

/** Etiqueta legible del destino de un check, sin exponer la configuración completa */
function etiquetaCheck(kind, config = {}) {
  if (kind === 'tcp') return `TCP ${config.port ?? '?'}`;
  if (kind === 'http') {
    try {
      const u = new URL(String(config.url || ''));
      return `HTTP ${u.pathname || '/'}`;
    } catch {
      return 'HTTP';
    }
  }
  return 'ICMP';
}

/**
 * GET /overview?points=24
 * Estado actual de cada host habilitado con sus últimos N tiempos de respuesta (últimas 6 h).
 * Cada punto es [epoch_ms, latencia_ms|null, estado].
 */
router.get('/overview', async (req, res, next) => {
  try {
    const puntos = enteroAcotado(req.query.points, 'points', LIMITES.puntosResumen);
    const hosts = await conCliente(async (client) => {
      const { rows } = await client.query(`
        SELECT h.id, h.name, host(h.ip) AS ip, h.type, h.rack, h.critical,
               h.estado_actual, h.estado_changed_at,
               (SELECT COUNT(*)::int FROM incidents i
                 WHERE i.host_id = h.id AND i.state IN ('open', 'ack')) AS open_incidents,
               (SELECT COUNT(*)::int FROM checks c
                 WHERE c.host_id = h.id AND c.enabled) AS active_checks,
               COALESCE(s.serie, '[]'::json) AS serie
          FROM hosts h
          LEFT JOIN LATERAL (
            SELECT json_agg(json_build_array(
                     (EXTRACT(EPOCH FROM r.time) * 1000)::bigint, r.latency_ms, r.status) ORDER BY r.time) AS serie
              FROM (SELECT time, latency_ms, status FROM check_runs
                     WHERE host_id = h.id AND time > NOW() - INTERVAL '6 hours'
                     ORDER BY time DESC LIMIT $1) r
          ) s ON TRUE
         WHERE h.enabled
         ORDER BY h.rack NULLS LAST, h.name
         LIMIT $2`, [puntos, LIMITES.maxHosts]);
      return rows;
    });
    res.set('Cache-Control', 'no-store');
    res.json({ generatedAt: new Date().toISOString(), points: puntos, hosts });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /hosts/:id/series?minutes=60&limit=120
 * Serie por check (latencia y estado de cada ejecución) dentro de la ventana pedida,
 * más la línea de tiempo de incidentes del host.
 */
router.get('/hosts/:id/series', async (req, res, next) => {
  try {
    const id = parsePositiveBigInt(req.params.id, 'id').toString();
    const minutos = enteroAcotado(req.query.minutes, 'minutes', LIMITES.minutos);
    const limite = enteroAcotado(req.query.limit, 'limit', LIMITES.puntosSerie);

    const datos = await conCliente(async (client) => {
      const { rows: hostRows } = await client.query(`
        SELECT id, name, host(ip) AS ip, type, rack, critical, enabled, estado_actual, estado_changed_at
          FROM hosts WHERE id = $1`, [id]);
      if (hostRows.length === 0) return null;

      const { rows: checks } = await client.query(`
        SELECT c.id, c.kind, c.config, c.enabled, c.frequency_sec,
               COALESCE(s.serie, '[]'::json) AS points
          FROM checks c
          LEFT JOIN LATERAL (
            SELECT json_agg(json_build_array(
                     (EXTRACT(EPOCH FROM r.time) * 1000)::bigint, r.latency_ms, r.status) ORDER BY r.time) AS serie
              FROM (SELECT time, latency_ms, status FROM check_runs
                     WHERE check_id = c.id AND time > NOW() - make_interval(mins => $2)
                     ORDER BY time DESC LIMIT $3) r
          ) s ON TRUE
         WHERE c.host_id = $1
         ORDER BY c.enabled DESC, c.kind, c.id
         LIMIT $4`, [id, minutos, limite, LIMITES.maxChecks]);

      const { rows: incidentes } = await client.query(`
        SELECT i.id, i.state, i.severity, i.summary, i.opened_at, i.last_event_at, i.closed_at,
               (SELECT MIN(e.at) FROM incident_events e WHERE e.incident_id = i.id AND e.type = 'ack') AS ack_at
          FROM incidents i
         WHERE i.host_id = $1
         ORDER BY i.opened_at DESC
         LIMIT $2`, [id, LIMITES.maxIncidentes]);

      return { host: hostRows[0], checks, incidentes };
    });

    if (!datos) return res.status(404).json({ error: 'Host no encontrado' });

    res.set('Cache-Control', 'no-store');
    res.json({
      generatedAt: new Date().toISOString(),
      minutes: minutos,
      limit: limite,
      host: datos.host,
      checks: datos.checks.map((c) => ({
        id: c.id,
        kind: c.kind,
        label: etiquetaCheck(c.kind, c.config || {}),
        enabled: c.enabled,
        frequency_sec: c.frequency_sec,
        points: c.points
      })),
      incidents: datos.incidentes
    });
  } catch (err) {
    next(err);
  }
});

export default router;

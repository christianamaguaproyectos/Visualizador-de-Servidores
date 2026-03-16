/**
 * Rutas principales del módulo de monitoreo
 * Agrupa todas las sub-rutas: hosts, checks, incidents, maintenance, alert-recipients
 */
import express from 'express';
import monitoringConfig from '../config/monitoringConfig.js';
import { withMonitoringClient } from '../config/monitoringDb.js';
import { requireAdmin } from '../../middleware/authMiddleware.js';
import { createRateLimiter } from '../../middleware/rateLimitMiddleware.js';


// Importar sub-routers
import checksRoutes from './checksRoutes.js';
import hostsRoutes from './hostsRoutes.js';
import incidentsRoutes from './incidentsRoutes.js';
import maintenanceRoutes from './maintenanceRoutes.js';
import alertRecipientsRoutes from './alertRecipientsRoutes.js';

const router = express.Router();
const syncRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 2,
  message: 'Demasiadas sincronizaciones solicitadas. Espere un minuto antes de reintentar.'
});

// Montar sub-rutas
router.use('/checks', checksRoutes);
router.use('/hosts', hostsRoutes);
router.use('/incidents', incidentsRoutes);
router.use('/maintenance', requireAdmin, maintenanceRoutes);
router.use('/alert-recipients', alertRecipientsRoutes);

// === Rutas generales de monitoreo ===

router.get('/health', (req, res) => {
  res.json({
    monitoringEnabled: monitoringConfig.enabled,
    hasPostgres: !!monitoringConfig.postgresUrl,
    smtpConfigured: !!(monitoringConfig.smtp?.host),
    teamsConfigured: !!monitoringConfig.teamsWebhookUrl
  });
});

router.get('/config', (req, res) => {
  const { enabled, postgresUrl, smtp, teamsWebhookUrl, defaults } = monitoringConfig;
  res.json({
    enabled,
    hasPostgres: !!postgresUrl,
    smtpConfigured: !!smtp.host,
    teamsConfigured: !!teamsWebhookUrl,
    defaults
  });
});

/**
 * GET /api/monitoring/dashboard
 * Datos consolidados para el dashboard principal
 */
router.get('/dashboard', async (req, res) => {
  if (!monitoringConfig.postgresUrl) {
    return res.status(400).json({ error: 'POSTGRES_URL no configurado' });
  }
  try {
    const result = await withMonitoringClient(async (client) => {
      await client.query('SET search_path TO monitoring, public');

      // Resumen de hosts por estado
      const { rows: hostSummary } = await client.query(`
        SELECT 
          estado_actual,
          COUNT(*) AS count,
          COUNT(*) FILTER (WHERE critical = true) AS critical_count
        FROM hosts WHERE enabled = true
        GROUP BY estado_actual
      `);

      // Incidentes activos
      const { rows: activeIncidents } = await client.query(`
        SELECT 
          i.*,
          h.name AS host_name,
          h.ip AS host_ip,
          h.critical AS host_critical
        FROM incidents i
        JOIN hosts h ON i.host_id = h.id
        WHERE i.state IN ('open', 'ack')
        ORDER BY i.severity DESC, i.opened_at DESC
        LIMIT 10
      `);

      // Hosts críticos caídos
      const { rows: criticalDown } = await client.query(`
        SELECT id, name, ip, estado_actual, estado_changed_at
        FROM hosts
        WHERE critical = true AND estado_actual IN ('DOWN', 'DEGRADED')
        ORDER BY estado_changed_at DESC
      `);

      // Métricas últimas 2 horas
      const { rows: recentMetrics } = await client.query(`
        SELECT 
          COUNT(*) AS total_checks,
          COUNT(*) FILTER (WHERE status = 'ok') AS ok_count,
          COUNT(*) FILTER (WHERE status = 'fail') AS fail_count,
          COUNT(*) FILTER (WHERE status = 'timeout') AS timeout_count,
          AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS avg_latency
        FROM check_runs
        WHERE time > NOW() - INTERVAL '2 hours'
      `);

      // Tendencia de checks (últimas 24h por hora)
      const { rows: hourlyTrend } = await client.query(`
        SELECT 
          DATE_TRUNC('hour', time) AS hour,
          COUNT(*) FILTER (WHERE status = 'ok') AS ok,
          COUNT(*) FILTER (WHERE status != 'ok') AS fail
        FROM check_runs
        WHERE time > NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', time)
        ORDER BY hour ASC
      `);

      // Construir respuesta
      const summary = {
        UP: 0, DOWN: 0, DEGRADED: 0, UNKNOWN: 0, MAINTENANCE: 0, total: 0
      };
      hostSummary.forEach(row => {
        summary[row.estado_actual] = parseInt(row.count);
        summary.total += parseInt(row.count);
      });

      return {
        summary,
        activeIncidents,
        criticalDown,
        recentMetrics: {
          ...recentMetrics[0],
          avg_latency: recentMetrics[0]?.avg_latency ? Math.round(recentMetrics[0].avg_latency) : null
        },
        hourlyTrend: hourlyTrend.map(r => ({
          hour: r.hour,
          ok: parseInt(r.ok),
          fail: parseInt(r.fail)
        }))
      };
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mantener endpoint legacy para compatibilidad
router.get('/hosts/status', async (req, res) => {
  if (!monitoringConfig.postgresUrl) {
    return res.status(400).json({ error: 'POSTGRES_URL no configurado' });
  }
  try {
    const data = await withMonitoringClient(async (client) => {
      await client.query('SET search_path TO monitoring, public');
      const hosts = await client.query('SELECT id, name, ip, type, estado_actual, estado_changed_at FROM hosts ORDER BY id ASC LIMIT 200');
      const runs = await client.query(`
        SELECT host_id,
               MAX(time) AS last_time,
               AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS avg_latency_ms,
               COUNT(*) FILTER (WHERE status='fail' OR status='timeout') AS fails,
               COUNT(*) FILTER (WHERE status='ok') AS oks
        FROM check_runs
        WHERE time > NOW() - INTERVAL '2 hours'
        GROUP BY host_id
      `);
      const runsMap = new Map(runs.rows.map(r => [r.host_id, r]));
      return hosts.rows.map(h => {
        const r = runsMap.get(h.id) || {};
        return {
          id: h.id,
          name: h.name,
          ip: h.ip,
          type: h.type,
          estado_actual: h.estado_actual,
          estado_changed_at: h.estado_changed_at,
          last_check_time: r.last_time || null,
          avg_latency_ms: r.avg_latency_ms || null,
          recent_fail_count: r.fails || 0,
          recent_ok_count: r.oks || 0
        };
      });
    });
    res.json({ hosts: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/monitoring/sync
 * Sincronización completa entre inventario y monitoreo
 */
router.post('/sync', requireAdmin, syncRateLimiter, async (req, res) => {
  try {
    const monitoringSyncService = (await import('../../services/monitoringSyncService.js')).default;
    const stats = await monitoringSyncService.fullSync();
    res.json({
      success: true,
      message: 'Sincronización completada',
      stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
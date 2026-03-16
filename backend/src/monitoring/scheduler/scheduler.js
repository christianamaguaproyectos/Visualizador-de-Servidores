import monitoringConfig from '../config/monitoringConfig.js';
import Logger from '../../utils/logger.js';
import { Client } from 'pg';
import checkExecutorService from '../services/checkExecutorService.js';
import stateEvaluatorService from '../services/stateEvaluatorService.js';
import notificationService from '../services/notificationService.js';
import { EstadosChequeo, EstadosHost, SeveridadesIncidente } from '../domain/glosario/terminosDominio.js';
import { logAdvertencia, logError, logInfo } from '../../utils/structuredLogger.js';

// Scheduler lee checks desde Postgres y los ejecuta directamente según frequency_sec.

class Scheduler {
  constructor() {
    this.intervalMs = 5000; // cada 5s revisa si toca ejecutar algo
    this.timer = null;
    this.pg = null;
    this.cache = new Map(); // id -> { lastRun }
    this.loading = false;
    this.reloadIntervalMs = 30000; // refrescar lista cada 30s
    this.lastReload = 0;
  }

  async start() {
    if (!monitoringConfig.enabled) {
      Logger.info('Scheduler monitoreo deshabilitado');
      logInfo('scheduler.deshabilitado', 'El scheduler de monitoreo esta deshabilitado por configuracion', 'monitoreo');
      return;
    }
    if (!monitoringConfig.postgresUrl) {
      Logger.warn('Scheduler sin POSTGRES_URL; abortando.');
      return;
    }
    try {
      this.pg = new Client({ connectionString: monitoringConfig.postgresUrl });
      await this.pg.connect();
      await this.pg.query('SET search_path TO monitoring, public');
      Logger.success('Scheduler conectado a Postgres');
      logInfo('scheduler.conectado', 'Scheduler conectado a la base de datos de monitoreo', 'monitoreo');
    } catch (e) {
      Logger.error('No se pudo conectar a Postgres para scheduler:', e.message);
      logError('scheduler.error_conexion', 'No se pudo conectar a Postgres para scheduler', 'monitoreo', {}, e);
      return;
    }
    await this.reloadChecks();
    // Tick inmediato para no esperar intervalMs
    await this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    Logger.success('Scheduler monitoreo iniciado (ejecución directa)');
    logInfo('scheduler.iniciado', 'Scheduler de monitoreo iniciado en modo ejecucion directa', 'monitoreo', {
      intervaloMs: this.intervalMs,
      recargaMs: this.reloadIntervalMs
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.pg) this.pg.end().catch(() => { });
  }

  /**
   * Fuerza una recarga inmediata de checks desde la base de datos
   * Llamar cuando se modifica un host (IP, enabled, etc.)
   */
  async forceReload() {
    Logger.info('⚡ Forzando recarga de checks por cambio en hosts...');
    this.lastReload = 0; // Resetear timestamp para forzar recarga inmediata
    await this.reloadChecks();
    Logger.success('⚡ Recarga de checks completada');
  }

  async reloadChecks() {
    if (this.loading) return;
    this.loading = true;
    try {
      // Incluir IP del host en la consulta para que los checks ICMP funcionen
      // Usar host(ip) para obtener solo la IP sin la máscara CIDR
      const { rows } = await this.pg.query(`
        SELECT c.id, c.kind, c.config, c.frequency_sec, c.timeout_ms, c.host_id, host(h.ip)::text as host_ip, h.name as host_name
        FROM checks c 
        JOIN hosts h ON c.host_id = h.id 
        WHERE c.enabled = true AND h.enabled = true
      `);
      this.checks = rows.map(r => ({
        ...r,
        // Agregar IP al config si es check ICMP
        config: r.kind === 'icmp'
          ? { ...r.config, ip: r.host_ip, host: r.host_ip }
          : r.config
      }));
      // Limpiar cache de checks removidos
      const validIds = new Set(rows.map(r => r.id));
      for (const id of this.cache.keys()) {
        if (!validIds.has(id)) this.cache.delete(id);
      }
      Logger.debug(`Scheduler recargó ${rows.length} checks`);
    } catch (e) {
      Logger.error('Error recargando checks:', e.message);
      logError('scheduler.error_recarga_checks', 'Error recargando checks', 'monitoreo', {}, e);
    } finally {
      this.loading = false;
      this.lastReload = Date.now();
    }
  }

  async tick() {
    if (!this.pg) return;
    const now = Date.now();
    if (now - this.lastReload > this.reloadIntervalMs) {
      await this.reloadChecks();
    }
    if (!this.checks || this.checks.length === 0) return;

    for (const c of this.checks) {
      const meta = this.cache.get(c.id) || { lastRun: 0 };
      const due = meta.lastRun + c.frequency_sec * 1000;
      if (now >= due) {
        meta.lastRun = now;
        this.cache.set(c.id, meta);
        // Ejecutar directamente
        await this.executeAndPersist(c);
      }
    }
  }

  async executeAndPersist(c) {
    try {
      const result = await checkExecutorService.execute({ kind: c.kind, config: c.config, timeoutMs: c.timeout_ms });
      await this.persistRun(c, result);
    } catch (e) {
      logError('scheduler.error_ejecucion_check', 'Error ejecutando check programado', 'monitoreo', {
        checkId: c.id,
        tipo: c.kind,
        hostId: c.host_id
      }, e);
      await this.persistRun(c, { status: EstadosChequeo.FALLA, error: e.message });
    }
  }

  async persistRun(c, result) {
    // Usar host_id que ya viene del check
    const hostId = c.host_id;
    if (!hostId) return;

    const time = new Date();
    const status = result.status || EstadosChequeo.FALLA;
    const latency = result.latency || null;
    const code = result.code || null;
    const error = result.error || null;
    const sample = result.sample ? JSON.stringify(result.sample) : null;
    try {
      await this.pg.query(
        'INSERT INTO check_runs(time, check_id, host_id, status, latency_ms, code, error, sample) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [time, c.id, hostId, status, latency, code, error, sample]
      );
    } catch (e) {
      Logger.error('Error insertando check_run', c.id, e.message);
      logError('scheduler.error_persistencia_check_run', 'Error insertando check_run', 'monitoreo', {
        checkId: c.id,
        hostId
      }, e);
    }

    // Evaluar y actualizar estado del host (últimos 5 runs de cualquiera de sus checks)
    try {
      const { rows: recent } = await this.pg.query(
        'SELECT status FROM check_runs WHERE host_id=$1 ORDER BY time DESC LIMIT 5',
        [hostId]
      );
      const { rows: hostRows } = await this.pg.query('SELECT id, name, estado_actual, host(ip)::text as ip, type, rack FROM hosts WHERE id=$1', [hostId]);
      if (hostRows.length) {
        const hostRecord = hostRows[0];
        const prevState = hostRecord.estado_actual;

        stateEvaluatorService.evaluateAndTransition(
          hostRecord,
          { status },
          recent,
          async (updated) => {
            try {
              await this.pg.query('UPDATE hosts SET estado_actual=$1, estado_changed_at=NOW() WHERE id=$2', [updated.estado_actual, updated.id]);
            } catch (e) {
              Logger.error('Error actualizando estado host', updated.id, e.message);
              logError('scheduler.error_actualizando_estado_host', 'Error actualizando estado del host', 'monitoreo', {
                hostId: updated.id,
                estado: updated.estado_actual
              }, e);
            }
          },
          async ({ host, prev, next }) => {
            // Callback para manejar cambios de estado - crear/cerrar incidentes y notificar
            await this.handleStateChange(host, prev, next);
          }
        );
      }
    } catch (e) {
      Logger.error('Error evaluando estado host', e.message);
      logError('scheduler.error_evaluando_estado_host', 'Error evaluando estado de host', 'monitoreo', {
        hostId
      }, e);
    }
  }

  /**
   * Maneja cambios de estado: crea/cierra incidentes y envía notificaciones
   */
  async handleStateChange(host, prevState, newState) {
    try {
      // Si pasó a DOWN, crear incidente
      if (newState === EstadosHost.CAIDO && prevState !== EstadosHost.CAIDO) {
        const incident = await this.createIncident(host, SeveridadesIncidente.CRITICA);

        // Enviar notificación
        await notificationService.notifyStateChange({
          host,
          prevState,
          newState,
          incident
        });
      }
      // Si pasó a DEGRADED, crear incidente warning
      else if (newState === EstadosHost.DEGRADADO && prevState !== EstadosHost.DEGRADADO) {
        const incident = await this.createIncident(host, SeveridadesIncidente.ADVERTENCIA);

        await notificationService.notifyStateChange({
          host,
          prevState,
          newState,
          incident
        });
      }
      // Si se recuperó (UP), cerrar incidentes abiertos
      else if (
        newState === EstadosHost.ARRIBA
        && (prevState === EstadosHost.CAIDO || prevState === EstadosHost.DEGRADADO)
      ) {
        await this.closeIncidents(host.id);

        await notificationService.notifyStateChange({
          host,
          prevState,
          newState
        });
      }
    } catch (e) {
      Logger.error('Error manejando cambio de estado:', e.message);
      logError('scheduler.error_cambio_estado', 'Error manejando cambio de estado de host', 'monitoreo', {
        hostId: host.id,
        estadoAnterior: prevState,
        estadoNuevo: newState
      }, e);
    }
  }

  /**
   * Crea un incidente para un host
   */
  async createIncident(host, severity) {
    try {
      const { rows } = await this.pg.query(`
        INSERT INTO incidents (host_id, severity, state, summary, opened_at)
        VALUES ($1, $2, 'open', $3, NOW())
        RETURNING *
      `, [
        host.id,
        severity,
        `${host.name} (${host.ip}) - ${severity === 'critical' ? 'Host caído' : 'Host degradado'}`
      ]);

      Logger.warn(`⚠️ Incidente creado: ${host.name} - Severidad: ${severity}`);
      logAdvertencia('incidente.creado', 'Incidente creado para host monitoreado', 'monitoreo', {
        hostId: host.id,
        hostNombre: host.name,
        severidad: severity
      });
      return rows[0];
    } catch (e) {
      Logger.error('Error creando incidente:', e.message);
      logError('incidente.error_creacion', 'Error creando incidente', 'monitoreo', {
        hostId: host.id,
        severidad: severity
      }, e);
      return null;
    }
  }

  /**
   * Cierra incidentes abiertos de un host
   */
  async closeIncidents(hostId) {
    try {
      const { rowCount } = await this.pg.query(`
        UPDATE incidents 
        SET state = 'resolved', closed_at = NOW()
        WHERE host_id = $1 AND state = 'open'
      `, [hostId]);

      if (rowCount > 0) {
        Logger.success(`✅ ${rowCount} incidente(s) cerrado(s) para host ${hostId}`);
        logInfo('incidente.cierre_masivo', 'Incidentes abiertos cerrados por recuperacion del host', 'monitoreo', {
          hostId,
          totalCerrados: rowCount
        });
      }
    } catch (e) {
      Logger.error('Error cerrando incidentes:', e.message);
      logError('incidente.error_cierre', 'Error cerrando incidentes', 'monitoreo', { hostId }, e);
    }
  }

  /**
   * Ejecuta un check específico inmediatamente (llamado desde API)
   * @param {number} checkId - ID del check a ejecutar
   * @returns {object} Resultado de la ejecución
   */
  async executeCheckNow(checkId) {
    if (!this.pg) {
      throw new Error('Scheduler no inicializado');
    }

    // Obtener el check con info del host
    const { rows } = await this.pg.query(`
      SELECT c.id, c.kind, c.config, c.frequency_sec, c.timeout_ms, c.host_id, 
             host(h.ip)::text as host_ip, h.name as host_name
      FROM checks c 
      JOIN hosts h ON c.host_id = h.id 
      WHERE c.id = $1 AND c.enabled = true
    `, [checkId]);

    if (rows.length === 0) {
      throw new Error('Check no encontrado o deshabilitado');
    }

    const check = {
      ...rows[0],
      config: rows[0].kind === 'icmp'
        ? { ...rows[0].config, ip: rows[0].host_ip, host: rows[0].host_ip }
        : rows[0].config
    };

    Logger.info(`▶️ Ejecutando check ${checkId} (${check.kind}) para ${check.host_name} inmediatamente...`);

    // Ejecutar el check
    let result;
    try {
      result = await checkExecutorService.execute({
        kind: check.kind,
        config: check.config,
        timeoutMs: check.timeout_ms
      });
    } catch (e) {
      result = { status: 'fail', error: e.message };
    }

    // Persistir resultado (esto también evalúa el estado del host)
    await this.persistRun(check, result);

    // Actualizar cache para evitar doble ejecución
    this.cache.set(checkId, { lastRun: Date.now() });

    return {
      checkId,
      hostName: check.host_name,
      hostIp: check.host_ip,
      kind: check.kind,
      status: result.status,
      latency: result.latency,
      error: result.error
    };
  }
}

export default new Scheduler();
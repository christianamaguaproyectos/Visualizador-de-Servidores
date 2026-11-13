import monitoringConfig from '../config/monitoringConfig.js';
import Logger from '../../utils/logger.js';
import { withMonitoringClient } from '../config/monitoringDb.js';
import checkExecutorService from '../services/checkExecutorService.js';
import stateEvaluatorService from '../services/stateEvaluatorService.js';
import notificationService from '../services/notificationService.js';
import { EstadosChequeo, EstadosHost, SeveridadesIncidente } from '../domain/glosario/terminosDominio.js';
import { logAdvertencia, logError, logInfo } from '../../utils/structuredLogger.js';

// Scheduler: lee los checks desde Postgres y los ejecuta según frequency_sec.
//
// Cambios de la Fase 3 (ARCH-HIGH-09 / MON-MED-01 / MON-MED-02):
//  - Usa el POOL compartido (withMonitoringClient) en vez de un pg.Client único sin
//    reconexión ni manejador de 'error' (si Postgres cortaba la conexión, caía el proceso).
//  - Bandera tickRunning: un tick nunca se solapa con el anterior.
//  - Concurrencia controlada: hasta CONCURRENCIA hosts en paralelo; los checks de un
//    mismo host se ejecutan en orden para no pisar la evaluación de su estado.
//  - Respeta el modo MAINTENANCE y las ventanas activas de maintenance_windows.
//  - No abre incidentes duplicados; al recuperarse cierra los 'open' y los 'ack'.

/** Máximo de hosts que se chequean en paralelo por tick */
const CONCURRENCIA = 10;

/** Estados de incidente que se consideran "activos" */
const ESTADOS_INCIDENTE_ACTIVOS = ['open', 'ack'];

/**
 * Ejecuta fn sobre cada elemento con un límite de tareas en paralelo
 * @param {Array} items
 * @param {number} limite
 * @param {Function} fn
 */
async function ejecutarConConcurrencia(items, limite, fn) {
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (siguiente < items.length) {
      const item = items[siguiente++];
      await fn(item);
    }
  });
  await Promise.all(trabajadores);
}

/** Atajo: ejecuta una consulta con una conexión del pool */
function query(sql, params) {
  return withMonitoringClient((client) => client.query(sql, params));
}

class Scheduler {
  constructor() {
    this.intervalMs = 5000; // cada 5s revisa si toca ejecutar algo
    this.timer = null;
    this.iniciado = false;
    this.tickRunning = false;
    this.tickActual = null; // promesa del tick en curso (para el apagado limpio)
    this.cache = new Map(); // id -> { lastRun }
    this.checks = [];
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
      // Verifica la conexión usando el pool (que reconecta solo si Postgres se reinicia)
      await query('SELECT 1');
      Logger.success('Scheduler conectado a Postgres');
      logInfo('scheduler.conectado', 'Scheduler conectado a la base de datos de monitoreo', 'monitoreo');
    } catch (e) {
      Logger.error('No se pudo conectar a Postgres para scheduler:', e.message);
      logError('scheduler.error_conexion', 'No se pudo conectar a Postgres para scheduler', 'monitoreo', {}, e);
      return;
    }
    this.iniciado = true;
    await this.reloadChecks();
    // Tick inmediato para no esperar intervalMs
    await this.tick();
    this.timer = setInterval(() => { this.tick(); }, this.intervalMs);
    Logger.success('Scheduler monitoreo iniciado (ejecución directa)');
    logInfo('scheduler.iniciado', 'Scheduler de monitoreo iniciado en modo ejecucion directa', 'monitoreo', {
      intervaloMs: this.intervalMs,
      recargaMs: this.reloadIntervalMs,
      concurrencia: CONCURRENCIA
    });
  }

  /**
   * Detiene el scheduler y espera a que termine el tick en curso (apagado limpio)
   */
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.iniciado = false;
    if (this.tickActual) {
      await this.tickActual.catch(() => { });
    }
    Logger.info('Scheduler de monitoreo detenido');
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
      // host(ip) devuelve la IP sin la máscara CIDR
      const { rows } = await query(`
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

  tick() {
    // Guarda: si el tick anterior sigue corriendo, no se inicia otro encima
    if (!this.iniciado || this.tickRunning) return this.tickActual;
    this.tickRunning = true;
    this.tickActual = this._ejecutarTick()
      .catch((e) => {
        Logger.error('Error en tick del scheduler:', e.message);
        logError('scheduler.error_tick', 'Error en tick del scheduler', 'monitoreo', {}, e);
      })
      .finally(() => {
        this.tickRunning = false;
        this.tickActual = null;
      });
    return this.tickActual;
  }

  async _ejecutarTick() {
    const now = Date.now();
    if (now - this.lastReload > this.reloadIntervalMs) {
      await this.reloadChecks();
    }
    if (!this.checks || this.checks.length === 0) return;

    // Checks vencidos, agrupados por host
    const porHost = new Map();
    for (const c of this.checks) {
      const meta = this.cache.get(c.id) || { lastRun: 0 };
      if (now >= meta.lastRun + c.frequency_sec * 1000) {
        meta.lastRun = now;
        this.cache.set(c.id, meta);
        if (!porHost.has(c.host_id)) porHost.set(c.host_id, []);
        porHost.get(c.host_id).push(c);
      }
    }

    // Hosts en paralelo (límite CONCURRENCIA); checks del mismo host en orden
    await ejecutarConConcurrencia([...porHost.values()], CONCURRENCIA, async (checksDelHost) => {
      for (const c of checksDelHost) {
        await this.executeAndPersist(c);
      }
    });
  }

  async executeAndPersist(c) {
    try {
      // timeoutMs del check (antes no llegaba al ejecutor en TCP/HTTP)
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
    const hostId = c.host_id;
    if (!hostId) return;

    const time = new Date();
    const status = result.status || EstadosChequeo.FALLA;
    const latency = result.latency || null;
    const code = result.code || null;
    const error = result.error || null;
    const sample = result.sample ? JSON.stringify(result.sample) : null;
    try {
      await query(
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
      const { rows: hostRows } = await query(`
        SELECT h.id, h.name, h.estado_actual, host(h.ip)::text AS ip, h.type, h.rack,
               EXISTS (
                 SELECT 1 FROM maintenance_windows mw
                 WHERE mw.starts_at <= NOW() AND mw.ends_at > NOW()
                   AND (
                     mw.scope_type = 'all'
                     OR (mw.scope_type = 'host' AND h.id::text = ANY(mw.target_ids))
                     OR (mw.scope_type = 'group' AND mw.target_ids && h.group_tags)
                   )
               ) AS en_mantenimiento
        FROM hosts h WHERE h.id = $1
      `, [hostId]);
      if (!hostRows.length) return;

      const hostRecord = hostRows[0];

      // MANTENIMIENTO: mientras haya una ventana activa, el estado NO se recalcula
      // (antes se sobrescribía con UP/DOWN en el siguiente tick y se disparaban alertas)
      if (hostRecord.en_mantenimiento) {
        if (hostRecord.estado_actual !== EstadosHost.MANTENIMIENTO) {
          await query('UPDATE hosts SET estado_actual=$1, estado_changed_at=NOW() WHERE id=$2', [EstadosHost.MANTENIMIENTO, hostId]);
        }
        return;
      }

      const { rows: recent } = await query(
        'SELECT status FROM check_runs WHERE host_id=$1 ORDER BY time DESC LIMIT 5',
        [hostId]
      );
      delete hostRecord.en_mantenimiento;

      await stateEvaluatorService.evaluateAndTransition(
        hostRecord,
        { status },
        recent,
        async (updated) => {
          try {
            await query('UPDATE hosts SET estado_actual=$1, estado_changed_at=NOW() WHERE id=$2', [updated.estado_actual, updated.id]);
          } catch (e) {
            Logger.error('Error actualizando estado host', updated.id, e.message);
            logError('scheduler.error_actualizando_estado_host', 'Error actualizando estado del host', 'monitoreo', {
              hostId: updated.id,
              estado: updated.estado_actual
            }, e);
          }
        },
        async ({ host, prev, next }) => {
          // Cambios de estado: crear/cerrar incidentes y notificar
          await this.handleStateChange(host, prev, next);
        }
      );
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
      // Pasó a DOWN o DEGRADED: abrir incidente (o reutilizar el que ya esté activo)
      if (
        (newState === EstadosHost.CAIDO && prevState !== EstadosHost.CAIDO)
        || (newState === EstadosHost.DEGRADADO && prevState !== EstadosHost.DEGRADADO)
      ) {
        const severidad = newState === EstadosHost.CAIDO ? SeveridadesIncidente.CRITICA : SeveridadesIncidente.ADVERTENCIA;
        const incident = await this.abrirOReutilizarIncidente(host, severidad);

        await notificationService.notifyStateChange({ host, prevState, newState, incident });
      }
      // Se recuperó (UP): cerrar incidentes activos ('open' y 'ack')
      else if (
        newState === EstadosHost.ARRIBA
        && (prevState === EstadosHost.CAIDO || prevState === EstadosHost.DEGRADADO)
      ) {
        await this.closeIncidents(host.id);

        await notificationService.notifyStateChange({ host, prevState, newState });
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
   * Si el host ya tiene un incidente activo (open/ack) no se crea otro:
   * se reutiliza y, si el nuevo estado es más grave (DEGRADED -> DOWN), se escala a 'critical'.
   * (Antes cada transición DOWN <-> DEGRADED abría un incidente duplicado.)
   */
  async abrirOReutilizarIncidente(host, severity) {
    try {
      return await withMonitoringClient(async (client) => {
        await client.query('BEGIN');
        try {
          const { rows: activos } = await client.query(`
            SELECT * FROM incidents
            WHERE host_id = $1 AND state = ANY($2)
            ORDER BY opened_at DESC
            LIMIT 1
            FOR UPDATE
          `, [host.id, ESTADOS_INCIDENTE_ACTIVOS]);

          let incidente;
          if (activos.length) {
            incidente = activos[0];
            if (severity === SeveridadesIncidente.CRITICA && incidente.severity !== SeveridadesIncidente.CRITICA) {
              const { rows } = await client.query(
                `UPDATE incidents SET severity = $1, summary = $2 WHERE id = $3 RETURNING *`,
                [severity, `${host.name} (${host.ip}) - Host caído`, incidente.id]
              );
              incidente = rows[0];
              Logger.warn(`⚠️ Incidente ${incidente.id} escalado a crítico: ${host.name}`);
            }
          } else {
            const { rows } = await client.query(`
              INSERT INTO incidents (host_id, severity, state, summary, opened_at)
              VALUES ($1, $2, 'open', $3, NOW())
              RETURNING *
            `, [
              host.id,
              severity,
              `${host.name} (${host.ip}) - ${severity === SeveridadesIncidente.CRITICA ? 'Host caído' : 'Host degradado'}`
            ]);
            incidente = rows[0];
            Logger.warn(`⚠️ Incidente creado: ${host.name} - Severidad: ${severity}`);
            logAdvertencia('incidente.creado', 'Incidente creado para host monitoreado', 'monitoreo', {
              hostId: host.id,
              hostNombre: host.name,
              severidad: severity
            });
          }

          await client.query('COMMIT');
          return incidente;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => { });
          throw e;
        }
      });
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
   * Cierra los incidentes ACTIVOS ('open' y 'ack') de un host al recuperarse
   * (antes solo cerraba los 'open' y los reconocidos quedaban abiertos para siempre)
   */
  async closeIncidents(hostId) {
    try {
      const { rowCount } = await query(`
        UPDATE incidents
        SET state = 'resolved', closed_at = NOW()
        WHERE host_id = $1 AND state = ANY($2)
      `, [hostId, ESTADOS_INCIDENTE_ACTIVOS]);

      if (rowCount > 0) {
        Logger.success(`✅ ${rowCount} incidente(s) cerrado(s) para host ${hostId}`);
        logInfo('incidente.cierre_masivo', 'Incidentes activos cerrados por recuperacion del host', 'monitoreo', {
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
    if (!this.iniciado) {
      throw new Error('Scheduler no inicializado');
    }

    const { rows } = await query(`
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

    let result;
    try {
      result = await checkExecutorService.execute({
        kind: check.kind,
        config: check.config,
        timeoutMs: check.timeout_ms
      });
    } catch (e) {
      result = { status: EstadosChequeo.FALLA, error: e.message };
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

import Logger from '../../utils/logger.js';

// Reglas simplificadas MVP.
// Se espera que el worker que ejecute un check llame a evaluateState pasando historial breve.

class StateEvaluatorService {
  deriveState({ recentRuns }) {
    // recentRuns: array de { status } ordenados del más nuevo al más viejo
    const slice = recentRuns.slice(0, 5);
    const fails = slice.filter(r => r.status === 'fail' || r.status === 'timeout').length;
    const degraded = slice.filter(r => r.status === 'degraded').length;

    if (fails >= 2) return 'DOWN';
    if (degraded >= 2) return 'DEGRADED';
    if (slice.length === 0) return 'UNKNOWN';
    return 'UP';
  }

  /**
   * Evalúa el estado y, si cambió, ESPERA (await) a que se guarde y a que se
   * procesen incidentes/notificaciones. Antes los callbacks async no se esperaban:
   * los errores quedaban sin manejar y el siguiente tick leía un estado viejo.
   */
  async evaluateAndTransition(hostRecord, newRun, recentRuns, persistCallback, incidentCallback) {
    const newState = this.deriveState({ recentRuns });
    if (newState !== hostRecord.estado_actual) {
      const prev = hostRecord.estado_actual;
      hostRecord.estado_actual = newState;
      hostRecord.estado_changed_at = new Date().toISOString();
      Logger.info(`Host ${hostRecord.name} cambia de ${prev} -> ${newState}`);
      if (persistCallback) await persistCallback(hostRecord);
      if (incidentCallback) await incidentCallback({ host: hostRecord, prev, next: newState });
    }
  }
}

export default new StateEvaluatorService();
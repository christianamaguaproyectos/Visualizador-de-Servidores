import Logger from '../../utils/logger.js';

// Stub de servicio de incidentes (apertura/cierre) para MVP.
class IncidentService {
  constructor() {
    this.activeIncidents = new Map(); // hostId -> incident
  }

  openIfNeeded({ host, next }) {
    if (next === 'DOWN' || next === 'DEGRADED') {
      if (!this.activeIncidents.has(host.id)) {
        const incident = {
          id: `mem-${Date.now()}-${host.id}`,
            host_id: host.id,
          severity: next === 'DOWN' ? 'critical' : 'warning',
          state: 'open',
          opened_at: new Date().toISOString(),
          summary: `Host ${host.name} en estado ${next}`
        };
        this.activeIncidents.set(host.id, incident);
        Logger.warn(`Incidente abierto para host ${host.name}: ${incident.summary}`);
        return incident;
      }
    }
    return null;
  }

  closeIfRecovered({ host, next }) {
    if (next === 'UP' && this.activeIncidents.has(host.id)) {
      const inc = this.activeIncidents.get(host.id);
      inc.state = 'resolved';
      inc.closed_at = new Date().toISOString();
      Logger.success(`Incidente resuelto para host ${host.name}`);
      this.activeIncidents.delete(host.id);
      return inc;
    }
    return null;
  }

  handleTransition({ host, prev, next }) {
    if (prev !== next) {
      if (next === 'DOWN' || next === 'DEGRADED') {
        this.openIfNeeded({ host, next });
      } else if (next === 'UP') {
        this.closeIfRecovered({ host, next });
      }
    }
  }
}

export default new IncidentService();
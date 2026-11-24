/**
 * Modelo de la vista en tiempo real de Monitoreo: agrupa los hosts por rack (racks físicos del
 * inventario y, para las máquinas virtuales, su host o clúster) y calcula el estado agregado.
 * Funciones puras, sin DOM ni imports (se prueban con node --test).
 */

export const ESTADOS = ['DOWN', 'DEGRADED', 'UNKNOWN', 'MAINTENANCE', 'UP'];
const PRIORIDAD = { DOWN: 0, DEGRADED: 1, UNKNOWN: 2, MAINTENANCE: 3, UP: 4 };
export const SIN_RACK = 'Sin rack asignado';

export function normalizarEstado(estado) {
  const e = String(estado || '').toUpperCase();
  return Object.hasOwn(PRIORIDAD, e) ? e : 'UNKNOWN';
}

/** Estado del rack: el peor de sus servidores, salvo que todos estén sin datos o en mantenimiento */
export function estadoAgregado(conteo) {
  if (conteo.DOWN) return 'DOWN';
  if (conteo.DEGRADED) return 'DEGRADED';
  if (conteo.UP) return 'UP';
  if (conteo.MAINTENANCE) return 'MAINTENANCE';
  return 'UNKNOWN';
}

export function compararHosts(a, b) {
  const pa = PRIORIDAD[normalizarEstado(a.estado_actual)];
  const pb = PRIORIDAD[normalizarEstado(b.estado_actual)];
  if (pa !== pb) return pa - pb;
  if (!!a.critical !== !!b.critical) return a.critical ? -1 : 1;
  return String(a.name || '').localeCompare(String(b.name || ''), 'es', { numeric: true });
}

/**
 * @param {Array} hosts  filas de /api/monitoring/telemetry/overview
 * @returns {Array<{nombre, tipo, hosts, conteo, estado, total, conProblemas, incidentes}>}
 *   Racks físicos primero y luego hosts/clústeres virtuales, por nombre.
 */
export function agruparPorRack(hosts = []) {
  const mapa = new Map();
  for (const h of hosts) {
    const nombre = String(h.rack || '').trim() || SIN_RACK;
    if (!mapa.has(nombre)) mapa.set(nombre, { nombre, fisicos: 0, virtuales: 0, hosts: [] });
    const grupo = mapa.get(nombre);
    grupo.hosts.push(h);
    if (h.type === 'virtual') grupo.virtuales += 1; else grupo.fisicos += 1;
  }
  const racks = [...mapa.values()].map((g) => {
    const conteo = { UP: 0, DOWN: 0, DEGRADED: 0, MAINTENANCE: 0, UNKNOWN: 0 };
    let incidentes = 0;
    for (const h of g.hosts) {
      conteo[normalizarEstado(h.estado_actual)] += 1;
      incidentes += Number(h.open_incidents) || 0;
    }
    return {
      nombre: g.nombre,
      tipo: g.nombre === SIN_RACK ? 'otro' : (g.fisicos >= g.virtuales ? 'fisico' : 'virtual'),
      hosts: g.hosts.slice().sort(compararHosts),
      conteo,
      estado: estadoAgregado(conteo),
      total: g.hosts.length,
      conProblemas: conteo.DOWN + conteo.DEGRADED,
      incidentes
    };
  });
  const orden = { fisico: 0, virtual: 1, otro: 2 };
  return racks.sort((a, b) => (orden[a.tipo] - orden[b.tipo]) ||
    a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
}

/** Totales por estado para los indicadores superiores */
export function resumenEstados(hosts = []) {
  const r = { UP: 0, DOWN: 0, DEGRADED: 0, MAINTENANCE: 0, UNKNOWN: 0, total: hosts.length, incidentes: 0 };
  for (const h of hosts) {
    r[normalizarEstado(h.estado_actual)] += 1;
    r.incidentes += Number(h.open_incidents) || 0;
  }
  return r;
}

/** Filtra hosts por texto (nombre, IP o rack) y, opcionalmente, solo los que tienen problemas */
export function filtrarHosts(hosts = [], { texto = '', soloProblemas = false } = {}) {
  const t = String(texto).toLowerCase().trim();
  return hosts.filter((h) => {
    if (soloProblemas && !['DOWN', 'DEGRADED'].includes(normalizarEstado(h.estado_actual)) && !(Number(h.open_incidents) > 0)) return false;
    if (!t) return true;
    return [h.name, h.ip, h.rack].some((v) => String(v || '').toLowerCase().includes(t));
  });
}

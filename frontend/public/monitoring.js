/**
 * monitoring.js - Dashboard de Monitoreo de Servidores
 */

import {
  badgeEstadoHost,
  badgeEstadoIncidente,
  badgeSeveridadIncidente,
  formatearTextoSeguro
} from '/js/dominios/monitoreo/presentacionEstado.js';
import { confirmAction } from '/js/dominios/ui-system/modalConfirm.js';
import { trackUIEvent } from '/js/dominios/ui-system/uxTelemetry.js';
import { apiJson } from '/js/dominios/ui-system/apiFetch.js';
import { escapeAttr } from '/js/dominios/ui-system/seguridadHtml.js';
import { agruparPorRack, filtrarHosts, resumenEstados } from '/js/dominios/monitoreo/modeloRacks.js';
import { tarjetaRack, detalleRack } from '/js/dominios/monitoreo/vistaRacks.js';
import { cabeceraPanel, cuerpoPanel, esqueletoPanel } from '/js/dominios/monitoreo/panelServidor.js';


// Estado global
const state = {
  dashboard: null,
  hosts: [],
  incidents: [],
  checks: [],
  currentTab: 'overview',
  refreshInterval: null,
  // Vista en tiempo real
  vivo: null,
  filtroVivo: { texto: '', soloProblemas: false },
  rackAbierto: null,
  ultimaActualizacion: 0,
  // Panel de servidor abierto
  panel: { hostId: null, minutos: 60, host: null, pidiendo: false }
};

const INTERVALO_VIVO_MS = 15000;
const ESPERA_API_MS = 10000;

/** Muestra un error claro con botón Reintentar (nunca deja un "cargando" infinito) */
function mostrarError(container, mensaje, accion) {
  if (!container) return;
  container.setAttribute('aria-busy', 'false');
  container.innerHTML = `
    <div class="estado-error" role="alert">
      <span>${fmt(mensaje)}</span>
      ${accion ? `<button type="button" class="btn btn-secondary btn-sm" data-reintentar="${escapeAttr(accion)}">Reintentar</button>` : ''}
    </div>`;
}

function mensajeDeError(err, porDefecto = 'No se pudieron cargar los datos.') {
  if (err?.status === 404) return 'El monitoreo no está habilitado en este servidor (variable MONITORING_ENABLED=1).';
  if (err?.tiempoAgotado) return 'El servidor tardó demasiado en responder.';
  if (err?.status === 403) return 'Su usuario no tiene permiso para esta sección.';
  if (err instanceof TypeError) return 'Sin conexión con el servidor.';
  return err?.message || porDefecto;
}

const obtenerJson = (url) => apiJson(url, { timeoutMs: ESPERA_API_MS });

/** POST/PUT/DELETE con JSON; lanza Error con el mensaje del servidor si falla */
async function enviarJson(url, method = 'POST', body) {
  return apiJson(url, {
    method,
    timeoutMs: 30000,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

function abrirModal(id) {
  document.getElementById(id)?.classList.add('show');
}

function cerrarModal(modal) {
  if (!modal) return;
  modal.classList.remove('show');
  if (modal.id === 'hostModal') detenerPanel();
}

// Helpers
function fmt(val) {
  return formatearTextoSeguro(val);
}

/** Deja solo letras, números, guion y guion bajo para usar un valor como clase CSS */
function claseSegura(val) {
  return String(val ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'hace unos segundos';
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)}h`;
  return `hace ${Math.floor(seconds / 86400)} días`;
}

const statusBadge = badgeEstadoHost;
const severityBadge = badgeSeveridadIncidente;
const incidentStateBadge = badgeEstadoIncidente;

// Toast: se usa SIEMPRE el toast global de /toast.js (texto seguro + tipos en lista blanca)
function showToast(message, type = 'info', duration) {
  if (typeof window.showToast === 'function') {
    return window.showToast(message, type, duration);
  }
  console.log(message);
  return null;
}

async function confirmActionTracked(eventName, options, data = {}) {
  const confirmed = await confirmAction(options);
  trackUIEvent('monitoring.confirm', {
    eventName,
    confirmed,
    ...data
  });
  return confirmed;
}

// API Calls
async function fetchDashboard() {
  return obtenerJson('/api/monitoring/dashboard');
}

async function fetchHosts(filters = {}) {
    const params = new URLSearchParams();
    if (filters.estado) params.append('estado', filters.estado);
    if (filters.type) params.append('type', filters.type);
    if (filters.rack) params.append('rack', filters.rack);
    if (filters.critical) params.append('critical', 'true');
    if (filters.search) params.append('search', filters.search);

    params.append('limit', '500');
    return obtenerJson(`/api/monitoring/hosts?${params}`);
}

function getHostFiltersFromUI() {
  return {
    estado: document.getElementById('filterEstado')?.value || '',
    type: document.getElementById('filterType')?.value || '',
    rack: document.getElementById('filterRack')?.value || '',
    critical: document.getElementById('filterCritical')?.checked || false,
    search: document.getElementById('searchHosts')?.value || ''
  };
}

function applyHostFiltersLocal(hosts, filters) {
  const term = (filters.search || '').toLowerCase().trim();

  return (hosts || []).filter((h) => {
    if (filters.estado && h.estado_actual !== filters.estado) return false;
    if (filters.type && (h.type || '').toLowerCase() !== filters.type.toLowerCase()) return false;
    if (filters.rack && (h.rack || '') !== filters.rack) return false;
    if (filters.critical && !h.critical) return false;

    if (term) {
      const fields = [h.name, h.ip, h.rack, h.type].map(v => (v || '').toLowerCase()).join(' ');
      if (!fields.includes(term)) return false;
    }

    return true;
  });
}

function updateRackFilterOptions(hosts) {
  const select = document.getElementById('filterRack');
  if (!select) return;

  const current = select.value;
  const rackValues = Array.from(new Set((hosts || []).map(h => (h.rack || '').trim()).filter(Boolean))).sort();

  select.innerHTML = '<option value="">Todos los racks/hosts</option>' +
    rackValues.map(r => `<option value="${fmt(r)}">${fmt(r)}</option>`).join('');

  if (current && rackValues.includes(current)) {
    select.value = current;
  }
}

function renderHostFilterChips(filters, visibleCount, totalCount) {
  const container = document.getElementById('hostFilterChips');
  if (!container) return;

  const chips = [];
  if (filters.search) chips.push({ key: 'search', label: `Busqueda: ${filters.search}` });
  if (filters.estado) chips.push({ key: 'estado', label: `Estado: ${filters.estado}` });
  if (filters.type) chips.push({ key: 'type', label: `Tipo: ${filters.type}` });
  if (filters.rack) chips.push({ key: 'rack', label: `Rack/Host: ${filters.rack}` });
  if (filters.critical) chips.push({ key: 'critical', label: 'Solo criticos' });

  if (chips.length === 0) {
    container.innerHTML = '';
    container.classList.remove('active');
    return;
  }

  container.classList.add('active');
  container.innerHTML = chips.map(chip => `
    <button class="filter-chip" data-filter-key="${chip.key}" title="Quitar filtro">
      ${fmt(chip.label)}
      <span aria-hidden="true">✕</span>
    </button>
  `).join('') + `<span class="filter-chip filter-chip--count">${visibleCount}/${totalCount} hosts</span>`;
}

function clearHostFilters() {
  const search = document.getElementById('searchHosts');
  const estado = document.getElementById('filterEstado');
  const type = document.getElementById('filterType');
  const rack = document.getElementById('filterRack');
  const critical = document.getElementById('filterCritical');

  if (search) search.value = '';
  if (estado) estado.value = '';
  if (type) type.value = '';
  if (rack) rack.value = '';
  if (critical) critical.checked = false;

  trackUIEvent('monitoring.host_filters.clear');
  loadHosts();
}

async function fetchHostDetail(id) {
  try {
    return await obtenerJson(`/api/monitoring/hosts/${encodeURIComponent(id)}`);
  } catch (err) {
    console.error('Error fetchHostDetail:', err);
    return null;
  }
}

async function fetchHostHistory(id, from, to) {
  try {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    return await obtenerJson(`/api/monitoring/hosts/${encodeURIComponent(id)}/history?${params}`);
  } catch (err) {
    console.error('Error fetchHostHistory:', err);
    return null;
  }
}

async function fetchIncidents(filters = {}) {
  const params = new URLSearchParams();
  if (filters.state) params.append('state', filters.state);
  if (filters.severity) params.append('severity', filters.severity);
  return obtenerJson(`/api/monitoring/incidents?${params}`);
}

async function fetchIncidentDetail(id) {
  try {
    return await obtenerJson(`/api/monitoring/incidents/${encodeURIComponent(id)}`);
  } catch (err) {
    console.error('Error fetchIncidentDetail:', err);
    return null;
  }
}

async function fetchChecks() {
  return obtenerJson('/api/monitoring/checks');
}

// Render Functions
function updateKPIs(data) {
  if (!data) return;

  const { summary, recentMetrics, activeIncidents } = data;

  document.getElementById('kpiUp').textContent = summary?.UP ?? 0;
  document.getElementById('kpiDown').textContent = summary?.DOWN ?? 0;
  document.getElementById('kpiDegraded').textContent = summary?.DEGRADED ?? 0;
  document.getElementById('kpiMaintenance').textContent = summary?.MAINTENANCE ?? 0;
  document.getElementById('kpiIncidents').textContent = activeIncidents?.length ?? 0;
  document.getElementById('kpiLatency').textContent = recentMetrics?.avg_latency
    ? `${recentMetrics.avg_latency}ms`
    : '—';

}

function renderActiveIncidents(incidents) {
  const container = document.getElementById('activeIncidentsList');

  if (!incidents || incidents.length === 0) {
    container.innerHTML = '<div class="empty-state">✅ No hay incidentes activos</div>';
    return;
  }

  container.innerHTML = incidents.map(inc => `
    <div class="incident-item" role="button" tabindex="0" aria-label="Ver incidente de ${fmt(inc.host_name)}" data-incident-id="${encodeURIComponent(String(inc.id ?? ''))}">
      <div class="incident-header">
        ${severityBadge(inc.severity)}
        <span class="incident-time">${timeAgo(inc.opened_at)}</span>
      </div>
      <div class="incident-host">
        <strong>${fmt(inc.host_name)}</strong> 
        <span class="muted">(${fmt(inc.host_ip)})</span>
      </div>
      <div class="incident-summary">${fmt(inc.summary)}</div>
    </div>
  `).join('');
}

function renderCriticalDown(hosts) {
  const container = document.getElementById('criticalDownList');

  if (!hosts || hosts.length === 0) {
    container.innerHTML = '<div class="empty-state">✅ No hay hosts críticos caídos</div>';
    return;
  }

  container.innerHTML = hosts.map(h => `
    <div class="host-item critical" role="button" tabindex="0" aria-label="Ver host ${fmt(h.name)}" data-host-id="${encodeURIComponent(String(h.id ?? ''))}">
      <div class="host-status">${statusBadge(h.estado_actual)}</div>
      <div class="host-info">
        <div class="host-name">${fmt(h.name)}</div>
        <div class="host-ip muted">${fmt(h.ip)}</div>
      </div>
      <div class="host-time muted">${timeAgo(h.estado_changed_at)}</div>
    </div>
  `).join('');
}

function renderRecentMetrics(metrics) {
  const container = document.getElementById('recentMetrics');

  if (!metrics) {
    container.innerHTML = '<div class="empty-state">Sin datos</div>';
    return;
  }

  const total = parseInt(metrics.ok_count || 0) + parseInt(metrics.fail_count || 0) + parseInt(metrics.timeout_count || 0);
  const successRate = total > 0 ? Math.round((parseInt(metrics.ok_count || 0) / total) * 100) : 0;

  container.innerHTML = `
    <div class="metrics-grid">
      <div class="metric">
        <div class="metric-value">${total}</div>
        <div class="metric-label">Total Checks</div>
      </div>
      <div class="metric">
        <div class="metric-value text-success">${metrics.ok_count || 0}</div>
        <div class="metric-label">Exitosos</div>
      </div>
      <div class="metric">
        <div class="metric-value text-danger">${metrics.fail_count || 0}</div>
        <div class="metric-label">Fallidos</div>
      </div>
      <div class="metric">
        <div class="metric-value text-warning">${metrics.timeout_count || 0}</div>
        <div class="metric-label">Timeout</div>
      </div>
    </div>
    <div class="success-rate">
      <div class="success-rate-bar">
        <div class="success-rate-fill" data-ancho-pct="${successRate}"></div>
      </div>
      <div class="success-rate-label">${successRate}% tasa de éxito</div>
    </div>
  `;
  aplicarDimensionesPct(container);
}

function renderTrendChart(hourlyTrend) {
  const container = document.getElementById('trendChart');

  if (!hourlyTrend || hourlyTrend.length === 0) {
    container.innerHTML = '<div class="empty-state">Sin datos de tendencia</div>';
    return;
  }

  // Simple bar chart using CSS
  const maxVal = Math.max(...hourlyTrend.map(h => h.ok + h.fail), 1);

  const bars = hourlyTrend.slice(-12).map(h => {
    const total = h.ok + h.fail;
    const okHeight = (h.ok / maxVal) * 100;
    const failHeight = (h.fail / maxVal) * 100;
    const hour = new Date(h.hour).getHours();

    return `
      <div class="chart-bar-container">
        <div class="chart-bar">
          <div class="chart-bar-fail" data-alto-pct="${failHeight}"></div>
          <div class="chart-bar-ok" data-alto-pct="${okHeight}"></div>
        </div>
        <div class="chart-label">${hour}h</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="chart-legend">
      <span class="legend-ok">🟢 OK</span>
      <span class="legend-fail">🔴 Fail</span>
    </div>
    <div class="chart-bars">${bars}</div>
  `;
  aplicarDimensionesPct(container);
}

/**
 * Aplica anchos/altos en % desde data-ancho-pct / data-alto-pct.
 * La CSP estricta bloquea style="..." dentro de innerHTML; asignar element.style (CSSOM) sí está
 * permitido. El valor se acota a 0-100 y se valida como número.
 */
function aplicarDimensionesPct(raiz) {
  const pct = (v) => `${Math.min(100, Math.max(0, Number(v) || 0))}%`;
  raiz.querySelectorAll('[data-ancho-pct]').forEach((el) => { el.style.width = pct(el.dataset.anchoPct); });
  raiz.querySelectorAll('[data-alto-pct]').forEach((el) => { el.style.height = pct(el.dataset.altoPct); });
}

function renderHosts(hosts) {
  const container = document.getElementById('hostsGrid');

  if (!hosts || hosts.length === 0) {
    container.innerHTML = '<div class="empty-state">No se encontraron hosts</div>';
    return;
  }

  container.innerHTML = hosts.map(h => `
    <div class="host-card" role="button" tabindex="0" aria-label="Abrir detalle de host ${fmt(h.name)}" data-host-id="${encodeURIComponent(String(h.id ?? ''))}">
      <div class="host-card-header">
        ${statusBadge(h.estado_actual)}
        ${h.critical ? '<span class="badge badge-critical-small">CRÍTICO</span>' : ''}
      </div>
      <div class="host-card-body">
        <h3 class="host-card-name">${fmt(h.name)}</h3>
        <div class="host-card-ip">${fmt(h.ip)}</div>
        <div class="host-card-meta">
          <span>${fmt(h.type)}</span>
          ${h.rack ? `<span>Rack: ${fmt(h.rack)}</span>` : ''}
        </div>
      </div>
      <div class="host-card-footer">
        <div class="footer-stats">
          <span class="muted">${h.active_checks || 0} checks</span>
          ${h.open_incidents > 0 ? `<span class="text-danger">${h.open_incidents} incidentes</span>` : ''}
        </div>
        <button class="btn-icon-delete" data-host-id="${encodeURIComponent(String(h.id ?? ''))}" title="Eliminar host">🗑️</button>
      </div>
    </div>
  `).join('');

  // Add event listeners for delete buttons
  container.querySelectorAll('.btn-icon-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const hostId = decodeURIComponent(btn.dataset.hostId || '');
      const hostName = hosts.find(h => h.id == hostId)?.name || 'este host';

      const confirmed = await confirmActionTracked('delete_host', {
        title: 'Eliminar host',
        message: `¿Seguro que deseas eliminar el host "${hostName}"? Tambien se eliminaran sus checks e historial. Esta accion no se puede deshacer.`,
        confirmText: 'Eliminar host',
        tone: 'danger'
      }, { hostId });
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/monitoring/hosts/${hostId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar host');

        showToast('Host eliminado correctamente', 'success');
        loadHosts(); // Reload list
        loadDashboard(); // Refresh metrics
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function renderIncidents(incidents) {
  const container = document.getElementById('incidentsList');

  if (!incidents || incidents.length === 0) {
    container.innerHTML = '<div class="empty-state">No hay incidentes</div>';
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Estado</th>
          <th>Severidad</th>
          <th>Host</th>
          <th>Resumen</th>
          <th>Abierto</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${incidents.map(inc => `
          <tr data-incident-id="${encodeURIComponent(String(inc.id ?? ''))}">
            <td>${incidentStateBadge(inc.state)}</td>
            <td>${severityBadge(inc.severity)}</td>
            <td>
              <strong>${fmt(inc.host_name)}</strong><br>
              <span class="muted">${fmt(inc.host_ip)}</span>
            </td>
            <td>${fmt(inc.summary)}</td>
            <td>
              ${formatDate(inc.opened_at)}<br>
              <span class="muted">${timeAgo(inc.opened_at)}</span>
            </td>
            <td class="actions">
              ${inc.state === 'open' ? `<button class="btn btn-sm btn-warning" data-action="ack" data-id="${encodeURIComponent(String(inc.id ?? ''))}">ACK</button>` : ''}
              ${inc.state !== 'closed' ? `<button class="btn btn-sm btn-success" data-action="resolve" data-id="${encodeURIComponent(String(inc.id ?? ''))}">Resolver</button>` : ''}
              <button class="btn btn-sm" data-action="view" data-id="${encodeURIComponent(String(inc.id ?? ''))}">Ver</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderChecks(checks) {
  const container = document.getElementById('checksList');

  if (!checks || checks.length === 0) {
    container.innerHTML = '<div class="empty-state">No hay checks configurados</div>';
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Host</th>
          <th>Tipo</th>
          <th>Configuración</th>
          <th>Frecuencia</th>
          <th>Estado Host</th>
          <th>Habilitado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${checks.map(c => `
          <tr>
            <td>${c.id}</td>
            <td>
              <strong>${fmt(c.host_name)}</strong><br>
              <span class="muted">${fmt(c.host_ip)}</span>
            </td>
            <td><span class="badge">${fmt(String(c.kind || '').toUpperCase())}</span></td>
            <td class="config-cell">${formatCheckConfig(c)}</td>
            <td>${c.frequency_sec}s</td>
            <td>${statusBadge(c.host_estado)}</td>
            <td>${c.enabled ? '✅' : '❌'}</td>
            <td class="actions">
              <button class="btn btn-sm" data-action="run-check" data-id="${encodeURIComponent(String(c.id ?? ''))}" title="Ejecutar ahora">▶️</button>
              <button class="btn btn-sm btn-danger" data-action="delete-check" data-id="${encodeURIComponent(String(c.id ?? ''))}" title="Eliminar">🗑️</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function formatCheckConfig(check) {
  const config = check.config || {};
  switch (check.kind) {
    case 'icmp':
      return `Ping a ${fmt(config.ip || config.host || 'host')}`;
    case 'tcp':
      return `Puerto ${fmt(config.port || '?')}`;
    case 'http':
      return `${fmt(config.url || 'URL')} (espera ${fmt(config.expectCode || 200)})`;
    default:
      return fmt(JSON.stringify(config));
  }
}

// Modal Functions
/**
 * Panel de un servidor: pestaña "Telemetría en vivo" (ondas por check + incidentes, se
 * actualiza sola), "Resumen" (datos de 24 h y últimas ejecuciones) e "Historial".
 */
async function showHostModal(hostId) {
  const body = document.getElementById('hostModalBody');
  const title = document.getElementById('hostModalTitle');
  const id = String(hostId || '');
  if (!/^[1-9][0-9]{0,18}$/.test(id)) return;

  const conocido = (state.vivo?.hosts || []).find((h) => String(h.id) === id) || state.hosts.find((h) => String(h.id) === id);
  title.textContent = conocido ? `${conocido.name}${conocido.ip ? ` (${conocido.ip})` : ''}` : 'Telemetría del servidor';
  state.panel = { hostId: id, minutos: state.panel.minutos || 60, host: conocido || null, pidiendo: false };

  body.innerHTML = `
    <div class="ptabs" role="tablist" aria-label="Secciones del servidor">
      <button type="button" class="ptab activo" role="tab" aria-selected="true" data-ptab="tele">Telemetría en vivo</button>
      <button type="button" class="ptab" role="tab" aria-selected="false" data-ptab="resumen">Resumen</button>
      <button type="button" class="ptab" role="tab" aria-selected="false" data-ptab="historial">Historial</button>
    </div>
    <div class="ppanel" data-ppanel="tele">${cabeceraPanel(state.panel.minutos)}</div>
    <div class="ppanel" data-ppanel="resumen" hidden><div class="loading-spinner"></div></div>
    <div class="ppanel" data-ppanel="historial" hidden>${marcadoHistorial()}</div>
    <div class="host-detail-actions solo-admin">
      <button type="button" class="btn btn-warning" data-action="maintenance" data-id="${escapeAttr(id)}">🔧 Mantenimiento</button>
      <button type="button" class="btn btn-primary" data-action="add-check" data-host-id="${escapeAttr(id)}">➕ Agregar check</button>
    </div>`;
  body.querySelector('[data-tele-cuerpo]').innerHTML = esqueletoPanel();
  abrirModal('hostModal');
  actualizarBotonMantenimiento();
  trackUIEvent('monitoring.host_panel.open');
  await refrescarPanel();
}

function marcadoHistorial() {
  return `
    <div class="history-controls historial-controles">
      <select id="historyRange" class="form-control u-ancho-auto" aria-label="Rango del historial">
        <option value="today">Hoy</option>
        <option value="yesterday">Ayer</option>
        <option value="6h">Últimas 6 horas</option>
        <option value="24h">Últimas 24 horas</option>
        <option value="3d">Últimos 3 días</option>
        <option value="7d">Últimos 7 días</option>
        <option value="custom">Rango personalizado</option>
      </select>
      <button type="button" class="btn btn-primary btn-sm" id="btnLoadHistory">Cargar</button>
    </div>
    <div id="customDateRange" class="u-oculto historial-rango">
      <label class="u-texto-13">Desde: <input type="datetime-local" id="historyFrom" class="form-control u-ancho-auto-inline"></label>
      <label class="u-texto-13-ml-12">Hasta: <input type="datetime-local" id="historyTo" class="form-control u-ancho-auto-inline"></label>
    </div>
    <div id="historyResults">
      <p class="muted">Seleccione un rango y pulse Cargar.</p>
    </div>`;
}

function actualizarBotonMantenimiento() {
  const btn = document.querySelector('#hostModalBody [data-action="maintenance"]');
  if (!btn) return;
  const enMant = state.panel.host?.estado_actual === 'MAINTENANCE';
  btn.textContent = enMant ? '✅ Sacar de mantenimiento' : '🔧 Poner en mantenimiento';
  btn.classList.toggle('btn-success', enMant);
  btn.classList.toggle('btn-warning', !enMant);
}

/** Pide la serie del servidor abierto y repinta solo el cuerpo de la telemetría */
async function refrescarPanel() {
  const { hostId, minutos } = state.panel;
  const cuerpo = document.querySelector('#hostModalBody [data-tele-cuerpo]');
  const hora = document.querySelector('#hostModalBody [data-tele-hora]');
  const vivo = document.querySelector('#hostModalBody [data-tele-vivo]');
  if (!hostId || !cuerpo || state.panel.pidiendo) return;
  state.panel.pidiendo = true;
  try {
    const datos = await obtenerJson(`/api/monitoring/telemetry/hosts/${encodeURIComponent(hostId)}/series?minutes=${minutos}&limit=120`);
    if (state.panel.hostId !== hostId) return; // se cerró o cambió de servidor
    state.panel.host = datos.host;
    document.getElementById('hostModalTitle').textContent = `${datos.host.name}${datos.host.ip ? ` (${datos.host.ip})` : ''}`;
    cuerpo.innerHTML = cuerpoPanel(datos);
    actualizarBotonMantenimiento();
    if (hora) hora.textContent = `En vivo · ${new Date().toLocaleTimeString('es-EC')}`;
    vivo?.classList.remove('en-vivo--error');
  } catch (err) {
    if (state.panel.hostId !== hostId) return;
    if (hora) hora.textContent = 'Sin conexión';
    vivo?.classList.add('en-vivo--error');
    // Si ya hay gráficas se conservan; si no, se muestra el error con reintento
    if (!cuerpo.querySelector('.tele-grid, .tele-estado')) mostrarError(cuerpo, mensajeDeError(err, 'No se pudo cargar la telemetría.'), 'panel');
  } finally {
    state.panel.pidiendo = false;
  }
}

function detenerPanel() {
  state.panel = { hostId: null, minutos: state.panel.minutos, host: null, pidiendo: false };
}

async function cargarResumenHost(contenedor) {
  const data = await fetchHostDetail(state.panel.hostId);
  if (!data) {
    mostrarError(contenedor, 'No se pudo cargar el resumen del servidor.', 'resumen');
    return;
  }
  const { host, checks, recentRuns, incidents, stats24h } = data;
  contenedor.innerHTML = `
      <div class="host-detail">
        <div class="host-detail-header">
          ${statusBadge(host.estado_actual)}
          ${host.critical ? '<span class="badge badge-critical">CRÍTICO</span>' : ''}
          <span class="muted">Tipo: ${fmt(host.type)}</span>
          ${host.rack ? `<span class="muted">Rack: ${fmt(host.rack)}</span>` : ''}
        </div>
        <div class="host-detail-stats">
          <div class="stat">
            <div class="stat-value">${fmt(stats24h?.ok_count || 0)}</div>
            <div class="stat-label">Checks OK (24h)</div>
          </div>
          <div class="stat">
            <div class="stat-value text-danger">${fmt(stats24h?.fail_count || 0)}</div>
            <div class="stat-label">Fallidos (24h)</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats24h?.avg_latency ? Math.round(stats24h.avg_latency) + 'ms' : '—'}</div>
            <div class="stat-label">Latencia Prom.</div>
          </div>
        </div>
        <div class="host-detail-section">
          <h3>Checks Configurados (${checks.length})</h3>
          ${checks.length > 0 ? `
            <ul class="check-list">
              ${checks.map(c => `
                <li>
                  <span class="badge">${fmt(String(c.kind || '').toUpperCase())}</span>
                  ${formatCheckConfig(c)}
                  <span class="muted">(cada ${fmt(c.frequency_sec)}s)</span>
                  ${c.enabled ? '✅' : '❌'}
                </li>
              `).join('')}
            </ul>
          ` : '<p class="muted">Sin checks configurados</p>'}
        </div>
        <div class="host-detail-section">
          <h3>Últimas Ejecuciones</h3>
          ${recentRuns.length > 0 ? `
            <table class="data-table compact">
              <thead>
                <tr><th>Hora</th><th>Tipo</th><th>Estado</th><th>Latencia</th></tr>
              </thead>
              <tbody>
                ${recentRuns.slice(0, 10).map(r => `
                  <tr>
                    <td>${formatDate(r.time)}</td>
                    <td>${fmt(r.kind?.toUpperCase() || '?')}</td>
                    <td><span class="badge badge-${claseSegura(r.status)}">${fmt(r.status)}</span></td>
                    <td>${r.latency_ms ? fmt(r.latency_ms) + 'ms' : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p class="muted">Sin ejecuciones recientes</p>'}
        </div>
        <div class="host-detail-section">
          <h3>Incidentes Recientes</h3>
          ${incidents.length > 0 ? `
            <ul class="incident-list">
              ${incidents.map(inc => `
                <li>
                  ${incidentStateBadge(inc.state)}
                  ${severityBadge(inc.severity)}
                  <span>${formatDate(inc.opened_at)}</span>
                  <span class="muted">${fmt(inc.summary)}</span>
                </li>
              `).join('')}
            </ul>
          ` : '<p class="muted">Sin incidentes</p>'}
        </div>
      </div>`;
}

function rangoHistorial() {
  const range = document.getElementById('historyRange').value;
  const now = new Date();
  const horasAtras = { '6h': 6, '24h': 24, '3d': 72, '7d': 168 };
  if (horasAtras[range]) {
    return { from: new Date(now.getTime() - horasAtras[range] * 3600000).toISOString(), to: now.toISOString() };
  }
  if (range === 'today') {
    return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), to: now.toISOString() };
  }
  if (range === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return {
      from: new Date(y.getFullYear(), y.getMonth(), y.getDate()).toISOString(),
      to: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999).toISOString()
    };
  }
  const fromInput = document.getElementById('historyFrom').value;
  const toInput = document.getElementById('historyTo').value;
  if (!fromInput || !toInput) return null;
  return { from: new Date(fromInput).toISOString(), to: new Date(toInput).toISOString() };
}

async function cargarHistorial() {
  const historyResults = document.getElementById('historyResults');
  const rango = rangoHistorial();
  if (!rango) {
    historyResults.innerHTML = '<div class="error">Seleccione fecha de inicio y fin</div>';
    return;
  }
  historyResults.innerHTML = '<div class="loading-spinner"></div>';
  const hData = await fetchHostHistory(state.panel.hostId, rango.from, rango.to);
  if (!hData || !hData.history) {
    mostrarError(historyResults, 'No se pudo cargar el historial.', 'historial');
    return;
  }
  if (hData.history.length === 0) {
    historyResults.innerHTML = '<div class="empty-state">No hay registros en este periodo</div>';
    return;
  }
  historyResults.innerHTML = `
      <div class="historial-resumen">
        Mostrando ${hData.history.length} registros
      </div>
      <table class="data-table compact u-ancho-100">
        <thead>
          <tr><th>Hora</th><th>Tipo</th><th>Estado</th><th>Latencia</th><th>Error</th></tr>
        </thead>
        <tbody class="historial-cuerpo">
          ${hData.history.map(r => `
            <tr class="historial-fila">
              <td class="u-col-25">${formatDate(r.time)}</td>
              <td class="u-col-15">${fmt(r.kind?.toUpperCase() || 'ICMP')}</td>
              <td class="u-col-15"><span class="badge badge-${claseSegura(r.status)}">${fmt(r.status)}</span></td>
              <td class="u-col-15">${r.latency_ms ? fmt(r.latency_ms) + 'ms' : '—'}</td>
              <td class="historial-col-error">${fmt(r.error)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
}

function cambiarPestanaPanel(nombre) {
  const body = document.getElementById('hostModalBody');
  body.querySelectorAll('[data-ptab]').forEach((b) => {
    const activo = b.dataset.ptab === nombre;
    b.classList.toggle('activo', activo);
    b.setAttribute('aria-selected', activo ? 'true' : 'false');
  });
  body.querySelectorAll('[data-ppanel]').forEach((p) => { p.hidden = p.dataset.ppanel !== nombre; });
  if (nombre === 'resumen') cargarResumenHost(body.querySelector('[data-ppanel="resumen"]'));
  if (nombre === 'tele') refrescarPanel();
}

async function alternarMantenimiento(hostId) {
  const host = state.panel.host || (state.vivo?.hosts || []).find((h) => String(h.id) === String(hostId));
  if (host?.estado_actual === 'MAINTENANCE') {
    const ok = await confirmActionTracked('end_maintenance', {
      title: 'Sacar de mantenimiento',
      message: `¿Sacar "${host.name}" de mantenimiento? Su estado se volverá a evaluar con los checks.`,
      confirmText: 'Sacar de mantenimiento',
      tone: 'primary'
    }, { hostId });
    if (!ok) return;
    try {
      await enviarJson(`/api/monitoring/hosts/${encodeURIComponent(hostId)}/maintenance`, 'DELETE');
      showToast('El servidor salió de mantenimiento', 'success');
      refrescarTodo();
    } catch (err) {
      showToast(mensajeDeError(err, 'No se pudo sacar de mantenimiento'), 'error');
    }
    return;
  }
  document.getElementById('maintenanceForm').reset();
  document.getElementById('maintenanceHostId').value = String(hostId);
  document.getElementById('maintenanceHostName').textContent = host ? `Servidor: ${host.name}. Durante la ventana no se generan alertas.` : 'Durante la ventana no se generan alertas.';
  abrirModal('maintenanceModal');
}

async function guardarMantenimiento(e) {
  e.preventDefault();
  const hostId = document.getElementById('maintenanceHostId').value;
  try {
    await enviarJson(`/api/monitoring/hosts/${encodeURIComponent(hostId)}/maintenance`, 'POST', {
      duration_hours: Number(document.getElementById('maintenanceHours').value),
      comment: document.getElementById('maintenanceComment').value.trim()
    });
    showToast('Servidor en mantenimiento', 'success');
    cerrarModal(document.getElementById('maintenanceModal'));
    refrescarTodo();
  } catch (err) {
    showToast(mensajeDeError(err, 'No se pudo activar el mantenimiento'), 'error');
  }
}

async function showIncidentModal(incidentId) {
  const modal = document.getElementById('incidentModal');
  const body = document.getElementById('incidentModalBody');
  const title = document.getElementById('incidentModalTitle');

  modal.classList.add('show');
  body.innerHTML = '<div class="loading-spinner"></div>';

  const data = await fetchIncidentDetail(incidentId);
  if (!data) {
    body.innerHTML = '<div class="error">Error cargando datos</div>';
    return;
  }

  const { incident, events, checkRuns } = data;
  title.textContent = `Incidente #${incident.id}`;

  body.innerHTML = `
    <div class="incident-detail">
      <div class="incident-detail-header">
        ${incidentStateBadge(incident.state)}
        ${severityBadge(incident.severity)}
      </div>
      
      <div class="incident-detail-host">
        <h3>${fmt(incident.host_name)}</h3>
        <span class="muted">${fmt(incident.host_ip)}</span>
        ${incident.host_critical ? '<span class="badge badge-critical">CRÍTICO</span>' : ''}
      </div>
      
      <div class="incident-detail-info">
        <p><strong>Resumen:</strong> ${fmt(incident.summary)}</p>
        <p><strong>Abierto:</strong> ${formatDate(incident.opened_at)}</p>
        ${incident.closed_at ? `<p><strong>Cerrado:</strong> ${formatDate(incident.closed_at)}</p>` : ''}
      </div>
      
      <div class="incident-detail-section">
        <h3>Timeline de Eventos</h3>
        <div class="timeline">
          ${events.map(e => `
            <div class="timeline-item">
              <div class="timeline-time">${formatDate(e.at)}</div>
              <div class="timeline-content">
                <span class="badge">${fmt(e.type)}</span>
                ${fmt(e.payload?.note || e.payload?.resolution || e.payload?.user || '')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="incident-detail-actions">
        ${incident.state === 'open' ? `
          <button class="btn btn-warning" data-action="ack" data-id="${encodeURIComponent(String(incident.id ?? ''))}">Reconocer (ACK)</button>
        ` : ''}
        ${incident.state !== 'closed' ? `
          <button class="btn btn-success" data-action="resolve" data-id="${encodeURIComponent(String(incident.id ?? ''))}">Marcar Resuelto</button>
          <button class="btn btn-secondary" data-action="close" data-id="${encodeURIComponent(String(incident.id ?? ''))}">Cerrar</button>
        ` : ''}
        <button class="btn" data-action="add-note" data-id="${encodeURIComponent(String(incident.id ?? ''))}">📝 Agregar Nota</button>
      </div>
    </div>
  `;
}

function closeModals() {
  document.querySelectorAll('.modal.show').forEach(cerrarModal);
}

// Check Form
function showCheckModal(hostId = null) {
  const modal = document.getElementById('checkModal');
  const form = document.getElementById('checkForm');
  const hostSelect = document.getElementById('checkHostId');

  form.reset();
  document.getElementById('tcpConfigGroup').classList.add('u-oculto');
  document.getElementById('httpConfigGroup').classList.add('u-oculto');

  const pintar = () => {
    hostSelect.innerHTML = '<option value="">Seleccione un host...</option>';
    const lista = state.hosts.length ? state.hosts : (state.vivo?.hosts || []);
    lista.forEach(h => {
      const option = document.createElement('option');
      option.value = h.id;
      option.textContent = `${h.name} (${h.ip || 'sin IP'})`;
      if (hostId && String(h.id) === String(hostId)) option.selected = true;
      hostSelect.appendChild(option);
    });
  };
  pintar();
  modal.classList.add('show');
  // Si aún no se cargó la lista de hosts (p. ej. desde la vista en vivo), se completa en segundo plano
  if (!state.hosts.length) {
    fetchHosts({}).then((d) => { state.hosts = d.hosts || []; pintar(); }).catch(() => { });
  }
}

// Event Handlers
async function handleIncidentAction(action, id) {
  try {
    // Map frontend actions to backend endpoints
    const actionMap = {
      'add-note': 'note',
      'ack': 'ack',
      'resolve': 'resolve',
      'close': 'close'
    };
    const backendAction = actionMap[action] || action;
    if (!/^[1-9][0-9]{0,18}$/.test(String(id)) || !Object.hasOwn(actionMap, action)) return;

    if (action === 'add-note') {
      // La nota se escribe en una ventana del sistema (sin prompt() nativo)
      document.getElementById('noteForm').reset();
      document.getElementById('noteIncidentId').value = String(id);
      abrirModal('noteModal');
      document.getElementById('noteText').focus();
      return;
    }

    await enviarJson(`/api/monitoring/incidents/${encodeURIComponent(id)}/${backendAction}`, 'POST', {});

    const actionLabelMap = {
      ack: 'reconocer',
      resolve: 'resolver',
      close: 'cerrar',
      'add-note': 'agregar nota'
    };
    const actionLabel = actionLabelMap[action] || action;
    showToast(`Acción "${actionLabel}" completada correctamente`, 'success');
    cerrarModal(document.getElementById('incidentModal'));
    refrescarTodo();
  } catch (err) {
    showToast(mensajeDeError(err, 'No se pudo completar la acción'), 'error');
  }
}

async function guardarNota(e) {
  e.preventDefault();
  const id = document.getElementById('noteIncidentId').value;
  const note = document.getElementById('noteText').value.trim();
  if (!note) {
    showToast('Escriba la nota', 'warning');
    return;
  }
  try {
    await enviarJson(`/api/monitoring/incidents/${encodeURIComponent(id)}/note`, 'POST', { note });
    showToast('Nota agregada correctamente', 'success');
    cerrarModal(document.getElementById('noteModal'));
    if (document.getElementById('incidentModal').classList.contains('show')) showIncidentModal(id);
    refrescarTodo();
  } catch (err) {
    showToast(mensajeDeError(err, 'No se pudo guardar la nota'), 'error');
  }
}

async function handleCheckAction(action, id) {
  try {
    if (action === 'run-check') {
      showToast('Ejecutando check...', 'info');
      const res = await fetch(`/api/monitoring/checks/${id}/run`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Error ejecutando check');

      const result = data.result;
      const statusIcon = result.status === 'ok' ? '✅' : '❌';
      const latency = result.latency ? ` (${result.latency}ms)` : '';

      showToast(`${statusIcon} ${result.hostName}: ${result.status}${latency}`,
        result.status === 'ok' ? 'success' : 'error'
      );

      // Recargar para actualizar estados
      loadChecks();
      loadDashboard();
    } else if (action === 'delete-check') {
      const confirmed = await confirmActionTracked('delete_check', {
        title: 'Eliminar check',
        message: '¿Seguro que deseas eliminar este check? Esta accion no se puede deshacer.',
        confirmText: 'Eliminar check',
        tone: 'danger'
      }, { checkId: id });
      if (!confirmed) return;
      const res = await fetch(`/api/monitoring/checks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error eliminando check');
      showToast('Check eliminado correctamente', 'success');
      loadChecks();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function createCheck(formData) {
  try {
    const config = {};
    if (formData.kind === 'tcp') {
      config.port = parseInt(formData.port);
    } else if (formData.kind === 'http') {
      config.url = formData.url;
      config.expectCode = parseInt(formData.expectCode);
    }

    const res = await fetch('/api/monitoring/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_id: parseInt(formData.host_id),
        kind: formData.kind,
        config,
        frequency_sec: parseInt(formData.frequency),
        timeout_ms: parseInt(formData.timeout),
        enabled: true
      })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Error creando check');
    }

    showToast('Check creado correctamente', 'success');
    cerrarModal(document.getElementById('checkModal'));
    loadChecks();
    if (state.panel.hostId) refrescarPanel();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function importHosts() {
  document.getElementById('importForm').reset();
  abrirModal('importModal');
}

async function confirmarImportacion(e) {
  e.preventDefault();
  const type = document.getElementById('importType').value;
  try {
    const data = await enviarJson('/api/monitoring/hosts/import', 'POST', { type });
    showToast(`Importados ${data.imported} hosts, ${data.skipped} omitidos`, 'success');
    cerrarModal(document.getElementById('importModal'));
    refrescarTodo();
  } catch (err) {
    showToast(mensajeDeError(err, 'No se pudo importar'), 'error');
  }
}

// === CHECK MASIVO ===
async function abrirCheckMasivo() {
  document.getElementById('bulkCheckForm').reset();
  actualizarCamposBulk();
  const lista = document.getElementById('bulkHostList');
  lista.innerHTML = '<div class="loading-spinner"></div>';
  abrirModal('bulkCheckModal');
  try {
    if (!state.hosts.length) state.hosts = (await fetchHosts({})).hosts || [];
    pintarHostsBulk();
  } catch (err) {
    mostrarError(lista, mensajeDeError(err, 'No se pudieron cargar los hosts.'), 'bulk');
  }
}

function pintarHostsBulk() {
  const lista = document.getElementById('bulkHostList');
  if (!state.hosts.length) {
    lista.innerHTML = '<div class="empty-state">No hay hosts. Importe hosts del inventario primero.</div>';
    return;
  }
  lista.innerHTML = state.hosts.map((h) => `
    <label class="bulk-item" data-texto="${escapeAttr(`${h.name} ${h.ip || ''} ${h.rack || ''}`.toLowerCase())}">
      <input type="checkbox" value="${escapeAttr(h.id)}" data-ip="${escapeAttr(h.ip || '')}">
      <span>${fmt(h.name)}</span><span class="muted">${fmt(h.ip || 'sin IP')}${h.rack ? ` · ${fmt(h.rack)}` : ''}</span>
    </label>`).join('');
  contarBulk();
}

function filtrarBulk() {
  const t = document.getElementById('bulkSearch').value.toLowerCase().trim();
  document.querySelectorAll('#bulkHostList .bulk-item').forEach((el) => { el.hidden = !!t && !el.dataset.texto.includes(t); });
}

function contarBulk() {
  const n = document.querySelectorAll('#bulkHostList input:checked').length;
  document.getElementById('bulkCount').textContent = `${n} seleccionado${n === 1 ? '' : 's'}`;
}

function actualizarCamposBulk() {
  const kind = document.getElementById('bulkKind').value;
  document.getElementById('bulkTcpGroup').classList.toggle('u-oculto', kind !== 'tcp');
  document.getElementById('bulkHttpGroup').classList.toggle('u-oculto', kind !== 'http');
}

async function crearChecksMasivos(e) {
  e.preventDefault();
  const marcados = [...document.querySelectorAll('#bulkHostList input:checked')];
  if (!marcados.length) {
    showToast('Seleccione al menos un host', 'warning');
    return;
  }
  const kind = document.getElementById('bulkKind').value;
  const comunes = {
    kind,
    frequency_sec: Number(document.getElementById('bulkFrequency').value),
    timeout_ms: Number(document.getElementById('bulkTimeout').value) || 2000,
    enabled: true
  };
  try {
    let creados = 0;
    let errores = 0;
    if (kind === 'http') {
      // Cada host tiene su propia URL (IP + ruta)
      const ruta = (document.getElementById('bulkPath').value.trim() || '/').replace(/^(?!\/)/, '/');
      for (const m of marcados) {
        if (!m.dataset.ip) { errores += 1; continue; }
        try {
          await enviarJson('/api/monitoring/checks', 'POST', {
            ...comunes, host_id: Number(m.value), config: { url: `http://${m.dataset.ip}${ruta}`, expectCode: 200 }
          });
          creados += 1;
        } catch { errores += 1; }
      }
    } else {
      const config = kind === 'tcp' ? { port: Number(document.getElementById('bulkPort').value) } : {};
      if (kind === 'tcp' && !(config.port >= 1 && config.port <= 65535)) {
        showToast('Indique un puerto TCP entre 1 y 65535', 'warning');
        return;
      }
      const r = await enviarJson('/api/monitoring/checks/bulk', 'POST', { ...comunes, config, host_ids: marcados.map((m) => Number(m.value)) });
      creados = r.created?.length || 0;
      errores = r.errors?.length || 0;
    }
    showToast(`Checks creados: ${creados}${errores ? ` · con error: ${errores}` : ''}`, errores && !creados ? 'error' : 'success');
    if (creados) {
      cerrarModal(document.getElementById('bulkCheckModal'));
      loadChecks();
    }
  } catch (err) {
    showToast(mensajeDeError(err, 'No se pudieron crear los checks'), 'error');
  }
}

// Data Loading Functions
async function loadDashboard() {
  let data;
  try {
    data = await fetchDashboard();
  } catch (err) {
    const msg = mensajeDeError(err, 'No se pudo cargar el resumen.');
    ['activeIncidentsList', 'criticalDownList', 'trendChart', 'recentMetrics']
      .forEach((id) => mostrarError(document.getElementById(id), msg, 'dashboard'));
    return;
  }

  state.dashboard = data;
  updateKPIs(data);
  renderActiveIncidents(data.activeIncidents);
  renderCriticalDown(data.criticalDown);
  renderRecentMetrics(data.recentMetrics);
  renderTrendChart(data.hourlyTrend);
}

// === VISTA EN TIEMPO REAL POR RACK ===
async function loadVivo() {
  const contenedor = document.getElementById('racksVivo');
  try {
    state.vivo = await obtenerJson('/api/monitoring/telemetry/overview?points=24');
    state.ultimaActualizacion = Date.now();
    marcarVivo(true);
    renderVivo();
    actualizarKpisVivo();
  } catch (err) {
    marcarVivo(false);
    // Con datos previos se conserva el diagrama; sin datos, error claro con reintento
    if (!state.vivo) mostrarError(contenedor, mensajeDeError(err), 'vivo');
  }
}

function marcarVivo(ok) {
  const ind = document.getElementById('indicadorVivo');
  const txt = document.getElementById('lastUpdate');
  ind?.classList.toggle('en-vivo--error', !ok);
  if (txt) {
    txt.textContent = ok
      ? `En vivo · ${new Date().toLocaleTimeString('es-EC')}`
      : `Sin conexión${state.ultimaActualizacion ? ` · últimos datos ${new Date(state.ultimaActualizacion).toLocaleTimeString('es-EC')}` : ''}`;
  }
}

/** Los indicadores superiores se llenan con la vista en vivo (no esperan al resumen) */
function actualizarKpisVivo() {
  if (!state.vivo) return;
  const r = resumenEstados(state.vivo.hosts);
  const poner = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
  poner('kpiUp', r.UP);
  poner('kpiDown', r.DOWN);
  poner('kpiDegraded', r.DEGRADED);
  poner('kpiMaintenance', r.MAINTENANCE);
  if (!state.dashboard) poner('kpiIncidents', r.incidentes);
}

function renderVivo() {
  const contenedor = document.getElementById('racksVivo');
  if (!contenedor || !state.vivo) return;
  contenedor.setAttribute('aria-busy', 'false');
  const hosts = filtrarHosts(state.vivo.hosts, state.filtroVivo);
  const racks = agruparPorRack(hosts);
  if (!state.vivo.hosts.length) {
    contenedor.innerHTML = '<div class="empty-state">No hay hosts en monitoreo. Use “Importar Hosts” en la pestaña Hosts para traerlos del inventario.</div>';
  } else if (!racks.length) {
    contenedor.innerHTML = '<div class="empty-state">Ningún servidor coincide con el filtro.</div>';
  } else {
    contenedor.innerHTML = racks.map((r) => tarjetaRack(r, { seleccionado: r.nombre === state.rackAbierto })).join('');
  }
  renderDetalleRack(racks);
}

function renderDetalleRack(racks = agruparPorRack(filtrarHosts(state.vivo?.hosts || [], state.filtroVivo))) {
  const panel = document.getElementById('detalleRack');
  if (!panel) return;
  const rack = racks.find((r) => r.nombre === state.rackAbierto);
  panel.hidden = !rack;
  panel.innerHTML = rack ? detalleRack(rack) : '';
}

function abrirRack(nombre) {
  state.rackAbierto = state.rackAbierto === nombre ? null : nombre;
  trackUIEvent('monitoring.rack.open');
  renderVivo();
  if (state.rackAbierto) document.getElementById('detalleRack')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Sondeo ligero: solo con la pestaña del navegador visible */
function tickVivo() {
  if (document.hidden) return;
  if (state.currentTab === 'overview') {
    loadVivo();
    loadDashboard();
  }
  if (state.panel.hostId && document.getElementById('hostModal')?.classList.contains('show')) refrescarPanel();
}

function refrescarTodo() {
  loadVivo();
  loadDashboard();
  if (state.currentTab === 'hosts') loadHosts();
  if (state.currentTab === 'incidents') loadIncidents();
  if (state.currentTab === 'checks') loadChecks();
  if (state.panel.hostId) refrescarPanel();
}

const REINTENTOS = {
  vivo: () => loadVivo(),
  dashboard: () => loadDashboard(),
  hosts: () => loadHosts(),
  incidents: () => loadIncidents(),
  checks: () => loadChecks(),
  maintenance: () => loadMaintenanceStats(),
  recipients: () => loadAlertRecipients(),
  panel: () => refrescarPanel(),
  resumen: () => cargarResumenHost(document.querySelector('#hostModalBody [data-ppanel="resumen"]')),
  historial: () => cargarHistorial(),
  bulk: () => abrirCheckMasivo()
};

async function loadHosts() {
  const filters = getHostFiltersFromUI();

  let data;
  try {
    data = await fetchHosts(filters);
  } catch (err) {
    mostrarError(document.getElementById('hostsGrid'), mensajeDeError(err, 'No se pudieron cargar los hosts.'), 'hosts');
    return;
  }
  state.hosts = data.hosts || [];

  updateRackFilterOptions(state.hosts);
  const filteredHosts = applyHostFiltersLocal(state.hosts, filters);
  renderHosts(filteredHosts);
  renderHostFilterChips(filters, filteredHosts.length, state.hosts.length);
}

async function loadIncidents() {
  const filters = {
    state: document.getElementById('filterIncidentState')?.value || '',
    severity: document.getElementById('filterIncidentSeverity')?.value || ''
  };

  try {
    const data = await fetchIncidents(filters);
    state.incidents = data.incidents || [];
    filterAndRenderIncidents();
  } catch (err) {
    mostrarError(document.getElementById('incidentsList'), mensajeDeError(err, 'No se pudieron cargar los incidentes.'), 'incidents');
  }
}

async function loadChecks() {
  try {
    const data = await fetchChecks();
    state.checks = data.checks || [];
    filterAndRenderChecks();
  } catch (err) {
    mostrarError(document.getElementById('checksList'), mensajeDeError(err, 'No se pudieron cargar los checks.'), 'checks');
  }
}

// === FILTRADO LOCAL ===
function filterAndRenderIncidents() {
  const searchTerm = (document.getElementById('searchIncidents')?.value || '').toLowerCase().trim();

  if (!searchTerm) {
    renderIncidents(state.incidents);
    return;
  }

  const filtered = state.incidents.filter(inc => {
    const hostName = (inc.host_name || '').toLowerCase();
    const hostIp = (inc.host_ip || '').toLowerCase();
    const summary = (inc.summary || '').toLowerCase();
    return hostName.includes(searchTerm) ||
      hostIp.includes(searchTerm) ||
      summary.includes(searchTerm);
  });

  renderIncidents(filtered);
}

function filterAndRenderChecks() {
  const searchTerm = (document.getElementById('searchChecks')?.value || '').toLowerCase().trim();

  if (!searchTerm) {
    renderChecks(state.checks);
    return;
  }

  const filtered = state.checks.filter(check => {
    const hostName = (check.host_name || '').toLowerCase();
    const hostIp = (check.host_ip || '').toLowerCase();
    const kind = (check.kind || '').toLowerCase();
    return hostName.includes(searchTerm) ||
      hostIp.includes(searchTerm) ||
      kind.includes(searchTerm);
  });

  renderChecks(filtered);
}

// === MANTENIMIENTO ===
async function loadMaintenanceStats() {
  const container = document.getElementById('storageStats');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const res = await fetch('/api/monitoring/maintenance/stats');
    if (!res.ok) throw new Error('Error cargando estadísticas');
    const data = await res.json();

    const checkRuns = data.check_runs;
    const tableSizes = data.table_sizes || [];

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-title">📝 Registros de Check Runs</div>
          <div class="stat-value">${checkRuns.total.toLocaleString()}</div>
          <div class="stat-detail">
            <span class="text-success">Últimas 24h: ${checkRuns.by_age.last_24h.toLocaleString()}</span>
            <span>7 días: ${checkRuns.by_age.last_7d.toLocaleString()}</span>
            <span>30 días: ${checkRuns.by_age.last_30d.toLocaleString()}</span>
            <span class="text-warning">+30 días: ${checkRuns.by_age.older_30d.toLocaleString()}</span>
          </div>
        </div>
        <div class="stat-box">
          <div class="stat-title">🚨 Incidentes</div>
          <div class="stat-value">${data.incidents.total.toLocaleString()}</div>
        </div>
        <div class="stat-box">
          <div class="stat-title">📋 Eventos de Incidentes</div>
          <div class="stat-value">${data.incident_events.total.toLocaleString()}</div>
        </div>
      </div>
      
      <div class="table-section">
        <h3>📊 Tamaño de Tablas</h3>
        <table class="data-table compact">
          <thead>
            <tr><th>Tabla</th><th>Tamaño</th></tr>
          </thead>
          <tbody>
            ${tableSizes.map(t => `
              <tr>
                <td>${fmt(t.table)}</td>
                <td>${fmt(t.size)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      ${checkRuns.date_range.oldest ? `
        <div class="muted u-nota-pequena">
          Rango de datos: ${formatDate(checkRuns.date_range.oldest)} - ${formatDate(checkRuns.date_range.newest)}
        </div>
      ` : ''}
    `;
  } catch (err) {
    mostrarError(container, mensajeDeError(err, 'No se pudieron cargar las estadísticas.'), 'maintenance');
  }
}

async function purgeCheckRuns() {
  const days = document.getElementById('purgeCheckRunsDays')?.value || 30;

  const confirmed = await confirmActionTracked('purge_check_runs', {
    title: 'Eliminar logs antiguos',
    message: `¿Seguro que deseas eliminar los registros de check_runs con mas de ${days} dias? Esta accion no se puede deshacer.`,
    confirmText: 'Eliminar logs',
    tone: 'danger'
  }, { days: Number(days) || 0 });
  if (!confirmed) {
    return;
  }

  try {
    const res = await fetch('/api/monitoring/maintenance/purge-check-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: parseInt(days) })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');

    showToast(`Se eliminaron ${data.deleted.toLocaleString()} registros`, 'success');
    loadMaintenanceStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function purgeIncidents() {
  const days = document.getElementById('purgeIncidentsDays')?.value || 90;

  const confirmed = await confirmActionTracked('purge_incidents', {
    title: 'Eliminar incidentes cerrados',
    message: `¿Seguro que deseas eliminar los incidentes cerrados con mas de ${days} dias? Esta accion no se puede deshacer.`,
    confirmText: 'Eliminar incidentes',
    tone: 'danger'
  }, { days: Number(days) || 0 });
  if (!confirmed) {
    return;
  }

  try {
    const res = await fetch('/api/monitoring/maintenance/purge-incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: parseInt(days), states: ['closed', 'resolved'] })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');

    showToast(`Se eliminaron ${data.deleted_incidents} incidentes y ${data.deleted_events} eventos`, 'success');
    loadMaintenanceStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function runVacuum() {
  const confirmed = await confirmActionTracked('run_vacuum', {
    title: 'Ejecutar VACUUM ANALYZE',
    message: 'Se optimizaran las tablas de la base de datos y el proceso puede tardar unos segundos. ¿Deseas continuar?',
    confirmText: 'Ejecutar VACUUM',
    tone: 'danger'
  });
  if (!confirmed) {
    return;
  }

  try {
    showToast('Ejecutando VACUUM...', 'info');

    const res = await fetch('/api/monitoring/maintenance/vacuum', {
      method: 'POST'
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');

    showToast('VACUUM completado exitosamente', 'success');
    loadMaintenanceStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Tab Switching
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    const isActive = content.id === `tab-${tabName}`;
    content.classList.toggle('active', isActive);
    content.hidden = !isActive;
  });

  state.currentTab = tabName;
  trackUIEvent('monitoring.tab.switch', { tabName });

  // Load data for the tab
  switch (tabName) {
    case 'overview':
      loadVivo();
      loadDashboard();
      break;
    case 'hosts':
      loadHosts();
      break;
    case 'incidents':
      loadIncidents();
      break;
    case 'checks':
      loadChecks();
      loadHosts(); // Need hosts for the check form
      break;
    case 'maintenance':
      loadMaintenanceStats();
      break;
    case 'alerts-config':
      loadAlertRecipients();
      loadSmtpStatus();
      loadSimulateHosts();
      break;
  }
}

// Initialize
/**
 * RBAC de la pantalla en modo "fail-closed": los controles de escritura están
 * ocultos por CSS (body:not(.rol-admin)) y solo se muestran si se confirma que el
 * usuario es admin/superadmin. Si la consulta falla, siguen ocultos.
 * (El backend igual responde 403 a un viewer.)
 */
async function aplicarRolEnPantalla() {
  try {
    const res = await fetch('/api/auth/user');
    const data = await res.json();
    const usuario = data?.success ? data.user : null;
    const esAdmin = !!usuario && (usuario.role === 'admin' || usuario.isSuperAdmin);
    window.currentUser = usuario;
    document.body.classList.toggle('rol-admin', esAdmin);
  } catch (_) {
    document.body.classList.remove('rol-admin');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  aplicarRolEnPantalla();

  // Tab clicks
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Tab links
  document.querySelectorAll('[data-tab-link]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(link.dataset.tabLink);
    });
  });

  // Refresh button
  document.getElementById('btnRefresh')?.addEventListener('click', () => {
    trackUIEvent('monitoring.dashboard.refresh');
    refrescarTodo();
    showToast('Datos actualizados', 'info');
  });

  // Host filters
  ['filterEstado', 'filterType', 'filterRack', 'filterCritical'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', (event) => {
      const value = event.target?.type === 'checkbox'
        ? String(event.target.checked)
        : String(event.target?.value || '');
      trackUIEvent('monitoring.host_filters.change', { id, value });
      loadHosts();
    });
  });
  document.getElementById('searchHosts')?.addEventListener('input',
    debounce(loadHosts, 300)
  );
  document.getElementById('btnClearHostFilters')?.addEventListener('click', clearHostFilters);
  document.getElementById('hostFilterChips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter-key]');
    if (!chip) return;

    const key = chip.dataset.filterKey;
    if (key === 'search') {
      const el = document.getElementById('searchHosts');
      if (el) el.value = '';
    } else if (key === 'estado') {
      const el = document.getElementById('filterEstado');
      if (el) el.value = '';
    } else if (key === 'type') {
      const el = document.getElementById('filterType');
      if (el) el.value = '';
    } else if (key === 'rack') {
      const el = document.getElementById('filterRack');
      if (el) el.value = '';
    } else if (key === 'critical') {
      const el = document.getElementById('filterCritical');
      if (el) el.checked = false;
    }

    loadHosts();
  });

  // Incident filters
  ['filterIncidentState', 'filterIncidentSeverity'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', (event) => {
      trackUIEvent('monitoring.incident_filters.change', {
        id,
        value: String(event.target?.value || '')
      });
      loadIncidents();
    });
  });
  document.getElementById('searchIncidents')?.addEventListener('input',
    debounce(filterAndRenderIncidents, 300)
  );

  // Check search
  document.getElementById('searchChecks')?.addEventListener('input',
    debounce(filterAndRenderChecks, 300)
  );

  // Host cards click
  document.getElementById('hostsGrid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.host-card');
    if (card) showHostModal(decodeURIComponent(card.dataset.hostId || ''));
  });
  document.getElementById('hostsGrid')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.host-card');
    if (!card) return;
    e.preventDefault();
    showHostModal(decodeURIComponent(card.dataset.hostId || ''));
  });

  // Active incidents click
  document.getElementById('activeIncidentsList')?.addEventListener('click', (e) => {
    const item = e.target.closest('.incident-item');
    if (item) showIncidentModal(decodeURIComponent(item.dataset.incidentId || ''));
  });
  document.getElementById('activeIncidentsList')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.incident-item');
    if (!item) return;
    e.preventDefault();
    showIncidentModal(decodeURIComponent(item.dataset.incidentId || ''));
  });

  // Critical down click
  document.getElementById('criticalDownList')?.addEventListener('click', (e) => {
    const item = e.target.closest('.host-item');
    if (item) showHostModal(decodeURIComponent(item.dataset.hostId || ''));
  });
  document.getElementById('criticalDownList')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.host-item');
    if (!item) return;
    e.preventDefault();
    showHostModal(decodeURIComponent(item.dataset.hostId || ''));
  });

  // Incidents table actions
  document.getElementById('incidentsList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = decodeURIComponent(btn.dataset.id || '');
    if (action === 'view') {
      showIncidentModal(id);
    } else {
      handleIncidentAction(action, id);
    }
  });

  // Checks table actions
  document.getElementById('checksList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    handleCheckAction(btn.dataset.action, decodeURIComponent(btn.dataset.id || ''));
  });

  // Cierre de ventanas: cada × / Cancelar cierra SOLO su ventana (las demás siguen abiertas)
  document.querySelectorAll('.modal-close, [data-cerrar-modal]').forEach(btn => {
    btn.addEventListener('click', () => cerrarModal(btn.closest('.modal')));
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cerrarModal(modal);
    });
  });

  // Reintentar (errores de carga)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-reintentar]');
    if (!btn) return;
    const fn = REINTENTOS[btn.dataset.reintentar];
    if (fn) fn();
  });

  // Vista en tiempo real: racks y servidores
  document.querySelector('.sala-vivo')?.addEventListener('click', (e) => {
    const srv = e.target.closest('[data-host-id]');
    if (srv) {
      showHostModal(srv.dataset.hostId);
      return;
    }
    if (e.target.closest('[data-rack-cerrar]')) {
      state.rackAbierto = null;
      renderVivo();
      return;
    }
    const rack = e.target.closest('[data-rack-abrir]');
    if (rack) {
      abrirRack(rack.dataset.rackAbrir);
      return;
    }
    const filtro = e.target.closest('[data-filtro-vivo]');
    if (filtro) {
      state.filtroVivo.soloProblemas = filtro.dataset.filtroVivo === 'problemas';
      document.querySelectorAll('[data-filtro-vivo]').forEach((b) => {
        const activo = b === filtro;
        b.classList.toggle('activo', activo);
        b.setAttribute('aria-pressed', activo ? 'true' : 'false');
      });
      renderVivo();
    }
  });
  document.getElementById('buscarVivo')?.addEventListener('input', debounce((e) => {
    state.filtroVivo.texto = e.target.value;
    renderVivo();
  }, 200));

  // Panel del servidor (delegado)
  document.getElementById('hostModalBody')?.addEventListener('click', (e) => {
    const ptab = e.target.closest('[data-ptab]');
    if (ptab) {
      cambiarPestanaPanel(ptab.dataset.ptab);
      return;
    }
    const rango = e.target.closest('[data-rango]');
    if (rango) {
      state.panel.minutos = Number(rango.dataset.rango) || 60;
      rango.parentElement.querySelectorAll('[data-rango]').forEach((b) => {
        const activo = b === rango;
        b.classList.toggle('activo', activo);
        b.setAttribute('aria-pressed', activo ? 'true' : 'false');
      });
      refrescarPanel();
      return;
    }
    const inc = e.target.closest('[data-incident-id]');
    if (inc) {
      showIncidentModal(inc.dataset.incidentId);
      return;
    }
    if (e.target.closest('#btnLoadHistory')) {
      cargarHistorial();
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'add-check') {
      showCheckModal(decodeURIComponent(btn.dataset.hostId || ''));
    } else if (btn.dataset.action === 'maintenance') {
      alternarMantenimiento(decodeURIComponent(btn.dataset.id || ''));
    }
  });
  document.getElementById('hostModalBody')?.addEventListener('change', (e) => {
    if (e.target.id === 'historyRange') {
      document.getElementById('customDateRange').classList.toggle('u-oculto', e.target.value !== 'custom');
    }
  });

  // Formularios de las ventanas nuevas
  document.getElementById('noteForm')?.addEventListener('submit', guardarNota);
  document.getElementById('importForm')?.addEventListener('submit', confirmarImportacion);
  document.getElementById('maintenanceForm')?.addEventListener('submit', guardarMantenimiento);
  document.getElementById('bulkCheckForm')?.addEventListener('submit', crearChecksMasivos);
  document.getElementById('bulkKind')?.addEventListener('change', actualizarCamposBulk);
  document.getElementById('bulkSearch')?.addEventListener('input', filtrarBulk);
  document.getElementById('bulkHostList')?.addEventListener('change', contarBulk);
  document.getElementById('bulkSelectAll')?.addEventListener('click', () => {
    document.querySelectorAll('#bulkHostList .bulk-item:not([hidden]) input').forEach((i) => { i.checked = true; });
    contarBulk();
  });
  document.getElementById('bulkSelectNone')?.addEventListener('click', () => {
    document.querySelectorAll('#bulkHostList input').forEach((i) => { i.checked = false; });
    contarBulk();
  });

  document.getElementById('incidentModalBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    handleIncidentAction(btn.dataset.action, decodeURIComponent(btn.dataset.id || ''));
  });

  // Add Check button
  document.getElementById('btnAddCheck')?.addEventListener('click', () => showCheckModal());
  document.getElementById('btnBulkCheck')?.addEventListener('click', abrirCheckMasivo);

  // Import hosts
  document.getElementById('btnImportHosts')?.addEventListener('click', importHosts);

  // Check form
  const checkForm = document.getElementById('checkForm');
  const checkKind = document.getElementById('checkKind');

  checkKind?.addEventListener('change', () => {
    document.getElementById('tcpConfigGroup').classList.toggle('u-oculto', checkKind.value !== 'tcp');
    document.getElementById('httpConfigGroup').classList.toggle('u-oculto', checkKind.value !== 'http');
  });

  checkForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    createCheck({
      host_id: document.getElementById('checkHostId').value,
      kind: checkKind.value,
      port: document.getElementById('checkPort').value,
      url: document.getElementById('checkUrl').value,
      expectCode: document.getElementById('checkExpectCode').value,
      frequency: document.getElementById('checkFrequency').value,
      timeout: document.getElementById('checkTimeout').value
    });
  });


  // Maintenance buttons
  document.getElementById('btnRefreshStats')?.addEventListener('click', loadMaintenanceStats);
  document.getElementById('btnPurgeCheckRuns')?.addEventListener('click', purgeCheckRuns);
  document.getElementById('btnPurgeIncidents')?.addEventListener('click', purgeIncidents);
  document.getElementById('btnVacuum')?.addEventListener('click', runVacuum);

  // Alert Recipients buttons
  document.getElementById('btnAddRecipient')?.addEventListener('click', () => openRecipientModal());
  document.getElementById('btnTestEmail')?.addEventListener('click', sendTestEmail);
  document.getElementById('recipientModalClose')?.addEventListener('click', closeRecipientModal);
  document.getElementById('recipientFormCancel')?.addEventListener('click', closeRecipientModal);
  document.getElementById('recipientForm')?.addEventListener('submit', saveRecipient);
  document.getElementById('recipientsList')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-recipient-action]');
    if (!button) return;

    const id = Number(button.dataset.recipientId);
    if (!Number.isInteger(id) || id <= 0) return;

    const action = button.dataset.recipientAction;
    if (action === 'edit') {
      openRecipientModal(id);
      return;
    }
    if (action === 'toggle') {
      await toggleRecipient(id);
      return;
    }
    if (action === 'delete') {
      const email = decodeURIComponent(button.dataset.recipientEmail || '');
      await deleteRecipient(id, email);
    }
  });

  // Simulate Alert buttons
  document.getElementById('btnSimulateDown')?.addEventListener('click', () => simulateAlert('down'));
  document.getElementById('btnSimulateUp')?.addEventListener('click', () => simulateAlert('up'));

  // Carga inicial: la vista en vivo y el resumen en paralelo
  loadVivo();
  loadDashboard();

  // Actualización en vivo cada 15 s, solo con la pestaña visible; al volver se refresca al instante
  state.refreshInterval = setInterval(tickVivo, INTERVALO_VIVO_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - state.ultimaActualizacion > INTERVALO_VIVO_MS) tickVivo();
  });
});

// ====== ALERT RECIPIENTS FUNCTIONS ======

async function loadAlertRecipients() {
  const container = document.getElementById('recipientsList');
  if (!container) return;

  container.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const res = await fetch('/api/monitoring/alert-recipients');
    if (res.status === 401) {
      // Sesión expirada
      container.innerHTML = `<div class="error">Sesión expirada. <a href="/login">Iniciar sesión</a></div>`;
      return;
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error HTTP ${res.status}`);
    }
    const recipients = await res.json();

    if (recipients.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No hay destinatarios configurados</p>
          <p class="muted">Agrega correos para recibir alertas cuando los servidores cambien de estado.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Estado</th>
            <th>Email</th>
            <th>Nombre</th>
            <th>Alertas</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${recipients.map(r => `
            <tr class="${r.enabled ? '' : 'disabled-row'}">
              <td>
                <span class="status-indicator ${r.enabled ? 'status-active' : 'status-inactive'}"></span>
                ${r.enabled ? 'Activo' : 'Inactivo'}
              </td>
              <td><strong>${fmt(r.email)}</strong></td>
              <td>${fmt(r.name)}</td>
              <td>
                ${r.notify_down ? '🔴' : ''} 
                ${r.notify_degraded ? '🟡' : ''} 
                ${r.notify_recovery ? '🟢' : ''}
              </td>
              <td>
                <div class="btn-group">
                  <button class="btn btn-sm" data-recipient-action="edit" data-recipient-id="${Number(r.id) || 0}" title="Editar">✏️</button>
                  <button class="btn btn-sm ${r.enabled ? 'btn-warning' : 'btn-success'}" data-recipient-action="toggle" data-recipient-id="${Number(r.id) || 0}" title="${r.enabled ? 'Desactivar' : 'Activar'}">
                    ${r.enabled ? '⏸️' : '▶️'}
                  </button>
                  <button class="btn btn-sm btn-danger" data-recipient-action="delete" data-recipient-id="${Number(r.id) || 0}" data-recipient-email="${encodeURIComponent(String(r.email || ''))}" title="Eliminar">🗑️</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error('Error loading recipients:', err);
    mostrarError(container, mensajeDeError(err, 'No se pudieron cargar los destinatarios.'), 'recipients');
  }
}

async function loadSmtpStatus() {
  const container = document.getElementById('smtpStatus');
  if (!container) return;

  try {
    const res = await fetch('/api/monitoring/health');
    if (!res.ok) throw new Error('Error');
    const health = await res.json();

    const smtpOk = health.smtpConfigured;
    container.innerHTML = `
      <div class="status-box ${smtpOk ? 'status-ok' : 'status-error'}">
        <span class="status-icon">${smtpOk ? '✅' : '❌'}</span>
        <div>
          <strong>SMTP: ${smtpOk ? 'Configurado' : 'No configurado'}</strong>
          <p class="muted">${smtpOk ? 'El servidor de correo está listo para enviar alertas' : 'Configura las variables SMTP_* en el servidor'}</p>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="error">Error verificando SMTP</div>`;
  }
}

function openRecipientModal(recipientId = null) {
  const modal = document.getElementById('recipientModal');
  const title = document.getElementById('recipientModalTitle');
  const form = document.getElementById('recipientForm');

  if (!modal || !form) return;

  form.reset();
  document.getElementById('recipientId').value = '';
  document.getElementById('recipientNotifyDown').checked = true;
  document.getElementById('recipientNotifyDegraded').checked = true;
  document.getElementById('recipientNotifyRecovery').checked = true;

  if (recipientId) {
    title.textContent = 'Editar Destinatario';
    // Cargar datos del destinatario
    loadRecipientForEdit(recipientId);
  } else {
    title.textContent = 'Agregar Destinatario';
  }

  modal.classList.add('show');
}

async function loadRecipientForEdit(id) {
  try {
    const res = await fetch('/api/monitoring/alert-recipients');
    if (!res.ok) throw new Error('Error');
    const recipients = await res.json();
    const r = recipients.find(x => String(x.id) === String(id));

    if (r) {
      document.getElementById('recipientId').value = r.id;
      document.getElementById('recipientEmail').value = r.email;
      document.getElementById('recipientName').value = r.name || '';
      document.getElementById('recipientNotifyDown').checked = r.notify_down;
      document.getElementById('recipientNotifyDegraded').checked = r.notify_degraded;
      document.getElementById('recipientNotifyRecovery').checked = r.notify_recovery;
    }
  } catch (err) {
    console.error('Error loading recipient:', err);
  }
}

function closeRecipientModal() {
  document.getElementById('recipientModal')?.classList.remove('show');
}

async function saveRecipient(e) {
  e.preventDefault();

  const id = document.getElementById('recipientId').value;
  const data = {
    email: document.getElementById('recipientEmail').value.trim(),
    name: document.getElementById('recipientName').value.trim(),
    notify_down: document.getElementById('recipientNotifyDown').checked,
    notify_degraded: document.getElementById('recipientNotifyDegraded').checked,
    notify_recovery: document.getElementById('recipientNotifyRecovery').checked
  };

  try {
    const url = id ? `/api/monitoring/alert-recipients/${id}` : '/api/monitoring/alert-recipients';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    if (!res.ok) {
      showToast(result.error || 'Error guardando', 'error');
      return;
    }

    showToast(id ? 'Destinatario actualizado correctamente' : 'Destinatario agregado correctamente', 'success');
    closeRecipientModal();
    loadAlertRecipients();
  } catch (err) {
    console.error('Error saving recipient:', err);
    showToast('Error de conexión', 'error');
  }
}

async function toggleRecipient(id) {
  try {
    const res = await fetch(`/api/monitoring/alert-recipients/${id}/toggle`, { method: 'POST' });
    if (!res.ok) throw new Error('Error');

    showToast('Estado actualizado correctamente', 'success');
    loadAlertRecipients();
  } catch (err) {
    showToast('Error actualizando estado', 'error');
  }
}

async function deleteRecipient(id, email) {
  const confirmed = await confirmActionTracked('delete_recipient', {
    title: 'Eliminar destinatario',
    message: `¿Seguro que deseas eliminar el destinatario "${email}"? Esta accion no se puede deshacer.`,
    confirmText: 'Eliminar destinatario',
    tone: 'danger'
  }, { recipientId: id });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/monitoring/alert-recipients/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error');

    showToast('Destinatario eliminado correctamente', 'success');
    loadAlertRecipients();
  } catch (err) {
    showToast('Error eliminando destinatario', 'error');
  }
}

async function sendTestEmail() {
  const btn = document.getElementById('btnTestEmail');
  const result = document.getElementById('testEmailResult');

  btn.disabled = true;
  btn.textContent = '⏳ Enviando...';
  result.innerHTML = '';

  try {
    const res = await fetch('/api/monitoring/alert-recipients/test', { method: 'POST' });
    const data = await res.json();

    if (res.ok && data.success) {
      result.innerHTML = `
        <div class="alert alert-success">
          ✅ Email enviado correctamente a: ${data.recipients.map(fmt).join(', ')}
        </div>
      `;
      showToast('Email de prueba enviado', 'success');
    } else {
      const mensajeError = fmt(data.error || 'No se pudo enviar el email');
      result.innerHTML = `
        <div class="alert alert-error">
          ❌ Error: ${mensajeError}
        </div>
      `;
    }
  } catch (err) {
    result.innerHTML = `<div class="alert alert-error">❌ Error de conexión</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '📧 Enviar Email de Prueba';
  }
}

// === Simulador de Alertas ===
async function loadSimulateHosts() {
  const select = document.getElementById('simulateHostSelect');
  if (!select) return;

  try {
    const res = await fetch('/api/monitoring/alert-recipients/hosts');
    const hosts = await res.json();

    select.innerHTML = '<option value="">-- Seleccionar host --</option>';

    hosts.forEach(h => {
      const estado = h.estado_actual === 'UP' ? '🟢' :
        h.estado_actual === 'DOWN' ? '🔴' : '⚪';
      const critical = h.critical ? ' ⚠️' : '';
      const option = document.createElement('option');
      option.value = String(Number(h.id) || '');
      option.dataset.estado = String(h.estado_actual || 'UNKNOWN');
      option.textContent = `${estado} ${h.name || ''} (${h.ip || ''})${critical}`;
      select.appendChild(option);
    });
  } catch (err) {
    select.innerHTML = '<option value="">Error cargando hosts</option>';
  }
}

async function simulateAlert(action) {
  const select = document.getElementById('simulateHostSelect');
  const result = document.getElementById('simulateResult');
  const hostId = select.value;

  if (!hostId) {
    showToast('Selecciona un host primero', 'warning');
    return;
  }

  const hostName = select.options[select.selectedIndex].text;
  const actionText = action === 'down' ? 'caída' : 'recuperación';

  const confirmed = await confirmActionTracked('simulate_alert', {
    title: 'Simular alerta real',
    message: `¿Seguro que deseas simular ${actionText} de ${hostName}? Se enviara una alerta real a todos los destinatarios activos.`,
    confirmText: 'Simular alerta',
    tone: 'danger'
  }, { action, hostId: Number(hostId) || 0 });
  if (!confirmed) {
    return;
  }

  const btn = action === 'down'
    ? document.getElementById('btnSimulateDown')
    : document.getElementById('btnSimulateUp');

  btn.disabled = true;
  btn.textContent = '⏳ Enviando...';
  result.innerHTML = '<div class="loading-spinner"></div>';

  try {
    const res = await fetch('/api/monitoring/alert-recipients/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostId: parseInt(hostId), action })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      const icon = action === 'down' ? '🔴' : '🟢';
      result.innerHTML = `
        <div class="alert alert-success">
          ${icon} <strong>${fmt(data.host)}</strong> (${fmt(data.ip)})<br>
          Estado: ${fmt(data.previousState)} → ${fmt(data.newState)}<br>
          ✅ Alerta enviada a todos los destinatarios activos
        </div>
      `;
      showToast(`Alerta de ${actionText} enviada`, 'success');
      // Recargar select para actualizar estados
      loadSimulateHosts();
    } else {
      const mensajeError = fmt(data.error || 'No se pudo simular la alerta');
      result.innerHTML = `
        <div class="alert alert-error">
          ❌ Error: ${mensajeError}
        </div>
      `;
      // Sin fmt(): toast.js ya inserta el mensaje como texto (fmt mostraría &amp; o &#39;)
      showToast(data.error || 'Error simulando alerta', 'error');
    }
  } catch (err) {
    result.innerHTML = `<div class="alert alert-error">❌ Error de conexión</div>`;
    showToast('Error de conexión', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = action === 'down' ? '🔴 Simular Caída' : '🟢 Simular Recuperación';
  }
}

// Utilities
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

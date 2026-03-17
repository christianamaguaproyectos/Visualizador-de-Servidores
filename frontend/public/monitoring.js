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

// Inyectar estilos para el botón de eliminar dinámicamente
(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .host-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn-icon-delete {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.2em;
      opacity: 0.6;
      transition: opacity 0.2s;
      padding: 4px;
      border-radius: 4px;
    }
    .btn-icon-delete:hover {
      opacity: 1;
      background-color: rgba(239, 68, 68, 0.1);
    }
  `;
  document.head.appendChild(style);
})();

// Estado global
const state = {
  dashboard: null,
  hosts: [],
  incidents: [],
  checks: [],
  currentTab: 'overview',
  refreshInterval: null
};

// Helpers
function fmt(val) {
  return formatearTextoSeguro(val);
}

function safeErrorMessage(error) {
  return fmt(error?.message || 'Error desconocido');
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

// Toast
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show toast-${type}`;
  setTimeout(() => toast.classList.remove('show'), 3000);
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
  try {
    const res = await fetch('/api/monitoring/dashboard');
    if (!res.ok) throw new Error('Error cargando dashboard');
    return await res.json();
  } catch (err) {
    console.error('Error fetchDashboard:', err);
    return null;
  }
}

async function fetchHosts(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.estado) params.append('estado', filters.estado);
    if (filters.type) params.append('type', filters.type);
    if (filters.rack) params.append('rack', filters.rack);
    if (filters.critical) params.append('critical', 'true');
    if (filters.search) params.append('search', filters.search);

    const res = await fetch(`/api/monitoring/hosts?${params}`);
    if (!res.ok) throw new Error('Error cargando hosts');
    return await res.json();
  } catch (err) {
    console.error('Error fetchHosts:', err);
    return { hosts: [] };
  }
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
    const res = await fetch(`/api/monitoring/hosts/${id}`);
    if (!res.ok) throw new Error('Error cargando detalle');
    return await res.json();
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

    const res = await fetch(`/api/monitoring/hosts/${id}/history?${params}`);
    if (!res.ok) throw new Error('Error cargando historial');
    return await res.json();
  } catch (err) {
    console.error('Error fetchHostHistory:', err);
    return null;
  }
}

async function fetchIncidents(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.state) params.append('state', filters.state);
    if (filters.severity) params.append('severity', filters.severity);

    const res = await fetch(`/api/monitoring/incidents?${params}`);
    if (!res.ok) throw new Error('Error cargando incidentes');
    return await res.json();
  } catch (err) {
    console.error('Error fetchIncidents:', err);
    return { incidents: [] };
  }
}

async function fetchIncidentDetail(id) {
  try {
    const res = await fetch(`/api/monitoring/incidents/${id}`);
    if (!res.ok) throw new Error('Error cargando detalle');
    return await res.json();
  } catch (err) {
    console.error('Error fetchIncidentDetail:', err);
    return null;
  }
}

async function fetchChecks() {
  try {
    const res = await fetch('/api/monitoring/checks');
    if (!res.ok) throw new Error('Error cargando checks');
    return await res.json();
  } catch (err) {
    console.error('Error fetchChecks:', err);
    return { checks: [] };
  }
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

  // Actualizar timestamp
  document.getElementById('lastUpdate').textContent = `Última actualización: ${new Date().toLocaleTimeString('es-EC')}`;
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
        <div class="success-rate-fill" style="width: ${successRate}%"></div>
      </div>
      <div class="success-rate-label">${successRate}% tasa de éxito</div>
    </div>
  `;
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
          <div class="chart-bar-fail" style="height: ${failHeight}%"></div>
          <div class="chart-bar-ok" style="height: ${okHeight}%"></div>
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
          ${h.rack ? `<span>Rack: ${h.rack}</span>` : ''}
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
            <td><span class="badge">${c.kind.toUpperCase()}</span></td>
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
      return `Ping a ${config.ip || config.host || 'host'}`;
    case 'tcp':
      return `Puerto ${config.port || '?'}`;
    case 'http':
      return `${config.url || 'URL'} (espera ${config.expectCode || 200})`;
    default:
      return JSON.stringify(config);
  }
}

// Modal Functions
async function showHostModal(hostId) {
  const modal = document.getElementById('hostModal');
  const body = document.getElementById('hostModalBody');
  const title = document.getElementById('hostModalTitle');

  modal.classList.add('show');
  body.innerHTML = '<div class="loading-spinner"></div>';

  const data = await fetchHostDetail(hostId);
  if (!data) {
    body.innerHTML = '<div class="error">Error cargando datos</div>';
    return;
  }

  const { host, checks, recentRuns, incidents, stats24h } = data;
  title.textContent = `${host.name} (${host.ip})`;

  // Estructura con Tabs
  body.innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" data-tab="host-summary">Resumen</button>
      <button class="tab-btn" data-tab="host-history">Historial</button>
    </div>

    <div id="host-summary" class="tab-content active">
      <div class="host-detail">
        <div class="host-detail-header">
          ${statusBadge(host.estado_actual)}
          ${host.critical ? '<span class="badge badge-critical">CRÍTICO</span>' : ''}
          <span class="muted">Tipo: ${host.type}</span>
          ${host.rack ? `<span class="muted">Rack: ${host.rack}</span>` : ''}
        </div>
        
        <div class="host-detail-stats">
          <div class="stat">
            <div class="stat-value">${stats24h?.ok_count || 0}</div>
            <div class="stat-label">Checks OK (24h)</div>
          </div>
          <div class="stat">
            <div class="stat-value text-danger">${stats24h?.fail_count || 0}</div>
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
                  <span class="badge">${c.kind.toUpperCase()}</span>
                  ${formatCheckConfig(c)}
                  <span class="muted">(cada ${c.frequency_sec}s)</span>
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
                    <td>${r.kind?.toUpperCase() || '?'}</td>
                    <td><span class="badge badge-${r.status}">${r.status}</span></td>
                    <td>${r.latency_ms ? r.latency_ms + 'ms' : '—'}</td>
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
                  <span class="muted">${inc.summary || ''}</span>
                </li>
              `).join('')}
            </ul>
          ` : '<p class="muted">Sin incidentes</p>'}
        </div>
        
        <div class="host-detail-actions">
          <button class="btn btn-warning" data-action="maintenance" data-id="${encodeURIComponent(String(host.id ?? ''))}">🔧 Poner en Mantenimiento</button>
          <button class="btn btn-primary" data-action="add-check" data-host-id="${encodeURIComponent(String(host.id ?? ''))}">➕ Agregar Check</button>
        </div>
      </div>
    </div>

    <!-- Pestaña Historial -->
    <div id="host-history" class="tab-content" style="display:none;">
      <div class="history-controls" style="margin-bottom: 1rem; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
        <select id="historyRange" class="form-control" style="width: auto;">
          <option value="today">Hoy</option>
          <option value="yesterday">Ayer</option>
          <option value="6h">Últimas 6 horas</option>
          <option value="24h">Últimas 24 horas</option>
          <option value="3d">Últimos 3 días</option>
          <option value="7d">Últimos 7 días</option>
          <option value="custom">Rango personalizado</option>
        </select>
        <button class="btn btn-primary btn-sm" id="btnLoadHistory">Cargar</button>
      </div>
      <div id="customDateRange" style="display: none; margin-bottom: 1rem; padding: 12px; background: #f0f4f8; border-radius: 8px;">
        <label style="font-size: 13px;">Desde: <input type="datetime-local" id="historyFrom" class="form-control" style="width: auto; display: inline-block;"></label>
        <label style="font-size: 13px; margin-left: 12px;">Hasta: <input type="datetime-local" id="historyTo" class="form-control" style="width: auto; display: inline-block;"></label>
      </div>
      <div id="historyResults">
        <p class="muted">Seleccione un rango y haga clic en Cargar.</p>
      </div>
    </div>
  `;

  // Tab switching logic
  const tabs = body.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      body.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

      tab.classList.add('active');
      const target = body.querySelector(`#${tab.dataset.tab}`);
      if (target) target.style.display = 'block';
    });
  });

  // History logic
  const btnLoadHistory = document.getElementById('btnLoadHistory');
  const historyRange = document.getElementById('historyRange');
  const historyResults = document.getElementById('historyResults');
  const customDateRange = document.getElementById('customDateRange');

  // Show/hide custom date inputs
  historyRange.addEventListener('change', () => {
    customDateRange.style.display = historyRange.value === 'custom' ? 'block' : 'none';
  });

  btnLoadHistory.addEventListener('click', async () => {
    historyResults.innerHTML = '<div class="loading-spinner"></div>';

    let from, to;
    const range = historyRange.value;
    const now = new Date();

    if (range === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      to = new Date().toISOString();
    } else if (range === 'yesterday') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      from = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate()).toISOString();
      to = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 23, 59, 59, 999).toISOString();
    } else if (range === '6h') {
      from = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
      to = new Date().toISOString();
    } else if (range === '24h') {
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      to = new Date().toISOString();
    } else if (range === '3d') {
      from = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
      to = new Date().toISOString();
    } else if (range === '7d') {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      to = new Date().toISOString();
    } else if (range === 'custom') {
      const fromInput = document.getElementById('historyFrom').value;
      const toInput = document.getElementById('historyTo').value;
      if (!fromInput || !toInput) {
        historyResults.innerHTML = '<div class="error">Por favor seleccione fecha de inicio y fin</div>';
        return;
      }
      from = new Date(fromInput).toISOString();
      to = new Date(toInput).toISOString();
    }

    const hData = await fetchHostHistory(hostId, from, to);
    if (!hData || !hData.history) {
      historyResults.innerHTML = '<div class="error">Error cargando historial</div>';
      return;
    }

    // Render History Table
    if (hData.history.length === 0) {
      historyResults.innerHTML = '<div class="empty-state">No hay registros en este periodo</div>';
      return;
    }

    historyResults.innerHTML = `
      <div style="margin-bottom: 0.5rem; font-size: 0.9em; color: #666;">
        Mostrando ${hData.history.length} registros
      </div>
      <table class="data-table compact" style="width: 100%;">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th>Latencia</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody style="display: block; max-height: 400px; overflow-y: auto;">
          ${hData.history.map(r => `
            <tr style="display: table; width: 100%; table-layout: fixed;">
              <td style="width: 25%">${formatDate(r.time)}</td>
              <td style="width: 15%">${r.kind?.toUpperCase() || 'ICMP'}</td>
              <td style="width: 15%"><span class="badge badge-${r.status}">${r.status}</span></td>
              <td style="width: 15%">${r.latency_ms ? r.latency_ms + 'ms' : '—'}</td>
              <td style="width: 30%; font-size: 0.85em; color: #d32f2f;">${r.error || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  });
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
                <span class="badge">${e.type}</span>
                ${e.payload?.note || e.payload?.resolution || e.payload?.user || ''}
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
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
}

// Check Form
function showCheckModal(hostId = null) {
  const modal = document.getElementById('checkModal');
  const form = document.getElementById('checkForm');
  const hostSelect = document.getElementById('checkHostId');

  form.reset();

  // Populate host select
  hostSelect.innerHTML = '<option value="">Seleccione un host...</option>';
  state.hosts.forEach(h => {
    const option = document.createElement('option');
    option.value = h.id;
    option.textContent = `${h.name} (${h.ip})`;
    if (hostId && h.id == hostId) option.selected = true;
    hostSelect.appendChild(option);
  });

  modal.classList.add('show');
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
    let endpoint = `/api/monitoring/incidents/${id}/${backendAction}`;
    let body = {};

    if (action === 'add-note') {
      const note = prompt('Ingrese la nota:');
      if (!note) return;
      body = { note, user: 'admin' };
    } else {
      body = { user: 'admin' };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Error');
    }

    const actionLabelMap = {
      ack: 'reconocer',
      resolve: 'resolver',
      close: 'cerrar',
      'add-note': 'agregar nota'
    };
    const actionLabel = actionLabelMap[action] || action;
    showToast(`Accion "${actionLabel}" completada correctamente`, 'success');
    loadIncidents();
    loadDashboard();
    closeModals();
  } catch (err) {
    showToast(err.message, 'error');
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
    closeModals();
    loadChecks();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function importHosts() {
  try {
    const type = prompt('Tipo de servidores a importar (fisicos/virtuales):', 'fisicos');
    if (!type) return;

    const res = await fetch('/api/monitoring/hosts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error importando');

    showToast(`Importados ${data.imported} hosts, ${data.skipped} omitidos`, 'success');
    loadHosts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Data Loading Functions
async function loadDashboard() {
  const data = await fetchDashboard();
  if (!data) return;

  state.dashboard = data;
  updateKPIs(data);
  renderActiveIncidents(data.activeIncidents);
  renderCriticalDown(data.criticalDown);
  renderRecentMetrics(data.recentMetrics);
  renderTrendChart(data.hourlyTrend);
}

async function loadHosts() {
  const filters = getHostFiltersFromUI();

  const data = await fetchHosts(filters);
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

  const data = await fetchIncidents(filters);
  state.incidents = data.incidents;
  renderIncidents(data.incidents);
}

async function loadChecks() {
  const data = await fetchChecks();
  state.checks = data.checks;
  renderChecks(data.checks);
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
                <td>${t.table}</td>
                <td>${t.size}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      ${checkRuns.date_range.oldest ? `
        <div class="muted" style="margin-top:12px;font-size:0.8rem">
          Rango de datos: ${formatDate(checkRuns.date_range.oldest)} - ${formatDate(checkRuns.date_range.newest)}
        </div>
      ` : ''}
    `;
  } catch (err) {
    container.innerHTML = `<div class="error">Error: ${safeErrorMessage(err)}</div>`;
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
document.addEventListener('DOMContentLoaded', () => {
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
    loadDashboard();
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

  // Modal closes
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', closeModals);
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModals();
    });
  });

  // Modal action buttons (delegated)
  document.getElementById('hostModalBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'add-check') {
      showCheckModal(decodeURIComponent(btn.dataset.hostId || ''));
    } else if (btn.dataset.action === 'maintenance') {
      // TODO: implement maintenance
      showToast('Función de mantenimiento próximamente', 'info');
    }
  });

  document.getElementById('incidentModalBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    handleIncidentAction(btn.dataset.action, decodeURIComponent(btn.dataset.id || ''));
  });

  // Add Check button
  document.getElementById('btnAddCheck')?.addEventListener('click', () => showCheckModal());
  document.getElementById('btnBulkCheck')?.addEventListener('click', () => {
    showToast('Función de check masivo próximamente', 'info');
  });

  // Import hosts
  document.getElementById('btnImportHosts')?.addEventListener('click', importHosts);

  // Check form
  const checkForm = document.getElementById('checkForm');
  const checkKind = document.getElementById('checkKind');

  checkKind?.addEventListener('change', () => {
    document.getElementById('tcpConfigGroup').style.display =
      checkKind.value === 'tcp' ? 'block' : 'none';
    document.getElementById('httpConfigGroup').style.display =
      checkKind.value === 'http' ? 'block' : 'none';
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

  document.getElementById('checkFormCancel')?.addEventListener('click', closeModals);
  document.getElementById('checkModalClose')?.addEventListener('click', closeModals);
  document.getElementById('incidentModalClose')?.addEventListener('click', closeModals);

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

  // Initial load
  loadDashboard();

  // Auto refresh every 30 seconds
  state.refreshInterval = setInterval(() => {
    if (state.currentTab === 'overview') {
      loadDashboard();
    }
  }, 30000);
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
    container.innerHTML = `<div class="error">Error cargando destinatarios: ${safeErrorMessage(err)}</div>`;
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
    const r = recipients.find(x => x.id === id);

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
          ${icon} <strong>${data.host}</strong> (${data.ip})<br>
          Estado: ${data.previousState} → ${data.newState}<br>
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
      showToast(fmt(data.error || 'Error simulando alerta'), 'error');
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

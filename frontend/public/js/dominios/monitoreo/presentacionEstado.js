function escapeHtml(value) {
  const str = (value ?? '').toString();
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatearTextoSeguro(value) {
  const limpio = (value ?? '').toString().trim();
  return limpio ? escapeHtml(limpio) : '—';
}

export function badgeEstadoHost(estado) {
  const badges = {
    UP: '<span class="badge badge-up">🟢 UP</span>',
    DOWN: '<span class="badge badge-down">🔴 DOWN</span>',
    DEGRADED: '<span class="badge badge-degraded">🟡 DEGRADED</span>',
    MAINTENANCE: '<span class="badge badge-maintenance">🔧 MAINTENANCE</span>',
    UNKNOWN: '<span class="badge badge-unknown">❓ UNKNOWN</span>'
  };
  return badges[estado] || badges.UNKNOWN;
}

export function badgeSeveridadIncidente(severity) {
  const badges = {
    critical: '<span class="badge badge-critical">🔴 Crítico</span>',
    warning: '<span class="badge badge-warning">🟡 Warning</span>',
    info: '<span class="badge badge-info">🔵 Info</span>'
  };
  return badges[severity] || '';
}

export function badgeEstadoIncidente(state) {
  const badges = {
    open: '<span class="badge badge-down">Abierto</span>',
    ack: '<span class="badge badge-degraded">Reconocido</span>',
    resolved: '<span class="badge badge-up">Resuelto</span>',
    closed: '<span class="badge badge-unknown">Cerrado</span>'
  };
  return badges[state] || '';
}

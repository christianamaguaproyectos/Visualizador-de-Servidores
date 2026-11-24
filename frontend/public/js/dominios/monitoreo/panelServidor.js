/**
 * Panel de telemetría de un servidor: estado actual, una gráfica de onda por check
 * (latencia + franja de disponibilidad) y la línea de tiempo de incidentes.
 * Datos de GET /api/monitoring/telemetry/hosts/:id/series.
 */
import { escapeAttr, escapeHtml } from '/js/dominios/ui-system/seguridadHtml.js';
import { svgOndaLatencia, resumirSerie } from '/js/dominios/monitoreo/graficasOnda.js';
import { normalizarEstado } from '/js/dominios/monitoreo/modeloRacks.js';
import { ETIQUETA_ESTADO } from '/js/dominios/monitoreo/vistaRacks.js';

export const RANGOS = [
  { minutos: 15, texto: '15 min' },
  { minutos: 60, texto: '1 h' },
  { minutos: 360, texto: '6 h' },
  { minutos: 1440, texto: '24 h' }
];

const ESTADO_INCIDENTE = { open: 'Abierto', ack: 'Reconocido', resolved: 'Resuelto', closed: 'Cerrado' };

function fechaHora(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function duracion(desde, hasta) {
  const ms = (hasta ? new Date(hasta) : new Date()) - new Date(desde);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} d`;
}

function hace(ms) {
  if (!ms) return 'sin ejecuciones';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  return `hace ${Math.round(s / 3600)} h`;
}

/** Barra de rango + estado de la actualización en vivo (fuera del área que se refresca) */
export function cabeceraPanel(minutosActivos) {
  return `
    <div class="tele-barra">
      <div class="segmentado" role="group" aria-label="Periodo de las gráficas">
        ${RANGOS.map((r) => `<button type="button" class="segmentado__btn${r.minutos === minutosActivos ? ' activo' : ''}" data-rango="${r.minutos}" aria-pressed="${r.minutos === minutosActivos}">${r.texto}</button>`).join('')}
      </div>
      <span class="en-vivo" data-tele-vivo><span class="en-vivo__punto" aria-hidden="true"></span><span data-tele-hora>Conectando…</span></span>
    </div>
    <div data-tele-cuerpo aria-live="polite"></div>`;
}

export function esqueletoPanel() {
  return `<div class="tele-grid" aria-hidden="true">
    <div class="tele-check tele-check--esqueleto"><div class="esq esq--titulo"></div><div class="esq esq--grafica"></div></div>
    <div class="tele-check tele-check--esqueleto"><div class="esq esq--titulo"></div><div class="esq esq--grafica"></div></div>
  </div>`;
}

function tarjetaCheck(c) {
  const r = resumirSerie(c.points || []);
  const estado = !r.total ? 'UNKNOWN' : (r.ultimoEstado === 'ok' ? 'UP' : 'DOWN');
  const textoEstado = !r.total ? (c.enabled ? 'Esperando datos' : 'Desactivado') : (estado === 'UP' ? 'Responde' : 'Sin respuesta');
  return `
    <section class="tele-check" aria-label="${escapeAttr(`Check ${c.label}`)}">
      <header class="tele-check__cab">
        <span class="led led--${estado}" aria-hidden="true"></span>
        <h4>${escapeHtml(c.label)}</h4>
        <span class="muted">cada ${Number(c.frequency_sec) || '?'} s${c.enabled || r.total ? '' : ' · desactivado'}</span>
        <span class="tele-check__estado tele-check__estado--${estado}">${escapeHtml(textoEstado)}</span>
      </header>
      <div class="tele-metricas">
        <div><span class="tele-metricas__v">${r.ultimaLatencia === null ? '—' : `${r.ultimaLatencia} ms`}</span><span class="tele-metricas__l">Última</span></div>
        <div><span class="tele-metricas__v">${r.media === null ? '—' : `${r.media} ms`}</span><span class="tele-metricas__l">Media</span></div>
        <div><span class="tele-metricas__v">${r.p95 === null ? '—' : `${r.p95} ms`}</span><span class="tele-metricas__l">p95</span></div>
        <div><span class="tele-metricas__v ${r.disponibilidad !== null && r.disponibilidad < 99 ? 'text-danger' : ''}">${r.disponibilidad === null ? '—' : `${r.disponibilidad}%`}</span><span class="tele-metricas__l">Disponibilidad</span></div>
        <div><span class="tele-metricas__v">${r.fallos}</span><span class="tele-metricas__l">Fallos / ${r.total}</span></div>
      </div>
      <div class="tele-grafica">${svgOndaLatencia(c.points || [], { titulo: `Latencia de ${c.label}` })}</div>
      <p class="tele-check__pie muted">Última ejecución ${escapeHtml(hace(r.ultimaHora))} · franja inferior: disponibilidad por ejecución (verde OK, rojo fallo, ámbar lento o timeout)</p>
    </section>`;
}

function lineaIncidentes(incidentes) {
  if (!incidentes.length) return '<p class="muted">Sin incidentes registrados para este servidor.</p>';
  return `<ol class="linea-tiempo">${incidentes.map((i) => `
    <li class="linea-tiempo__item linea-tiempo__item--${escapeAttr(i.state)}">
      <button type="button" class="linea-tiempo__btn" data-incident-id="${escapeAttr(i.id)}" aria-label="${escapeAttr(`Ver incidente ${i.id}`)}">
        <span class="linea-tiempo__estado">${escapeHtml(ESTADO_INCIDENTE[i.state] || i.state)}</span>
        <span class="linea-tiempo__resumen">${escapeHtml(i.summary || 'Incidente')}</span>
        <span class="linea-tiempo__fechas muted">
          Abierto ${escapeHtml(fechaHora(i.opened_at))}
          ${i.ack_at ? ` · ACK ${escapeHtml(fechaHora(i.ack_at))}` : ''}
          ${i.closed_at ? ` · Cerrado ${escapeHtml(fechaHora(i.closed_at))}` : ''}
          · ${escapeHtml(duracion(i.opened_at, i.closed_at))}${i.closed_at ? '' : ' en curso'}
        </span>
      </button>
    </li>`).join('')}</ol>`;
}

/** Contenido que se refresca en cada sondeo */
export function cuerpoPanel(datos) {
  const h = datos.host;
  const estado = normalizarEstado(h.estado_actual);
  const checks = datos.checks || [];
  const graficas = checks.length
    ? `<div class="tele-grid">${checks.map(tarjetaCheck).join('')}</div>`
    : '<div class="empty-state">Este servidor no tiene checks configurados. Agregue uno para ver su telemetría.</div>';
  return `
    <div class="tele-estado tele-estado--${estado}">
      <span class="led led--${estado} led--grande" aria-hidden="true"></span>
      <div>
        <strong>${escapeHtml(ETIQUETA_ESTADO[estado])}</strong>
        <span class="muted"> desde ${escapeHtml(fechaHora(h.estado_changed_at))}</span>
        <div class="muted">${escapeHtml(h.ip || 'sin IP')} · ${h.type === 'virtual' ? 'Virtual' : 'Físico'}${h.rack ? ` · ${escapeHtml(h.rack)}` : ''}${h.critical ? ' · <span class="badge badge-critical-small">CRÍTICO</span>' : ''}</div>
      </div>
    </div>
    ${graficas}
    <h4 class="tele-subtitulo">Línea de tiempo de incidentes</h4>
    ${lineaIncidentes(datos.incidents || [])}`;
}

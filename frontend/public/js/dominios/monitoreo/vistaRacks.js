/**
 * Marcado del diagrama en tiempo real de Monitoreo: un gabinete por rack con cada servidor como
 * LED de estado y su mini-onda de latencia, y el detalle de los servidores de un rack.
 * Todo el texto variable pasa por escapeHtml/escapeAttr.
 */
import { escapeAttr, escapeHtml } from '/js/dominios/ui-system/seguridadHtml.js';
import { svgMiniOnda, resumirSerie } from '/js/dominios/monitoreo/graficasOnda.js';
import { normalizarEstado } from '/js/dominios/monitoreo/modeloRacks.js';

export const ETIQUETA_ESTADO = {
  UP: 'Operativo',
  DOWN: 'Caído',
  DEGRADED: 'Degradado',
  MAINTENANCE: 'Mantenimiento',
  UNKNOWN: 'Sin datos'
};
const MAX_FILAS_RACK = 6;

function textoLatencia(serie) {
  const r = resumirSerie(serie);
  if (r.ultimaLatencia !== null) return `${r.ultimaLatencia} ms`;
  if (r.total && r.ultimoEstado !== 'ok') return 'sin respuesta';
  return '—';
}

function led(estado, extra = '') {
  return `<span class="led led--${estado}${extra}" aria-hidden="true"></span>`;
}

function pildoraRack(rack) {
  const c = rack.conteo;
  if (c.DOWN) return `<span class="estado-pill estado-pill--DOWN">${c.DOWN} caído${c.DOWN > 1 ? 's' : ''}</span>`;
  if (c.DEGRADED) return `<span class="estado-pill estado-pill--DEGRADED">${c.DEGRADED} degradado${c.DEGRADED > 1 ? 's' : ''}</span>`;
  if (c.UP && c.UP === rack.total) return '<span class="estado-pill estado-pill--UP">Todo operativo</span>';
  return `<span class="estado-pill estado-pill--${rack.estado}">${ETIQUETA_ESTADO[rack.estado]}</span>`;
}

function filaServidor(h) {
  const estado = normalizarEstado(h.estado_actual);
  const nombre = escapeHtml(h.name);
  return `
    <li>
      <button type="button" class="slot-vivo" data-host-id="${escapeAttr(h.id)}"
        aria-label="${escapeAttr(`${h.name}: ${ETIQUETA_ESTADO[estado]}. Abrir telemetría`)}">
        ${led(estado, h.critical ? ' led--critico' : '')}
        <span class="slot-vivo__nombre">${nombre}</span>
        <span class="slot-vivo__onda">${svgMiniOnda(h.serie || [], { ancho: 72, alto: 22 })}</span>
        <span class="slot-vivo__ms">${escapeHtml(textoLatencia(h.serie || []))}</span>
      </button>
    </li>`;
}

/** Tarjeta-gabinete de un rack */
export function tarjetaRack(rack, { seleccionado = false } = {}) {
  const tipo = rack.tipo === 'virtual' ? 'Host / clúster virtual' : (rack.tipo === 'fisico' ? 'Rack físico' : 'Otros');
  const visibles = rack.hosts.slice(0, MAX_FILAS_RACK);
  const resto = rack.total - visibles.length;
  const leds = rack.hosts.map((h) => {
    const e = normalizarEstado(h.estado_actual);
    return `<button type="button" class="led-btn" data-host-id="${escapeAttr(h.id)}" title="${escapeAttr(`${h.name} · ${ETIQUETA_ESTADO[e]}`)}" aria-label="${escapeAttr(`${h.name}: ${ETIQUETA_ESTADO[e]}`)}">${led(e)}</button>`;
  }).join('');
  return `
    <article class="rack-vivo rack-vivo--${rack.estado}${seleccionado ? ' rack-vivo--sel' : ''}" data-rack="${escapeAttr(rack.nombre)}">
      <header class="rack-vivo__cab">
        <button type="button" class="rack-vivo__abrir" data-rack-abrir="${escapeAttr(rack.nombre)}"
          aria-expanded="${seleccionado ? 'true' : 'false'}" aria-label="${escapeAttr(`Ver los ${rack.total} servidores de ${rack.nombre}`)}">
          <span class="rack-vivo__tipo">${escapeHtml(tipo)}</span>
          <span class="rack-vivo__nombre">${escapeHtml(rack.nombre)}</span>
        </button>
        ${pildoraRack(rack)}
      </header>
      <div class="rack-vivo__leds" aria-label="Estado de cada servidor">${leds}</div>
      <ul class="rack-vivo__slots">${visibles.map(filaServidor).join('')}</ul>
      <footer class="rack-vivo__pie">
        <span>${rack.total} servidor${rack.total === 1 ? '' : 'es'}${rack.incidentes ? ` · <strong class="text-danger">${rack.incidentes} incidente${rack.incidentes === 1 ? '' : 's'}</strong>` : ''}</span>
        <button type="button" class="enlace-btn" data-rack-abrir="${escapeAttr(rack.nombre)}">${resto > 0 ? `+${resto} más · ` : ''}Ver rack →</button>
      </footer>
    </article>`;
}

/** Esqueleto inmediato mientras llega la primera respuesta */
export function esqueletoRacks(n = 4) {
  const tarjeta = `
    <div class="rack-vivo rack-vivo--esqueleto" aria-hidden="true">
      <div class="esq esq--titulo"></div>
      <div class="esq esq--leds"></div>
      <div class="esq esq--fila"></div><div class="esq esq--fila"></div><div class="esq esq--fila"></div>
    </div>`;
  return Array.from({ length: n }, () => tarjeta).join('');
}

/** Detalle de un rack: tarjeta grande por servidor */
export function detalleRack(rack) {
  if (!rack) return '';
  const tarjetas = rack.hosts.map((h) => {
    const estado = normalizarEstado(h.estado_actual);
    const r = resumirSerie(h.serie || []);
    return `
      <button type="button" class="srv-vivo srv-vivo--${estado}" data-host-id="${escapeAttr(h.id)}"
        aria-label="${escapeAttr(`Abrir telemetría de ${h.name}`)}">
        <span class="srv-vivo__cab">
          ${led(estado, h.critical ? ' led--critico' : '')}
          <span class="srv-vivo__nombre">${escapeHtml(h.name)}</span>
          ${h.critical ? '<span class="badge badge-critical-small">CRÍTICO</span>' : ''}
        </span>
        <span class="srv-vivo__meta">${escapeHtml(h.ip || 'sin IP')} · ${h.type === 'virtual' ? 'Virtual' : 'Físico'} · ${escapeHtml(ETIQUETA_ESTADO[estado])}</span>
        <span class="srv-vivo__onda">${svgMiniOnda(h.serie || [], { ancho: 240, alto: 44 })}</span>
        <span class="srv-vivo__datos">
          <span><strong>${escapeHtml(textoLatencia(h.serie || []))}</strong> última</span>
          <span><strong>${r.disponibilidad === null ? '—' : `${r.disponibilidad}%`}</strong> disponib.</span>
          <span><strong>${Number(h.active_checks) || 0}</strong> checks</span>
          ${Number(h.open_incidents) ? `<span class="text-danger"><strong>${Number(h.open_incidents)}</strong> incid.</span>` : ''}
        </span>
      </button>`;
  }).join('');
  return `
    <div class="detalle-rack__cab">
      <h3>Servidores de ${escapeHtml(rack.nombre)} <span class="muted">(${rack.total})</span></h3>
      <button type="button" class="ui-cerrar" data-rack-cerrar aria-label="Cerrar detalle del rack" title="Cerrar">×</button>
    </div>
    <div class="detalle-rack__grid">${tarjetas}</div>`;
}

/**
 * Dibujo de un rack de 42U como gabinete (marco, rieles numerados, unidades libres y
 * servidores en su U) para /fisicos. Devuelve HTML como texto: todos los datos del
 * inventario pasan por escapeHtml/escapeAttr. Sin estilos en línea (CSP): la fila y el
 * alto de cada servidor se expresan con las clases gab-r-N / gab-s-N de fisicos-racks.css.
 *
 * Contrato con el resto de la página:
 *  - servidor: `.gab-srv[data-server-id][data-view="server"]`, arrastrable
 *    (rackDragDrop.js) y con `data-estado` / `data-buscar` para el buscador y el filtro.
 *  - unidad libre: `.gab-libre[data-position]` (destino de arrastre).
 *  - LED de monitoreo: `[data-led-id]`, lo actualiza `aplicarEstadosMonitoreo`.
 */
import { colocarEnRack, UNIDADES_RACK } from './colocacionRack.js';
import { escapeHtml, escapeAttr } from '../ui-system/seguridadHtml.js';

/** Criticidad de inventario (campo "estado" del servidor; "activo" = NO lo marca inactivo) */
export const CRITICIDADES = Object.freeze({
  critico: { texto: 'Crítico', corto: 'CRÍTICO' },
  no_critico: { texto: 'No crítico', corto: 'NO CRÍTICO' },
  mantenimiento: { texto: 'Mantenimiento', corto: 'MANT.' },
  inactivo: { texto: 'Inactivo', corto: 'INACTIVO' },
});

/** Estado de monitoreo (mismos nombres y colores en toda la plataforma) */
export const ESTADOS_MONITOREO = Object.freeze({
  UP: { clase: 'up', texto: 'UP', descripcion: 'En línea' },
  DOWN: { clase: 'down', texto: 'DOWN', descripcion: 'Caído' },
  DEGRADED: { clase: 'degraded', texto: 'DEGRADED', descripcion: 'Degradado' },
  MAINTENANCE: { clase: 'maint', texto: 'MAINT', descripcion: 'En mantenimiento' },
  UNKNOWN: { clase: 'sin', texto: 'SIN DATOS', descripcion: 'Sin monitoreo' },
});

const sinAcentos = (v) => String(v ?? '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Normaliza la criticidad de inventario: critico | no_critico | mantenimiento | inactivo.
 * "NO_CRITICO" / "No crítico" cuentan como no crítico (no contienen la palabra suelta "crítico").
 */
export function normalizarCriticidad(estado, activo) {
  const e = sinAcentos(estado).replace(/[\s-]+/g, '_');
  if (/(^|_)no_?crit/.test(e)) return 'no_critico';
  if (e.includes('crit')) return 'critico';
  if (e.includes('mant')) return 'mantenimiento';
  if (e.includes('inactivo') || e === 'apagado') return 'inactivo';
  const a = sinAcentos(activo);
  if (a === 'no' || a === 'inactivo' || a === 'apagado') return 'inactivo';
  return 'no_critico';
}

/** Clave de ESTADOS_MONITOREO para un estado recibido de la API (o sin monitoreo) */
export function claveMonitoreo(estado) {
  const e = String(estado || '').toUpperCase();
  if (e === 'MAINT') return 'MAINTENANCE';
  return ESTADOS_MONITOREO[e] ? e : 'UNKNOWN';
}

const nombreDe = (s) => s?.nombre || s?.hostname || s?.serverLabel || 'Servidor';

function ledHtml(id, estadoVivo) {
  const m = ESTADOS_MONITOREO[claveMonitoreo(estadoVivo)];
  return `<span class="gab-led gab-led--${m.clase}" data-led-id="${escapeAttr(id)}" role="img" aria-label="Monitoreo: ${escapeAttr(m.descripcion)}"></span>`;
}

/**
 * @param {object} opciones
 * @param {string} opciones.nombreRack
 * @param {Array<object>} opciones.servidores servidores del rack (orden del inventario)
 * @param {Map<string,string>} [opciones.estados] id de servidor → estado de monitoreo
 * @param {boolean} [opciones.grande] gabinete de la vista de detalle (más alto, más datos)
 * @param {boolean} [opciones.detalle] muestra modelo y rango de U (botón "detalles técnicos")
 * @param {boolean} [opciones.numeracionAscendente] etiquetas 1→42 de arriba abajo
 * @returns {{ html: string, ocupadas: number, libres: number, sinUbicar: object[] }}
 */
export function construirGabineteHtml({ nombreRack, servidores = [], estados = new Map(), grande = false, detalle = false, numeracionAscendente = false }) {
  const total = UNIDADES_RACK;
  const colocacion = colocarEnRack(servidores, total);
  const etiquetaU = (indice) => String(numeracionAscendente ? indice + 1 : total - indice).padStart(2, '0');
  const partes = [];

  // Riel izquierdo con la numeración de cada U
  for (let i = 0; i < total; i++) {
    partes.push(`<span class="gab-num gab-r-${i + 1}" aria-hidden="true">${etiquetaU(i)}</span>`);
  }

  // Unidades libres (una por U, destino de arrastre)
  colocacion.porUnidad.forEach((dueno, i) => {
    if (dueno >= 0) return;
    const u = total - i;
    partes.push(`<div class="gab-libre gab-r-${i + 1}" data-position="${u}" data-estado="libre" aria-label="U${u} libre"><span class="gab-libre__u">U${etiquetaU(i)}</span></div>`);
  });

  // Servidores: un bloque por tramo contiguo de unidades
  const vistos = new Set();
  for (const b of colocacion.bloques) {
    const s = b.servidor || {};
    const id = String(s.id ?? '');
    const primero = !vistos.has(id);
    vistos.add(id);
    const crit = normalizarCriticidad(s.estado, s.activo);
    const critInfo = CRITICIDADES[crit];
    const nombre = nombreDe(s);
    const ip = s.ip || '';
    const rango = b.alto > 1 ? `U${b.uInferior}–U${b.uSuperior}` : `U${b.uSuperior}`;
    const modelo = [s.marca, s.modelo].filter(Boolean).join(' ');
    const buscar = [nombre, s.hostname, ip, s.serverLabel, modelo, rango].filter(Boolean).join(' ').toLowerCase();
    const alto = Math.min(b.alto, total);
    const clases = [
      'gab-srv', `gab-srv--${crit.replace('_', '-')}`, `gab-r-${b.inicio + 1}`, `gab-s-${alto}`,
      alto >= 2 ? 'gab-srv--multi' : 'gab-srv--1u', primero ? 'gab-srv--inicio' : 'gab-srv--cont',
    ].join(' ');
    // Etiqueta de criticidad: en la línea del nombre (1U) o en la segunda línea (2U o más)
    const chip = crit !== 'no_critico' ? `<span class="gab-chip gab-chip--${crit.replace('_', '-')}">${escapeHtml(critInfo.corto)}</span>` : '';
    const textoExtra = (grande || detalle) ? escapeHtml([modelo, rango].filter(Boolean).join(' · ')) : '';
    // 2U o más: la IP, la criticidad y el detalle van en una segunda línea
    const ipHtml = `<span class="gab-srv__ip">${escapeHtml(ip)}</span>`;
    const lineaExtra = alto >= 2
      ? `<span class="gab-srv__extra">${ipHtml}${chip}<span class="gab-srv__extra-texto">${textoExtra}</span></span>` : '';
    partes.push(`<div class="${clases}" data-view="server" data-id="${escapeAttr(encodeURIComponent(id))}" data-server-id="${escapeAttr(encodeURIComponent(id))}" data-server-name="${escapeAttr(encodeURIComponent(nombre))}" data-position="${b.uSuperior}" data-u="${escapeAttr(rango)}" data-estado="${crit}" data-buscar="${escapeAttr(buscar)}" data-ip="${escapeAttr(ip)}" ${primero ? 'draggable="true"' : ''} tabindex="0" role="button" aria-label="${escapeAttr(`${nombre} ${ip} · ${rango} · ${critInfo.texto}`)}">
  <span class="gab-srv__oreja" aria-hidden="true"></span>
  <span class="gab-srv__cuerpo">
    <span class="gab-srv__linea">${ledHtml(id, estados.get(id))}<span class="gab-crit gab-crit--${crit.replace('_', '-')}" title="Criticidad: ${escapeAttr(critInfo.texto)}" aria-hidden="true"></span><span class="gab-srv__nombre">${escapeHtml(nombre)}</span>${alto >= 2 ? '' : chip + ipHtml}</span>${lineaExtra}
  </span>
  <span class="gab-srv__bahias" aria-hidden="true"></span>
</div>`);
  }

  const html = `<div class="gab ${grande ? 'gab--grande' : ''} ${detalle ? 'gab--detalle' : ''}" data-rack-name="${escapeAttr(encodeURIComponent(nombreRack))}">
  <div class="gab__techo" aria-hidden="true"><span class="gab__rotulo">${escapeHtml(nombreRack)}</span></div>
  <div class="gab__cuerpo" role="group" aria-label="Rack ${escapeAttr(nombreRack)}: ${colocacion.ocupadas} de ${total} U ocupadas">${partes.join('')}</div>
  <div class="gab__base" aria-hidden="true"><span></span><span></span></div>
</div>`;
  return { html, ocupadas: colocacion.ocupadas, libres: colocacion.libres, sinUbicar: colocacion.sinUbicar };
}

/** Leyenda de criticidad y estado de monitoreo (HTML estático) */
export function construirLeyendaHtml({ conteos = null, nota = 'Clic en un servidor: ficha · Arrastrar a una U libre: mover' } = {}) {
  const crit = Object.entries(CRITICIDADES).map(([k, v]) =>
    `<span class="gab-leyenda__item"><span class="gab-crit gab-crit--${k.replace('_', '-')}" aria-hidden="true"></span>${escapeHtml(v.texto)}</span>`).join('');
  const mon = Object.entries(ESTADOS_MONITOREO).map(([k, v]) => {
    const n = conteos ? ` <strong data-conteo-monitoreo="${k}">${conteos[k] || 0}</strong>` : '';
    return `<span class="gab-leyenda__item" title="${escapeAttr(v.descripcion)}"><span class="gab-led gab-led--${v.clase}" aria-hidden="true"></span>${escapeHtml(v.texto)}${n}</span>`;
  }).join('');
  return `<div class="gab-leyenda" role="note" aria-label="Leyenda de los racks">
  <div class="gab-leyenda__grupo"><span class="gab-leyenda__titulo">Criticidad (inventario)</span>${crit}</div>
  <div class="gab-leyenda__grupo"><span class="gab-leyenda__titulo">Monitoreo (LED)</span>${mon}</div>
  ${nota ? `<div class="gab-leyenda__nota">${escapeHtml(nota)}</div>` : ''}
</div>`;
}

/**
 * Actualiza los LED ya dibujados con los estados de monitoreo y los contadores de la leyenda.
 * @param {ParentNode} raiz
 * @param {Map<string,string>} estados
 */
export function aplicarEstadosMonitoreo(raiz, estados) {
  if (!raiz) return;
  const clases = Object.values(ESTADOS_MONITOREO).map((m) => `gab-led--${m.clase}`);
  raiz.querySelectorAll('[data-led-id]').forEach((led) => {
    const m = ESTADOS_MONITOREO[claveMonitoreo(estados.get(led.getAttribute('data-led-id')))];
    led.classList.remove(...clases);
    led.classList.add(`gab-led--${m.clase}`);
    led.setAttribute('aria-label', `Monitoreo: ${m.descripcion}`);
  });
}

/** Cuenta servidores por estado de monitoreo */
export function contarMonitoreo(servidores, estados) {
  const conteos = {};
  for (const s of servidores) {
    const k = claveMonitoreo(estados.get(String(s.id)));
    conteos[k] = (conteos[k] || 0) + 1;
  }
  return conteos;
}

/** Enlace a la ficha de un servidor (nombre, IP, criticidad y LED) para listas fuera del gabinete */
function itemServidorHtml(s, estados) {
  const id = String(s.id ?? '');
  const crit = normalizarCriticidad(s.estado, s.activo);
  return `<li><button type="button" class="gab-lista__srv" data-view="server" data-id="${escapeAttr(encodeURIComponent(id))}">${ledHtml(id, estados.get(id))}<span class="gab-crit gab-crit--${crit.replace('_', '-')}" aria-hidden="true"></span><span class="gab-lista__nombre">${escapeHtml(nombreDe(s))}</span><span class="gab-lista__ip">${escapeHtml(s.ip || '')}</span></button></li>`;
}

/**
 * Aviso de servidores que no se pueden dibujar en el gabinete (no caben en 42U o su posición
 * está ocupada): se listan para poder abrirlos y corregir su ubicación.
 */
export function construirAvisoSinUbicarHtml(sinUbicar = [], estados = new Map()) {
  if (!sinUbicar.length) return '';
  const n = sinUbicar.length;
  return `<details class="gab-aviso" role="note">
  <summary>⚠ ${n} ${n === 1 ? 'servidor no cabe' : 'servidores no caben'} en el rack o no tiene${n === 1 ? '' : 'n'} posición libre</summary>
  <ul class="gab-lista">${sinUbicar.map((s) => itemServidorHtml(s, estados)).join('')}</ul>
</details>`;
}

/** Tarjeta "Sin rack asignado" con los servidores físicos que no tienen rack */
export function construirSinRackHtml(servidores = [], estados = new Map(), { titulo = 'Sin rack asignado', descripcion = 'Servidores del inventario sin rack. Ábrelos y edítalos para asignarles un rack y una posición.', unidad = 'servidores', limite = 300 } = {}) {
  if (!servidores.length) return '';
  return `<section class="gab-sin-rack" aria-label="${escapeAttr(titulo)}">
  <div class="gab-sin-rack__cab"><h2>${escapeHtml(titulo)}</h2><span class="gab-card__ocup">${servidores.length} ${escapeHtml(unidad)}</span></div>
  <p class="gab-card__sub">${escapeHtml(descripcion)}</p>
  <ul class="gab-lista gab-lista--columnas">${servidores.slice(0, limite).map((s) => itemServidorHtml(s, estados)).join('')}</ul>
  ${servidores.length > limite ? `<p class="gab-card__sub">Se muestran ${limite} de ${servidores.length}. La lista completa está en la exportación a Excel.</p>` : ''}
</section>`;
}

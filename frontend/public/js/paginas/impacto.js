/**
 * /impacto — Impacto de servicios.
 *
 * Muestra cada servicio con sus servidores, la función de cada uno y qué le pasa al servicio
 * si cae; el estado actual según Monitoreo; y una simulación de caídas (no modifica nada).
 * Los administradores registran servicios y los servidores de cada servicio.
 * El DOM se construye con nodos de texto (nunca innerHTML con datos).
 */
import { apiJson } from '../dominios/ui-system/apiFetch.js';
import { confirmAction } from '../dominios/ui-system/modalConfirm.js';

const $ = (sel) => document.querySelector(sel);
const toast = (msg, tipo = 'info', ms) => window.showToast?.(msg, tipo, ms);
const enc = encodeURIComponent;
const INTERVALO_MS = 30000;

const NIVEL = {
  TOTAL: { texto: 'Deja de funcionar', largo: 'Si cae, el servicio deja de funcionar', clase: 'total' },
  PARCIAL: { texto: 'Funciona parcial', largo: 'Si cae, el servicio funciona parcialmente', clase: 'parcial' },
  NINGUNO: { texto: 'Sigue funcionando', largo: 'Si cae, el servicio sigue funcionando', clase: 'ninguno' },
  SIN_DEFINIR: { texto: 'Por definir', largo: 'Falta confirmar qué pasa si cae', clase: 'sin-definir' },
};
const ESTADO_SERVICIO = {
  FUNCIONA: { texto: 'Funciona', clase: 'funciona' },
  PARCIAL: { texto: 'Funciona parcial', clase: 'parcial' },
  NO_FUNCIONA: { texto: 'Deja de funcionar', clase: 'no-funciona' },
  REVISAR: { texto: 'Revisar', clase: 'revisar' },
};

/** Elemento DOM: h('p', { class: 'x', onClick: fn }, 'texto', otroNodo) */
function h(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  const agregar = (lista) => {
    for (const x of lista) {
      if (x === null || x === undefined || x === false) continue;
      if (Array.isArray(x)) agregar(x);
      else e.append(x instanceof Node ? x : document.createTextNode(String(x)));
    }
  };
  agregar(hijos);
  return e;
}

const json = (metodo, cuerpo) => ({
  method: metodo,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(cuerpo ?? {}),
});

const st = {
  esAdmin: false,
  datos: null, // respuesta de GET /api/impacto
  servidorPorId: new Map(),
  idPorEtiqueta: new Map(),
  servicioSel: null,
  simulados: [],
  simulacion: null,
  editando: null, // { tipo: 'servicio'|'componente', id }
};

// ── Utilidades de datos ────────────────────────────────────────────────────
const servidor = (id) => st.servidorPorId.get(String(id));
const nombre = (id) => servidor(id)?.name || `#${id}`;

/** Etiqueta única de un servidor para los buscadores: NOMBRE · IP · host/rack */
function etiquetaServidor(s) {
  const ip = String(s.ip || '').split(/[\s,;]+/).find(Boolean);
  return [s.name, ip, s.type === 'fisicos' ? (s.rack || 'Físico') : (s.rack ? `VM en ${s.rack}` : 'VM')].filter(Boolean).join(' · ');
}

function idDesdeTexto(texto) {
  const t = String(texto || '').trim();
  if (st.idPorEtiqueta.has(t)) return st.idPorEtiqueta.get(t);
  const coincidencias = st.datos.servers.filter((s) => s.name.toLowerCase() === t.toLowerCase());
  return coincidencias.length === 1 ? coincidencias[0].id : null;
}

function ubicacion(s) {
  if (!s) return '';
  if (s.type === 'fisicos') return s.rack ? `Físico · ${s.rack}` : 'Físico';
  const host = st.datos.hosts[s.id];
  return s.rack ? `VM en ${s.rack}${host ? '' : ' (ese host no está en Físicos)'}` : 'VM sin host';
}

// Todos los servidores se muestran en línea: la página sirve para simular caídas
function pildoraEnLinea() {
  return h('span', { class: 'imp-mon imp-mon--up' }, h('span', { class: 'imp-mon__punto', 'aria-hidden': 'true' }), 'En línea');
}

function pildoraNivel(nivel) {
  const n = NIVEL[nivel] || NIVEL.SIN_DEFINIR;
  return h('span', { class: `imp-nivel imp-nivel--${n.clase}`, title: n.largo }, n.texto);
}

function pildoraEstado(estado) {
  const e = ESTADO_SERVICIO[estado] || ESTADO_SERVICIO.FUNCIONA;
  return h('span', { class: `imp-estado imp-estado--${e.clase}` }, e.texto);
}

const MOTIVO = {
  CAIDO: () => 'caído',
  HOST: (por) => `cae con su host ${nombre(por)}`,
  ARRASTRE: (por) => `cae con ${nombre(por)}`,
};
const textoCaida = (c) => (MOTIVO[c.motivo] || MOTIVO.CAIDO)(c.por);

// ── Carga ──────────────────────────────────────────────────────────────────
async function cargar({ silencioso = false } = {}) {
  try {
    const d = await apiJson('/api/impacto');
    st.datos = d;
    st.servidorPorId = new Map(d.servers.map((s) => [String(s.id), s]));
    rellenarBuscador();
    if (!st.servicioSel || !d.services.some((s) => s.id === st.servicioSel)) st.servicioSel = d.services[0]?.id || null;
    $('#imp-hora').textContent = `Monitoreo actualizado ${new Date(d.generatedAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}`;
    render();
    if (st.simulados.length) await simular();
  } catch (err) {
    if (silencioso) return;
    $('#imp-detalle').replaceChildren(h('p', { class: 'imp-error' }, err?.message || 'No se pudo cargar la información'));
  }
}

function rellenarBuscador() {
  st.idPorEtiqueta = new Map();
  const vistas = new Set();
  const opciones = [];
  for (const s of [...st.datos.servers].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))) {
    let etq = etiquetaServidor(s);
    if (vistas.has(etq)) etq = `${etq} · #${s.id}`;
    vistas.add(etq);
    st.idPorEtiqueta.set(etq, s.id);
    opciones.push(h('option', { value: etq }));
  }
  $('#imp-lista-servidores').replaceChildren(...opciones);
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  renderLista();
  renderDetalle();
}

function renderLista() {
  const lista = $('#imp-lista-servicios');
  if (!st.datos.services.length) {
    lista.replaceChildren(h('li', { class: 'imp-vacio' }, st.esAdmin ? 'Aún no hay servicios. Crea el primero con «+ Nuevo».' : 'Aún no hay servicios registrados.'));
    return;
  }
  lista.replaceChildren(...st.datos.services.map((s) => {
    const sim = st.simulacion?.servicios.find((x) => x.serviceId === s.id);
    return h('li', {},
      h('button', {
        type: 'button', class: `imp-servicio${s.id === st.servicioSel ? ' es-activo' : ''}`, 'aria-current': s.id === st.servicioSel ? 'true' : null,
        onClick: () => { st.servicioSel = s.id; render(); },
      },
      h('span', { class: 'imp-servicio__nombre' }, s.name),
      h('span', { class: 'imp-servicio__meta' }, `${s.components.length} servidor${s.components.length === 1 ? '' : 'es'}`),
      // La página es para simular: fuera de la simulación todo servicio se muestra en funcionamiento
      h('span', { class: 'imp-servicio__estados' }, h('span', { class: 'imp-estado imp-estado--funciona' }, 'En funcionamiento'),
        sim && sim.estado !== 'FUNCIONA' ? h('span', { class: 'imp-servicio__sim' }, 'Simulación: ', pildoraEstado(sim.estado)) : null)));
  }));
}

function renderDetalle() {
  const cont = $('#imp-detalle');
  const s = st.datos.services.find((x) => x.id === st.servicioSel);
  if (!s) {
    cont.replaceChildren(h('p', { class: 'imp-vacio' }, 'Elige un servicio de la lista.'));
    return;
  }
  const comps = [...s.components].sort((a, b) => nombre(a.serverId).localeCompare(nombre(b.serverId), 'es', { numeric: true }));

  cont.replaceChildren(...[
    h('div', { class: 'imp-detalle__cabecera' },
      h('div', {},
        h('h2', {}, s.name),
        s.description ? h('p', { class: 'imp-detalle__desc' }, s.description) : null),
      st.esAdmin ? h('div', { class: 'imp-acciones' },
        h('button', { type: 'button', class: 'btn btn-secondary imp-btn-sm', onClick: () => abrirServicio(s) }, 'Editar'),
        h('button', { type: 'button', class: 'btn btn-danger imp-btn-sm', onClick: () => eliminarServicio(s) }, 'Eliminar')) : null),
    h('div', { class: 'imp-seccion__cabecera' },
      h('h3', {}, `Servidores (${comps.length})`),
      st.esAdmin ? h('button', { type: 'button', class: 'btn btn-primary imp-btn-sm', onClick: () => abrirComponente(s, null) }, '+ Agregar servidor') : null),
    bloqueSimulacionServicio(s),
    comps.length ? tablaComponentes(s, comps) : h('p', { class: 'imp-vacio' }, 'Este servicio todavía no tiene servidores.'),
  ].filter(Boolean));
}

/** Resultado de la simulación para un servicio (null si no se simula nada) */
const simulacionDe = (serviceId) => st.simulacion?.servicios.find((x) => x.serviceId === serviceId) || null;

/** Aviso sobre las tarjetas: cómo queda el servicio con la caída simulada */
function bloqueSimulacionServicio(s) {
  const sim = simulacionDe(s.id);
  if (!sim) return null;
  const e = ESTADO_SERVICIO[sim.estado] || ESTADO_SERVICIO.FUNCIONA;
  // Qué sigue en pie del servicio (si el servicio no cae del todo)
  const idsCaidos = new Set(sim.componentesCaidos.map((c) => String(c.serverId)));
  const arrastrados = sim.estado === 'NO_FUNCIONA' ? [] : sim.componentesCaidos.filter((c) => c.caida.motivo === 'ARRASTRE');
  const enPie = sim.estado === 'NO_FUNCIONA' ? [] : (s.components || []).filter((c) => !idsCaidos.has(String(c.serverId)));
  const titulo = {
    NO_FUNCIONA: `${s.name} deja de funcionar`,
    PARCIAL: `${s.name} sigue funcionando, con limitaciones`,
    REVISAR: `${s.name}: falta confirmar el efecto de esta caída`,
    FUNCIONA: `${s.name} sigue funcionando`,
  }[sim.estado] || s.name;
  return h('div', { class: `imp-sim-aviso imp-sim-aviso--${e.clase}`, role: 'status' },
    h('p', { class: 'imp-sim-aviso__titulo' }, h('span', { class: 'imp-sim-aviso__etq' }, 'Simulación'), titulo),
    sim.componentesCaidos.length
      ? h('p', { class: 'imp-sim-aviso__texto' }, `Por la caída de ${sim.componentesCaidos.filter((c) => c.caida.motivo !== 'ARRASTRE').map((c) => nombre(c.serverId)).join(', ')}.`)
      : h('p', { class: 'imp-sim-aviso__texto' }, 'Ningún servidor de este servicio cae con la simulación.'),
    arrastrados.length ? h('p', { class: 'imp-sim-aviso__texto' }, h('strong', {}, 'Dejan de funcionar: '), arrastrados.map((c) => nombre(c.serverId)).join(', '), '.') : null,
    enPie.length ? h('p', { class: 'imp-sim-aviso__texto' }, h('strong', {}, 'Siguen funcionando: '), enPie.map((c) => nombre(c.serverId)).join(', '), '.') : null,
    h('button', { type: 'button', class: 'imp-enlace', onClick: () => { st.simulados = []; simular(); } }, 'Quitar simulación'));
}

/** Nombres de servidores a partir de ids de componentes del servicio */
function nombresComponentes(s, ids) {
  return ids.map((id) => s.components.find((x) => String(x.id) === String(id))).filter(Boolean).map((x) => nombre(x.serverId)).join(', ');
}

/** Una tarjeta por servidor: qué hace, qué pasa si cae y cómo está ahora */
function tablaComponentes(s, comps) {
  const sim = simulacionDe(s.id);
  const caidos = new Map((sim?.componentesCaidos || []).map((c) => [String(c.serverId), c]));
  return h('ul', { class: 'imp-comps' }, comps.map((c) => {
    const sv = servidor(c.serverId);
    const simulado = st.simulados.includes(String(c.serverId));
    // Con la simulación: azul el servidor simulado, rojo lo que deja de funcionar por su caída
    // (todo, si el servicio deja de funcionar) y verde lo que sigue funcionando
    const caida = caidos.get(String(c.serverId));
    let claseSim = '';
    let etiquetaSim = null;
    if (sim && simulado) {
      claseSim = ' es-simulado';
      etiquetaSim = 'Caída simulada';
    } else if (caida || sim?.estado === 'NO_FUNCIONA') {
      claseSim = ' es-caido';
      etiquetaSim = caida && caida.caida.motivo === 'HOST' ? `Deja de funcionar · ${textoCaida(caida.caida)}` : 'Deja de funcionar';
    } else if (sim) {
      claseSim = ' es-funciona';
      etiquetaSim = 'Sigue funcionando';
    }
    const soloEstado = Boolean(sim) && !simulado;
    return h('li', { class: `imp-comp imp-comp--${(NIVEL[c.impact] || NIVEL.SIN_DEFINIR).clase}${claseSim}` },
      etiquetaSim ? h('p', { class: 'imp-comp__sim' }, etiquetaSim) : null,
      h('div', { class: 'imp-comp__cabecera' },
        h('div', {},
          h('h4', { class: 'imp-comp__nombre' }, nombre(c.serverId)),
          h('p', { class: 'imp-comp__sub' }, [String(sv?.ip || '').split(/[\s,;]+/)[0], ubicacion(sv)].filter(Boolean).join(' · '))),
        pildoraEnLinea()),
      h('p', { class: 'imp-comp__rol' }, c.role || 'Función sin describir'),
      // Con la simulación, las tarjetas rojas y verdes solo muestran su estado (la etiqueta de arriba)
      soloEstado ? null : h('div', { class: 'imp-comp__si-cae' },
        h('span', { class: 'imp-comp__etq' }, 'Si cae:'), pildoraNivel(c.impact)),
      !soloEstado && c.impactDetail ? h('p', { class: 'imp-comp__texto' }, c.impactDetail) : null,
      !soloEstado && c.impact !== 'TOTAL' && c.alsoFails?.length
        ? h('p', { class: 'imp-comp__texto' }, h('strong', {}, 'Si cae, también se caen: '), nombresComponentes(s, c.alsoFails))
        : null,
      h('div', { class: 'imp-comp__acciones' },
        h('button', {
          type: 'button', class: `btn ${simulado ? 'btn-danger' : 'btn-secondary'} imp-btn-sm`, 'aria-pressed': simulado ? 'true' : 'false',
          onClick: () => alternarSimulado(c.serverId),
        }, simulado ? 'Quitar simulación' : 'Simular caída'),
        st.esAdmin ? h('button', { type: 'button', class: 'imp-enlace', onClick: () => abrirComponente(s, c) }, 'Editar') : null,
        st.esAdmin ? h('button', { type: 'button', class: 'imp-enlace imp-enlace--peligro', onClick: () => eliminarComponente(c) }, 'Quitar') : null));
  }));
}

// ── Simulación ─────────────────────────────────────────────────────────────
function alternarSimulado(id) {
  const k = String(id);
  st.simulados = st.simulados.includes(k) ? st.simulados.filter((x) => x !== k) : [...st.simulados, k];
  simular();
}

let peticionSim = 0;
async function simular() {
  const mia = ++peticionSim;
  if (!st.simulados.length) {
    st.simulacion = null;
    render();
    return;
  }
  try {
    const r = await apiJson(`/api/impacto/simular?ids=${enc(st.simulados.join(','))}`);
    if (mia !== peticionSim) return;
    st.simulacion = r;
    render();
  } catch (err) {
    if (mia === peticionSim) toast(err?.message || 'No se pudo simular', 'error');
  }
}

// ── Formularios (administradores) ──────────────────────────────────────────
function abrirDialogo(dialogo) {
  dialogo.showModal();
  dialogo.querySelector('input, select, textarea')?.focus();
}
document.querySelectorAll('.imp-dialogo [data-cerrar]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

function abrirServicio(s) {
  st.editando = { tipo: 'servicio', id: s?.id || null };
  $('#imp-dialogo-servicio-titulo').textContent = s ? 'Editar servicio' : 'Nuevo servicio';
  $('#imp-servicio-nombre').value = s?.name || '';
  $('#imp-servicio-desc').value = s?.description || '';
  abrirDialogo($('#imp-dialogo-servicio'));
}

$('#imp-form-servicio').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const datos = { name: $('#imp-servicio-nombre').value, description: $('#imp-servicio-desc').value };
  try {
    const id = st.editando?.id;
    const r = id
      ? await apiJson(`/api/impacto/servicios/${enc(id)}`, json('PUT', datos))
      : await apiJson('/api/impacto/servicios', json('POST', datos));
    st.servicioSel = r.service.id;
    $('#imp-dialogo-servicio').close();
    toast('Servicio guardado', 'success', 2500);
    await cargar();
  } catch (err) { toast(err?.message || 'No se pudo guardar', 'error'); }
});

async function eliminarServicio(s) {
  const ok = await confirmAction({ title: 'Eliminar servicio', message: `¿Eliminar «${s.name}» y la información de sus servidores? Los servidores del inventario no se tocan.`, confirmText: 'Eliminar' });
  if (!ok) return;
  try {
    await apiJson(`/api/impacto/servicios/${enc(s.id)}`, { method: 'DELETE' });
    st.servicioSel = null;
    toast('Servicio eliminado', 'success', 2500);
    await cargar();
  } catch (err) { toast(err?.message || 'No se pudo eliminar', 'error'); }
}

function abrirComponente(s, c) {
  st.editando = { tipo: 'componente', id: c?.id || null, serviceId: s.id };
  $('#imp-dialogo-componente-titulo').textContent = c ? `Editar ${nombre(c.serverId)}` : `Agregar servidor a ${s.name}`;
  const campo = $('#imp-comp-servidor');
  campo.value = c ? [...st.idPorEtiqueta].find(([, id]) => String(id) === String(c.serverId))?.[0] || nombre(c.serverId) : '';
  campo.disabled = Boolean(c);
  $('#imp-comp-rol').value = c?.role || '';
  // «Funciona parcial» ya no se ofrece: solo aparece al editar un servidor que lo tenía guardado
  $('#imp-comp-impacto-parcial').hidden = c?.impact !== 'PARCIAL';
  $('#imp-comp-impacto-parcial').disabled = c?.impact !== 'PARCIAL';
  $('#imp-comp-impacto').value = c?.impact || 'SIN_DEFINIR';
  $('#imp-comp-detalle').value = c?.impactDetail || '';
  // Casillas: los demás servidores del servicio que también caen si cae este
  const otros = s.components.filter((x) => !c || String(x.id) !== String(c.id))
    .sort((a, b) => nombre(a.serverId).localeCompare(nombre(b.serverId), 'es', { numeric: true }));
  const marcados = new Set((c?.alsoFails || []).map(String));
  $('#imp-comp-caen').replaceChildren(...otros.map((x) => h('label', { class: 'imp-caen__opcion' },
    h('input', { type: 'checkbox', value: x.id, ...(marcados.has(String(x.id)) ? { checked: '' } : {}) }),
    nombre(x.serverId))));
  actualizarCaen();
  abrirDialogo($('#imp-dialogo-componente'));
}

/** Con «Deja de funcionar» cae todo el servicio: las casillas no hacen falta */
function actualizarCaen() {
  const total = $('#imp-comp-impacto').value === 'TOTAL';
  const casillas = [...$('#imp-comp-caen').querySelectorAll('input')];
  for (const x of casillas) x.disabled = total;
  $('#imp-comp-caen-ayuda').textContent = total
    ? 'Con «Deja de funcionar» se cae todo el servicio.'
    : casillas.length ? 'Marca los que se caen junto con este. Los demás seguirán funcionando.' : 'Aún no hay otros servidores en este servicio.';
}
$('#imp-comp-impacto').addEventListener('change', actualizarCaen);

$('#imp-form-componente').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const datos = {
    role: $('#imp-comp-rol').value,
    impact: $('#imp-comp-impacto').value,
    impactDetail: $('#imp-comp-detalle').value,
    alsoFails: $('#imp-comp-impacto').value === 'TOTAL' ? []
      : [...$('#imp-comp-caen').querySelectorAll('input:checked')].map((x) => x.value),
  };
  try {
    const { id, serviceId } = st.editando;
    if (id) {
      await apiJson(`/api/impacto/componentes/${enc(id)}`, json('PUT', datos));
    } else {
      const serverId = idDesdeTexto($('#imp-comp-servidor').value);
      if (!serverId) { toast('Elige el servidor de la lista', 'warning'); return; }
      await apiJson(`/api/impacto/servicios/${enc(serviceId)}/componentes`, json('POST', { ...datos, serverId }));
    }
    $('#imp-dialogo-componente').close();
    toast('Servidor guardado', 'success', 2500);
    await cargar();
  } catch (err) { toast(err?.message || 'No se pudo guardar', 'error'); }
});

async function eliminarComponente(c) {
  const ok = await confirmAction({ title: 'Quitar servidor del servicio', message: `¿Quitar ${nombre(c.serverId)} de este servicio? El servidor sigue en el inventario.`, confirmText: 'Quitar' });
  if (!ok) return;
  try {
    await apiJson(`/api/impacto/componentes/${enc(c.id)}`, { method: 'DELETE' });
    await cargar();
  } catch (err) { toast(err?.message || 'No se pudo quitar', 'error'); }
}

$('#imp-nuevo-servicio').addEventListener('click', () => abrirServicio(null));

// ── Arranque ───────────────────────────────────────────────────────────────
async function iniciar() {
  try {
    const r = await apiJson('/api/auth/user');
    const u = r?.user;
    st.esAdmin = Boolean(u && (u.role === 'admin' || u.role === 'superadmin' || u.isSuperAdmin));
  } catch { st.esAdmin = false; }
  document.querySelectorAll('.imp-solo-admin').forEach((e) => { e.hidden = !st.esAdmin; });
  await cargar();
  // El estado de Monitoreo se refresca solo mientras la pestaña está visible
  setInterval(() => { if (document.visibilityState === 'visible') cargar({ silencioso: true }); }, INTERVALO_MS);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();

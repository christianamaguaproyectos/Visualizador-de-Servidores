/**
 * Editor 2D estilo Draw.io: SVG con tarjetas arrastrables (ajuste a 10 px),
 * 4 puertos por tarjeta, conexión arrastrando con línea guía, flechas Bézier,
 * zoom al cursor, paneo y encuadre.
 *
 * Los colores se escriben como atributos de presentación SVG (fill, stroke…), no
 * como style="": así la CSP no los bloquea y la exportación SVG es fiel sin CSS.
 */
import { ESTADOS, COLOR_CAIDA, TIPOS_DEPENDENCIA, CRITICIDADES, TIPOS_SERVIDOR, SEPARACION, TARJETA, textoTipo, colorDeNodo, pildoraImpacto } from './constantesVisuales.js';
import { indicesParalelas, desplazamientoLateral, trazado2D, caminoSvg, caminoGuia, puntoPuerto } from './geometriaAristas.js';

const SVG = 'http://www.w3.org/2000/svg';
const W = TARJETA.ancho;
const H = TARJETA.alto;
const K_MIN = 0.25;
const K_MAX = 2.5;
const FUENTE = 'Inter, "Segoe UI", Arial, sans-serif';
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';

const el = (tag, attrs = {}, padre = null) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, String(v));
  if (padre) padre.appendChild(e);
  return e;
};

// Medición de texto sin layout (sirve aunque el SVG esté oculto)
const ctxMedida = document.createElement('canvas').getContext('2d');
function anchoTexto(texto, fuente) {
  ctxMedida.font = fuente;
  return ctxMedida.measureText(texto).width;
}
function recortar(texto, max, fuente) {
  if (anchoTexto(texto, fuente) <= max) return texto;
  let t = texto;
  while (t.length > 1 && anchoTexto(`${t}…`, fuente) > max) t = t.slice(0, -1);
  return `${t}…`;
}

function colorBorde(n) {
  return n.isDown || n.cascadeStatus !== 'NONE' ? colorDeNodo(n) : null;
}

export function crearLienzo2D({ contenedor, estado, alClicNodo, alClicArista, alClicVacio, alConectar, alSoltarNodo, alCambiarVista, nombreDe }) {
  const svg = el('svg', { class: 'topo-2d', 'aria-hidden': 'true', role: 'presentation' });
  contenedor.appendChild(svg);
  const defs = el('defs', {}, svg);
  // Cuadrícula: menor 10 px y mayor 50 px
  const patMenor = el('pattern', { id: 'topo-rejilla-menor', width: 10, height: 10, patternUnits: 'userSpaceOnUse' }, defs);
  el('path', { d: 'M10 0 L0 0 0 10', fill: 'none', stroke: '#e9eef5', 'stroke-width': 1 }, patMenor);
  const patMayor = el('pattern', { id: 'topo-rejilla', width: 50, height: 50, patternUnits: 'userSpaceOnUse' }, defs);
  el('rect', { width: 50, height: 50, fill: 'url(#topo-rejilla-menor)' }, patMayor);
  el('path', { d: 'M50 0 L0 0 0 50', fill: 'none', stroke: '#dbe3ee', 'stroke-width': 1 }, patMayor);
  const filtro = el('filter', { id: 'topo-sombra', x: '-10%', y: '-10%', width: '120%', height: '140%' }, defs);
  el('feDropShadow', { dx: 0, dy: 1, stdDeviation: 1.5, 'flood-color': '#101828', 'flood-opacity': 0.12 }, filtro);
  const clip = el('clipPath', { id: 'topo-clip-tarjeta' }, defs);
  el('rect', { width: W, height: H, rx: TARJETA.radio }, clip);
  const marcadores = { ...Object.fromEntries(Object.entries(TIPOS_DEPENDENCIA).map(([k, v]) => [k, v.color2d])), IMPACTO: COLOR_CAIDA, GUIA: '#2f6fe6' };
  for (const [tipo, color] of Object.entries(marcadores)) {
    const m = el('marker', { id: `topo-flecha-${tipo}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
    m.setAttribute('markerWidth', '12'); m.setAttribute('markerHeight', '12');
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }, m);
  }

  const fondo = el('rect', { class: 'topo-2d__fondo', x: 0, y: 0, width: '100%', height: '100%', fill: '#f8fafc' }, svg);
  const rejilla = el('rect', { class: 'topo-2d__rejilla', x: 0, y: 0, width: '100%', height: '100%', fill: 'url(#topo-rejilla)' }, svg);
  const mundo = el('g', { id: 'topo-mundo' }, svg);
  const capaAristas = el('g', { class: 'topo-aristas' }, mundo);
  const capaEtiquetas = el('g', { class: 'topo-etiquetas-aristas' }, mundo);
  const capaNodos = el('g', { class: 'topo-nodos' }, mundo);
  const guia = el('path', { class: 'topo-guia', fill: 'none', stroke: '#2f6fe6', 'stroke-width': 2, 'stroke-dasharray': '4 4', 'marker-end': 'url(#topo-flecha-GUIA)' }, mundo);
  guia.setAttribute('visibility', 'hidden');

  let vista = { tx: 80, ty: 80, k: 1 };
  let nodosG = new Map();
  let aristasG = new Map();
  let paralelas = new Map();
  let visible = false;

  function aplicarVista() {
    mundo.setAttribute('transform', `translate(${vista.tx.toFixed(1)},${vista.ty.toFixed(1)}) scale(${vista.k.toFixed(4)})`);
    patMayor.setAttribute('patternTransform', `translate(${vista.tx.toFixed(1)},${vista.ty.toFixed(1)}) scale(${vista.k.toFixed(4)})`);
    if (alCambiarVista) alCambiarVista();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function renderizar() {
    capaNodos.replaceChildren();
    capaAristas.replaceChildren();
    capaEtiquetas.replaceChildren();
    nodosG = new Map();
    aristasG = new Map();
    const nodos = estado.nodosVisibles();
    const aristas = estado.aristasVisibles(nodos);
    paralelas = indicesParalelas(aristas);
    for (const e of aristas) crearArista(e);
    for (const n of nodos) crearTarjeta(n);
    actualizarEstilos();
  }

  function crearTarjeta(n) {
    const id = String(n.id);
    const p = estado.posiciones.get(id) || { x: 0, y: 0 };
    const g = el('g', { class: 'topo-nodo', 'data-id': id, transform: `translate(${p.x},${p.y})` }, capaNodos);
    const halo = el('rect', { class: 'topo-nodo__halo', x: -4, y: -4, width: W + 8, height: H + 8, rx: TARJETA.radio + 4, fill: 'none', stroke: 'rgba(240,68,56,0.25)', 'stroke-width': 8 }, g);
    const caja = el('rect', { class: 'topo-nodo__caja', width: W, height: H, rx: TARJETA.radio, fill: '#ffffff', stroke: '#d0d5dd', 'stroke-width': 1, filter: 'url(#topo-sombra)' }, g);
    const franja = el('rect', { width: 4, height: H, fill: '#98a2b3', 'clip-path': 'url(#topo-clip-tarjeta)' }, g);
    const fis = n.type === 'fisicos';
    const tipo = TIPOS_SERVIDOR[n.type] || TIPOS_SERVIDOR.virtuales;
    const fBadge = `700 11px ${FUENTE}`;
    const anchoBadge = anchoTexto(tipo.badge, fBadge) + 14;
    el('rect', { x: 14, y: 10, width: anchoBadge, height: 18, rx: 5, fill: fis ? '#114bb5' : '#ffffff', stroke: fis ? 'none' : '#2f6fe6', 'stroke-width': 1 }, g);
    const tb = el('text', { x: 14 + anchoBadge / 2, y: 23, 'text-anchor': 'middle', 'font-family': FUENTE, 'font-size': 11, 'font-weight': 700, 'letter-spacing': '0.04em', fill: fis ? '#ffffff' : '#114bb5' }, g);
    tb.textContent = tipo.badge;
    const fRack = `500 12px ${FUENTE}`;
    const rack = el('text', { x: W - 12, y: 23, 'text-anchor': 'end', 'font-family': FUENTE, 'font-size': 12, fill: '#667085' }, g);
    rack.textContent = recortar(n.rack || '', W - 40 - anchoBadge, fRack);
    const fNombre = `600 14px ${FUENTE}`;
    const nombre = el('text', { x: 14, y: 48, 'font-family': FUENTE, 'font-size': 14, 'font-weight': 600, fill: '#1d2939' }, g);
    nombre.textContent = recortar(n.name || `Servidor ${id}`, W - 28, fNombre);
    const ip = el('text', { x: 14, y: 66, 'font-family': MONO, 'font-size': 12, fill: '#475467' }, g);
    ip.textContent = recortar(n.ip || '—', W - 28, `12px ${MONO}`);
    const punto = el('circle', { cx: 18, cy: 81, r: 4, fill: '#98a2b3' }, g);
    const textoEstado = el('text', { x: 27, y: 85, 'font-family': FUENTE, 'font-size': 12, 'font-weight': 600, fill: '#667085' }, g);
    const contadores = el('text', { x: W - 12, y: 85, 'text-anchor': 'end', 'font-family': FUENTE, 'font-size': 12, fill: '#667085' }, g);
    contadores.textContent = `⇢ ${n.dependsOnServerCount} · ⇠ ${n.dependentServerCount}`;
    const titulo = el('title', {}, g);
    titulo.textContent = `${n.name} (${n.ip || 'sin IP'})`;
    // Píldora de impacto sobre el borde superior
    const pildora = el('g', { class: 'topo-nodo__pildora' }, g);
    // Puertos (solo admin; visibles en hover por CSS)
    const puertos = el('g', { class: 'topo-puertos' }, g);
    if (estado.esAdmin) {
      for (const lado of ['N', 'S', 'E', 'O']) {
        const [px, py] = puntoPuerto({ x: 0, y: 0 }, lado, W, H);
        const pg = el('g', { class: 'topo-puerto', 'data-puerto': lado }, puertos);
        el('circle', { cx: px, cy: py, r: 8, fill: 'transparent', class: 'topo-puerto__zona' }, pg);
        el('circle', { cx: px, cy: py, r: 5, fill: '#ffffff', stroke: '#2f6fe6', 'stroke-width': 2 }, pg);
      }
    }
    nodosG.set(id, { g, halo, caja, franja, punto, textoEstado, pildora, nodo: n });
  }

  function crearArista(e) {
    const id = String(e.id);
    const g = el('g', { class: 'topo-arista', 'data-id': id }, capaAristas);
    const zona = el('path', { class: 'topo-arista__zona', fill: 'none', stroke: 'transparent', 'stroke-width': 12 }, g);
    const linea = el('path', { class: 'topo-arista__linea', fill: 'none' }, g);
    const etq = el('g', { class: 'topo-arista__etq', 'data-id': id }, capaEtiquetas);
    const rect = el('rect', { rx: 9, height: 18, fill: '#ffffff', 'stroke-width': 1 }, etq);
    const texto = el('text', { 'font-family': FUENTE, 'font-size': 12, 'font-weight': 600, 'text-anchor': 'middle' }, etq);
    const t = `${textoTipo(e.dependencyType)}${e.port ? ` · :${e.port}` : ''}`;
    texto.textContent = t;
    const ancho = anchoTexto(t, `600 12px ${FUENTE}`) + 14;
    rect.setAttribute('width', ancho.toFixed(1));
    aristasG.set(id, { g, zona, linea, etq, rect, texto, ancho, arista: e });
    trazarArista(id);
  }

  function trazarArista(id) {
    const reg = aristasG.get(id);
    if (!reg) return;
    const e = reg.arista;
    const pa = estado.posiciones.get(String(e.source));
    const pb = estado.posiciones.get(String(e.target));
    if (!pa || !pb) return;
    const k = paralelas.get(id) || 0;
    const off = desplazamientoLateral(e, k, { base: SEPARACION.bidireccional2d, paso: SEPARACION.paralela2d });
    const tr = trazado2D(pa, pb, e.source, e.target, off, W, H);
    const d = caminoSvg(tr);
    reg.linea.setAttribute('d', d);
    reg.zona.setAttribute('d', d);
    reg.medio = tr.medio;
    reg.etq.setAttribute('transform', `translate(${(tr.medio[0] - reg.ancho / 2).toFixed(1)},${(tr.medio[1] - 9).toFixed(1)})`);
    reg.texto.setAttribute('x', (reg.ancho / 2).toFixed(1));
    reg.texto.setAttribute('y', '13');
  }

  function actualizarEstilos() {
    const sel = estado.seleccion;
    const hov = estado.hover;
    const anim = estado.animaciones;
    for (const [id, r] of nodosG) {
      const n = estado.nodoPorId.get(id) || r.nodo;
      r.nodo = n;
      const est = ESTADOS[n.status] || ESTADOS.UNKNOWN;
      const borde = colorBorde(n);
      const seleccionado = sel?.tipo === 'nodo' && sel.id === id;
      r.franja.setAttribute('fill', borde && n.isDown ? borde : est.color);
      r.punto.setAttribute('fill', est.color);
      r.textoEstado.setAttribute('fill', est.color === ESTADOS.UNKNOWN.color ? '#667085' : est.color);
      r.textoEstado.textContent = est.texto;
      let stroke = '#d0d5dd'; let sw = 1; let dash = null;
      if (borde) { stroke = borde; sw = 2; }
      if (n.downSource === 'SIMULATED') dash = '6 4';
      if (seleccionado) { stroke = '#1d5ed8'; sw = borde ? 3 : 2; }
      r.caja.setAttribute('stroke', stroke);
      r.caja.setAttribute('stroke-width', sw);
      if (dash) r.caja.setAttribute('stroke-dasharray', dash); else r.caja.removeAttribute('stroke-dasharray');
      const caidoReal = n.isDown && n.downSource !== 'SIMULATED';
      r.halo.setAttribute('visibility', caidoReal ? 'visible' : 'hidden');
      r.halo.setAttribute('stroke', borde === ESTADOS.DEGRADED.color ? 'rgba(245,158,11,0.25)' : 'rgba(240,68,56,0.25)');
      r.halo.classList.toggle('es-latido', caidoReal && anim);
      r.g.setAttribute('opacity', estado.nodoAtenuado(n) ? '0.2' : '1');
      r.g.classList.toggle('es-hover', hov?.tipo === 'nodo' && hov.id === id);
      r.g.classList.toggle('es-seleccionado', seleccionado);
      // Píldora
      r.pildora.replaceChildren();
      const p = pildoraImpacto(n, nombreDe);
      if (p) {
        const f = `600 12px ${FUENTE}`;
        const texto = recortar(p.texto, W - 24, f);
        const ancho = anchoTexto(texto, f) + 16;
        const colores = {
          caido: ['#f04438', '#ffffff', null], degradado: ['#f59e0b', '#1d2939', null], simulado: ['#ffffff', '#b42318', '#f04438'],
          directo: ['#f97316', '#ffffff', null], transitivo: ['#fbbf24', '#1d2939', null],
        }[p.clase];
        el('rect', { x: W - 10 - ancho, y: -11, width: ancho, height: 20, rx: 10, fill: colores[0], stroke: colores[2] || 'none', 'stroke-width': 1.5, 'stroke-dasharray': colores[2] ? '4 3' : null }, r.pildora);
        const t = el('text', { x: W - 10 - ancho / 2, y: 3, 'text-anchor': 'middle', 'font-family': FUENTE, 'font-size': 12, 'font-weight': 600, fill: colores[1] }, r.pildora);
        t.textContent = texto;
      }
    }
    for (const [id, r] of aristasG) {
      const e = estado.aristaPorId.get(id) || r.arista;
      r.arista = e;
      const crit = CRITICIDADES[e.criticality] || CRITICIDADES.MEDIUM;
      const tipo = TIPOS_DEPENDENCIA[e.dependencyType] || TIPOS_DEPENDENCIA.SERVICE;
      const color = e.carriesImpact ? COLOR_CAIDA : tipo.color2d;
      const seleccionada = sel?.tipo === 'arista' && sel.id === id;
      const hover = hov?.tipo === 'arista' && hov.id === id;
      const incidente = hov?.tipo === 'nodo' && (String(e.source) === hov.id || String(e.target) === hov.id);
      r.linea.setAttribute('stroke', color);
      r.linea.setAttribute('stroke-width', crit.trazo2d + (seleccionada || hover ? 1.5 : 0));
      r.linea.setAttribute('marker-end', `url(#topo-flecha-${e.carriesImpact ? 'IMPACTO' : e.dependencyType})`);
      const dash = e.carriesImpact ? '8 6' : crit.discontinuo ? '6 4' : null;
      if (dash) r.linea.setAttribute('stroke-dasharray', dash); else r.linea.removeAttribute('stroke-dasharray');
      r.linea.classList.toggle('es-impacto', Boolean(e.carriesImpact) && anim);
      r.rect.setAttribute('stroke', color);
      r.texto.setAttribute('fill', color);
      const atenuada = estado.aristaAtenuada(e) || (hov?.tipo === 'nodo' && !incidente);
      const op = estado.aristaAtenuada(e) ? 0.2 : atenuada ? 0.4 : 1;
      r.g.setAttribute('opacity', op);
      r.etq.setAttribute('opacity', op);
      r.g.classList.toggle('es-seleccionada', seleccionada);
    }
  }

  function actualizarPosiciones(ids) {
    const afectados = new Set();
    for (const id of ids) {
      const r = nodosG.get(String(id));
      const p = estado.posiciones.get(String(id));
      if (r && p) r.g.setAttribute('transform', `translate(${p.x},${p.y})`);
      for (const [aid, a] of aristasG) if (String(a.arista.source) === String(id) || String(a.arista.target) === String(id)) afectados.add(aid);
    }
    for (const aid of afectados) trazarArista(aid);
  }

  // ── Coordenadas ──────────────────────────────────────────────────────────
  function aMundo(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return [(clientX - r.left - vista.tx) / vista.k, (clientY - r.top - vista.ty) / vista.k];
  }

  function zoomEn(factor, cx, cy) {
    const k = Math.min(K_MAX, Math.max(K_MIN, vista.k * factor));
    vista.tx = cx - ((cx - vista.tx) * k) / vista.k;
    vista.ty = cy - ((cy - vista.ty) * k) / vista.k;
    vista.k = k;
    aplicarVista();
  }

  function zoom(factor) {
    zoomEn(factor, svg.clientWidth / 2, svg.clientHeight / 2);
  }
  function zoom100() { zoomEn(1 / vista.k, svg.clientWidth / 2, svg.clientHeight / 2); }

  function cajaNodos() {
    const ids = [...nodosG.keys()];
    if (!ids.length) return null;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const id of ids) {
      const p = estado.posiciones.get(id);
      if (!p) continue;
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y - 12); x1 = Math.max(x1, p.x + W); y1 = Math.max(y1, p.y + H);
    }
    return { x0, y0, x1, y1 };
  }

  function encajar() {
    const c = cajaNodos();
    const w = svg.clientWidth || contenedor.clientWidth; const h = svg.clientHeight || contenedor.clientHeight;
    if (!c || !w || !h) return;
    const margen = 60;
    const k = Math.min(K_MAX, Math.max(K_MIN, Math.min((w - margen * 2) / (c.x1 - c.x0), (h - margen * 2) / (c.y1 - c.y0), 1.2)));
    vista = { k, tx: (w - (c.x1 - c.x0) * k) / 2 - c.x0 * k, ty: (h - (c.y1 - c.y0) * k) / 2 - c.y0 * k };
    aplicarVista();
  }

  function centrarEnPx(x, y) {
    vista.tx = svg.clientWidth / 2 - x * vista.k;
    vista.ty = svg.clientHeight / 2 - y * vista.k;
    aplicarVista();
  }

  function enfocarNodo(id) {
    const p = estado.posiciones.get(String(id));
    if (!p) return false;
    centrarEnPx(p.x + W / 2, p.y + H / 2);
    return true;
  }

  /** Rectángulo visible en px del mundo (minimapa) */
  function rectVisible() {
    const w = svg.clientWidth; const h = svg.clientHeight;
    return { x: -vista.tx / vista.k, y: -vista.ty / vista.k, w: w / vista.k, h: h / vista.k };
  }

  // ── Interacción ──────────────────────────────────────────────────────────
  let arrastre = null; // {tipo:'nodo'|'pan'|'conexion', ...}

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const r = svg.getBoundingClientRect();
    if (ev.ctrlKey || ev.metaKey) {
      zoomEn(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
    } else {
      vista.tx -= ev.deltaX; vista.ty -= ev.deltaY;
      aplicarVista();
    }
  }, { passive: false });

  svg.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const puerto = ev.target.closest('.topo-puerto');
    const nodoEl = ev.target.closest('.topo-nodo');
    const aristaEl = ev.target.closest('.topo-arista, .topo-arista__etq');
    svg.setPointerCapture(ev.pointerId);
    if (puerto && nodoEl && estado.esAdmin) {
      const id = nodoEl.dataset.id;
      const p = estado.posiciones.get(id);
      const lado = puerto.dataset.puerto;
      arrastre = { tipo: 'conexion', origen: id, lado, inicio: puntoPuerto(p, lado, W, H), destino: null };
      guia.setAttribute('visibility', 'visible');
      guia.setAttribute('d', caminoGuia(arrastre.inicio, lado, arrastre.inicio));
      svg.classList.add('es-conectando');
      return;
    }
    if (nodoEl) {
      const id = nodoEl.dataset.id;
      const p = estado.posiciones.get(id);
      const [mx, my] = aMundo(ev.clientX, ev.clientY);
      arrastre = { tipo: 'nodo', id, dx: mx - p.x, dy: my - p.y, x0: ev.clientX, y0: ev.clientY, movido: false };
      nodoEl.parentNode.appendChild(nodoEl); // al frente
      return;
    }
    if (aristaEl) {
      arrastre = { tipo: 'clicArista', id: aristaEl.dataset.id };
      return;
    }
    arrastre = { tipo: 'pan', x0: ev.clientX, y0: ev.clientY, tx: vista.tx, ty: vista.ty, movido: false };
    svg.classList.add('es-paneando');
  });

  svg.addEventListener('pointermove', (ev) => {
    if (!arrastre) {
      const nodoEl = ev.target.closest('.topo-nodo');
      const aristaEl = ev.target.closest('.topo-arista, .topo-arista__etq');
      estado.fijarHover(nodoEl ? { tipo: 'nodo', id: nodoEl.dataset.id } : aristaEl ? { tipo: 'arista', id: aristaEl.dataset.id } : null);
      return;
    }
    if (arrastre.tipo === 'pan') {
      const dx = ev.clientX - arrastre.x0; const dy = ev.clientY - arrastre.y0;
      if (Math.hypot(dx, dy) > 3) arrastre.movido = true;
      vista.tx = arrastre.tx + dx; vista.ty = arrastre.ty + dy;
      aplicarVista();
    } else if (arrastre.tipo === 'nodo') {
      if (!arrastre.movido && Math.hypot(ev.clientX - arrastre.x0, ev.clientY - arrastre.y0) < 4) return;
      arrastre.movido = true;
      const [mx, my] = aMundo(ev.clientX, ev.clientY);
      const r = TARJETA.rejilla;
      const x = Math.round((mx - arrastre.dx) / r) * r;
      const y = Math.round((my - arrastre.dy) / r) * r;
      estado.moverNodo(arrastre.id, x, y, { emitir: false });
      actualizarPosiciones([arrastre.id]);
      if (alCambiarVista) alCambiarVista();
    } else if (arrastre.tipo === 'conexion') {
      const destinoMundo = aMundo(ev.clientX, ev.clientY);
      guia.setAttribute('d', caminoGuia(arrastre.inicio, arrastre.lado, destinoMundo));
      const bajo = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.topo-nodo');
      for (const r of nodosG.values()) r.g.classList.remove('es-destino-valido', 'es-destino-invalido');
      arrastre.destino = null;
      if (bajo) {
        const valido = bajo.dataset.id !== arrastre.origen;
        bajo.classList.add(valido ? 'es-destino-valido' : 'es-destino-invalido');
        if (valido) arrastre.destino = bajo.dataset.id;
      }
    }
  });

  function terminar(ev) {
    if (!arrastre) return;
    const a = arrastre;
    arrastre = null;
    svg.classList.remove('es-paneando', 'es-conectando');
    try { svg.releasePointerCapture(ev.pointerId); } catch { /* ya liberado */ }
    if (a.tipo === 'pan' && !a.movido) alClicVacio();
    else if (a.tipo === 'nodo') {
      if (a.movido) {
        estado.emitir('posiciones', { ids: [a.id] });
        alSoltarNodo(a.id);
      } else alClicNodo(a.id, ev);
    } else if (a.tipo === 'clicArista') alClicArista(a.id, ev);
    else if (a.tipo === 'conexion') {
      guia.setAttribute('visibility', 'hidden');
      for (const r of nodosG.values()) r.g.classList.remove('es-destino-valido', 'es-destino-invalido');
      if (a.destino) alConectar(a.origen, a.destino);
    }
  }
  svg.addEventListener('pointerup', terminar);
  svg.addEventListener('pointercancel', terminar);
  svg.addEventListener('pointerleave', () => { if (!arrastre) estado.fijarHover(null); });

  // ── Exportación ──────────────────────────────────────────────────────────
  /** SVG autónomo del diagrama (sin puertos ni guía) */
  function exportarSVG(titulo) {
    const c = cajaNodos() || { x0: 0, y0: 0, x1: 400, y1: 300 };
    const m = 40;
    const ancho = Math.ceil(c.x1 - c.x0 + m * 2);
    const alto = Math.ceil(c.y1 - c.y0 + m * 2 + 30);
    const copia = mundo.cloneNode(true);
    copia.removeAttribute('id');
    copia.setAttribute('transform', `translate(${m - c.x0},${m - c.y0})`);
    copia.querySelectorAll('.topo-puertos, .topo-guia, title').forEach((n) => n.remove());
    copia.querySelectorAll('[visibility="hidden"]').forEach((n) => n.remove());
    const xml = new XMLSerializer();
    const estilo = `text{font-family:${FUENTE}}.topo-arista__zona{display:none}`;
    const pie = `<text x="${m}" y="${alto - 14}" font-family="${escaparXml(FUENTE)}" font-size="12" fill="#667085">${escaparXml(titulo)}</text>`;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="${SVG}" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}"><style>${estilo}</style>${xml.serializeToString(defs)}<rect width="100%" height="100%" fill="#ffffff"/>${xml.serializeToString(copia)}${pie}</svg>`;
  }

  return {
    renderizar,
    actualizarEstilos,
    actualizarPosiciones,
    encajar,
    zoom,
    zoom100,
    centrarEnPx,
    enfocarNodo,
    rectVisible,
    exportarSVG,
    aMundo,
    pan(dx, dy) { vista.tx += dx; vista.ty += dy; aplicarVista(); },
    obtenerViewport: () => ({ zoom: Number(vista.k.toFixed(4)), x: Math.round(vista.tx), y: Math.round(vista.ty) }),
    fijarViewport(vp) {
      if (!vp || !(vp.zoom > 0)) return false;
      if (vp.zoom === 1 && vp.x === 0 && vp.y === 0) return false; // viewport por defecto: mejor encajar
      vista = { k: Math.min(K_MAX, Math.max(K_MIN, vp.zoom)), tx: vp.x, ty: vp.y };
      aplicarVista();
      return true;
    },
    mostrar(v) { visible = v; svg.classList.toggle('is-hidden', !v); },
    estaVisible: () => visible,
    svg,
  };
}

function escaparXml(s) {
  return String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

export { escaparXml };

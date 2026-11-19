/**
 * Minimapa SVG 200×130 compartido por ambos modos (§8): nodos como puntos coloreados
 * por estado, aristas como líneas finas, y el encuadre (rectángulo en 2D, trapecio
 * de la huella de la cámara en 3D). Clic o arrastre centra la vista.
 */
import { colorDeNodo, TARJETA } from './constantesVisuales.js';

const SVG = 'http://www.w3.org/2000/svg';
const ANCHO = 200;
const ALTO = 130;
const MARGEN = 8;

export function crearMinimapa({ raiz, estado, centrar }) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`);
  svg.setAttribute('width', ANCHO);
  svg.setAttribute('height', ALTO);
  svg.setAttribute('class', 'topo-minimapa__svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Minimapa: clic para centrar la vista');
  raiz.querySelector('.topo-minimapa__cuerpo').appendChild(svg);
  const gAristas = document.createElementNS(SVG, 'g');
  const gNodos = document.createElementNS(SVG, 'g');
  const encuadre = document.createElementNS(SVG, 'polygon');
  encuadre.setAttribute('class', 'topo-minimapa__encuadre');
  encuadre.setAttribute('fill', 'rgba(47,111,230,0.12)');
  encuadre.setAttribute('stroke', '#2f6fe6');
  encuadre.setAttribute('stroke-width', '1.2');
  svg.append(gAristas, gNodos, encuadre);

  raiz.querySelector('.topo-minimapa__plegar').addEventListener('click', (ev) => {
    const plegado = raiz.classList.toggle('es-plegado');
    ev.currentTarget.setAttribute('aria-expanded', plegado ? 'false' : 'true');
  });

  let trans = { s: 1, ox: 0, oy: 0 };

  function centroNodo(id) {
    const p = estado.posiciones.get(String(id));
    return p ? [p.x + TARJETA.ancho / 2, p.y + TARJETA.alto / 2] : null;
  }

  function renderizar() {
    const nodos = estado.nodosVisibles();
    const aristas = estado.aristasVisibles(nodos);
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const n of nodos) {
      const c = centroNodo(n.id);
      if (!c) continue;
      x0 = Math.min(x0, c[0] - TARJETA.ancho / 2); x1 = Math.max(x1, c[0] + TARJETA.ancho / 2);
      y0 = Math.min(y0, c[1] - TARJETA.alto / 2); y1 = Math.max(y1, c[1] + TARJETA.alto / 2);
    }
    if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = 400; y1 = 300; }
    const s = Math.min((ANCHO - MARGEN * 2) / (x1 - x0 || 1), (ALTO - MARGEN * 2) / (y1 - y0 || 1));
    trans = { s, ox: (ANCHO - (x1 - x0) * s) / 2 - x0 * s, oy: (ALTO - (y1 - y0) * s) / 2 - y0 * s };
    const m = ([x, y]) => [x * trans.s + trans.ox, y * trans.s + trans.oy];
    gAristas.replaceChildren();
    gNodos.replaceChildren();
    for (const e of aristas) {
      const a = centroNodo(e.source); const b = centroNodo(e.target);
      if (!a || !b) continue;
      const [ax, ay] = m(a); const [bx, by] = m(b);
      const l = document.createElementNS(SVG, 'line');
      l.setAttribute('x1', ax.toFixed(1)); l.setAttribute('y1', ay.toFixed(1));
      l.setAttribute('x2', bx.toFixed(1)); l.setAttribute('y2', by.toFixed(1));
      l.setAttribute('stroke', e.carriesImpact ? '#f04438' : '#98a2b3');
      l.setAttribute('stroke-width', '0.6');
      gAristas.appendChild(l);
    }
    for (const n of nodos) {
      const c = centroNodo(n.id);
      if (!c) continue;
      const [x, y] = m(c);
      const r = document.createElementNS(SVG, 'circle');
      r.setAttribute('cx', x.toFixed(1)); r.setAttribute('cy', y.toFixed(1)); r.setAttribute('r', '2.6');
      r.setAttribute('fill', colorDeNodo(n));
      if (estado.nodoAtenuado(n)) r.setAttribute('opacity', '0.3');
      gNodos.appendChild(r);
    }
  }

  /** @param {number[][]} puntos esquinas del encuadre en px del mundo 2D */
  function fijarEncuadre(puntos) {
    if (!puntos?.length) { encuadre.setAttribute('points', ''); return; }
    const pts = puntos.map(([x, y]) => {
      const mx = Math.max(-50, Math.min(ANCHO + 50, x * trans.s + trans.ox));
      const my = Math.max(-50, Math.min(ALTO + 50, y * trans.s + trans.oy));
      return `${mx.toFixed(1)},${my.toFixed(1)}`;
    });
    encuadre.setAttribute('points', pts.join(' '));
  }

  let arrastrando = false;
  function aMundo(ev) {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * ANCHO;
    const y = ((ev.clientY - r.top) / r.height) * ALTO;
    return [(x - trans.ox) / trans.s, (y - trans.oy) / trans.s];
  }
  svg.addEventListener('pointerdown', (ev) => { arrastrando = true; svg.setPointerCapture(ev.pointerId); centrar(...aMundo(ev)); });
  svg.addEventListener('pointermove', (ev) => { if (arrastrando) centrar(...aMundo(ev)); });
  svg.addEventListener('pointerup', () => { arrastrando = false; });

  return { renderizar, fijarEncuadre };
}

/**
 * Lista accesible: tabla alternativa con la misma información que la escena.
 */
import { h, atraparFoco } from './dom.js';
import { ESTADOS, TIPOS_SERVIDOR, pildoraImpacto } from './constantesVisuales.js';

export function crearListaAccesible({ raiz, estado, acciones }) {
  const cuerpo = raiz.querySelector('tbody');
  let liberar = null;
  let previo = null;
  raiz.querySelectorAll('[data-accion="cerrar-lista"]').forEach((b) => b.addEventListener('click', cerrar));
  raiz.addEventListener('click', (ev) => { if (ev.target === raiz) cerrar(); });
  raiz.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); cerrar(); } });
  const nombreDe = (id) => estado.nodoPorId.get(String(id))?.name || `#${id}`;

  function render() {
    const nodos = [...estado.nodosVisibles()].sort((a, b) => a.name.localeCompare(b.name));
    cuerpo.replaceChildren(...nodos.map((n) => {
      const id = String(n.id);
      const dep = estado.grafo.edges.filter((e) => String(e.source) === id).map((e) => nombreDe(e.target));
      const dependen = estado.grafo.edges.filter((e) => String(e.target) === id).map((e) => nombreDe(e.source));
      const p = pildoraImpacto(n, nombreDe);
      return h('tr', {},
        h('th', { scope: 'row' }, n.name),
        h('td', {}, (TIPOS_SERVIDOR[n.type] || TIPOS_SERVIDOR.virtuales).texto),
        h('td', { class: 'topo-mono' }, n.ip || '—'),
        h('td', {}, (ESTADOS[n.status] || ESTADOS.UNKNOWN).texto),
        h('td', {}, p ? p.texto : '—'),
        h('td', {}, [...new Set(dep)].join(', ') || '—'),
        h('td', {}, [...new Set(dependen)].join(', ') || '—'),
        h('td', { class: 'topo-lista__acciones' },
          h('button', { type: 'button', class: 'btn btn-secondary topo-btn-sm', onClick: () => { cerrar(); acciones.inspeccionar(id); } }, 'Inspeccionar'),
          h('button', { type: 'button', class: 'btn btn-secondary topo-btn-sm', onClick: () => { cerrar(); acciones.enfocar(id); } }, 'Enfocar'),
          h('button', { type: 'button', class: 'btn btn-secondary topo-btn-sm', onClick: () => { cerrar(); acciones.simular(id); } }, 'Simular')));
    }));
  }

  function abrir() {
    render();
    previo = document.activeElement;
    raiz.hidden = false;
    liberar = atraparFoco(raiz);
    raiz.querySelector('[data-accion="cerrar-lista"]').focus();
  }
  function cerrar() {
    if (raiz.hidden) return;
    raiz.hidden = true;
    if (liberar) liberar();
    if (previo && document.body.contains(previo)) previo.focus();
  }
  return { abrir, cerrar, render, estaAbierta: () => !raiz.hidden };
}

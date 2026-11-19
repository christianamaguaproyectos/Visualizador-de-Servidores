/**
 * Paleta del Editor 2D: servidores sin posición en la vista. Se arrastran al lienzo
 * (o se pulsa "Agregar" para colocarlos en el centro).
 */
import { h } from './dom.js';
import { TIPOS_SERVIDOR } from './constantesVisuales.js';

export function crearPaleta({ raiz, estado, obtenerCatalogo, agregar }) {
  const lista = raiz.querySelector('.topo-paleta__lista');
  const buscador = raiz.querySelector('.topo-paleta__buscar');
  const plegar = raiz.querySelector('.topo-paleta__plegar');
  buscador.addEventListener('input', render);
  plegar.addEventListener('click', () => fijarPlegada(!raiz.classList.contains('es-plegada')));

  function fijarPlegada(v) {
    raiz.classList.toggle('es-plegada', v);
    plegar.setAttribute('aria-expanded', v ? 'false' : 'true');
    plegar.setAttribute('aria-label', v ? 'Mostrar paleta de servidores' : 'Plegar paleta de servidores');
  }
  fijarPlegada(window.innerWidth < 1440);

  function render() {
    const q = buscador.value.trim().toLowerCase();
    const enVista = new Set([...estado.posiciones.keys()]);
    const libres = obtenerCatalogo()
      .filter((s) => !enVista.has(String(s.id)))
      .filter((s) => !q || `${s.name} ${s.ip || ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!libres.length) {
      lista.replaceChildren(h('li', { class: 'topo-paleta__vacio' }, q ? 'Sin coincidencias' : 'Todos los servidores están en la vista'));
      return;
    }
    lista.replaceChildren(...libres.map((s) => h('li', {
      class: 'topo-paleta__item', draggable: 'true', dataset: { id: String(s.id) },
      onDragstart: (ev) => { ev.dataTransfer.setData('text/plain', `topo-servidor:${s.id}`); ev.dataTransfer.effectAllowed = 'copy'; },
    },
    h('span', { class: `topo-badge ${s.type === 'fisicos' ? 'topo-badge--fisico' : 'topo-badge--vm-claro'}` }, (TIPOS_SERVIDOR[s.type] || TIPOS_SERVIDOR.virtuales).badge),
    h('span', { class: 'topo-paleta__nombre' }, h('span', {}, s.name), h('span', { class: 'topo-mono topo-paleta__ip' }, s.ip || '')),
    h('button', { type: 'button', class: 'topo-icon-btn', 'aria-label': `Agregar ${s.name} al lienzo`, title: 'Agregar al centro', onClick: () => agregar(String(s.id), null) }, '+'))));
  }

  return { render, fijarPlegada };
}

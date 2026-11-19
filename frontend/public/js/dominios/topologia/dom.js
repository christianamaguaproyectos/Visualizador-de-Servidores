/**
 * Ayudante mínimo para construir DOM sin innerHTML con datos (anti-XSS).
 * h('button', { class: 'btn', type: 'button', onClick: fn }, 'Texto', otroNodo)
 * - Los textos se insertan siempre como nodos de texto.
 * - Las claves on* registran eventos; nunca se escriben atributos style ni on*.
 */
export function h(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') e.className = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k === 'style') throw new Error('Sin estilos inline: usa clases');
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  agregar(e, hijos);
  return e;
}

function agregar(padre, hijos) {
  for (const hijo of hijos) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    if (Array.isArray(hijo)) agregar(padre, hijo);
    else padre.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}

/** Icono SVG fijo (marcado propio, sin datos) */
const ICONOS = {
  cerrar: '<path d="M18 6L6 18M6 6l12 12"/>',
  enfocar: '<circle cx="12" cy="12" r="3"/><path d="M3 9V5a2 2 0 012-2h4M15 3h4a2 2 0 012 2v4M21 15v4a2 2 0 01-2 2h-4M9 21H5a2 2 0 01-2-2v-4"/>',
  rayo: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  papelera: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  enlace: '<path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7"/>',
  invertir: '<path d="M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4"/>',
  alerta: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
};
export function icono(nombre, tam = 16) {
  const span = document.createElement('span');
  span.className = 'topo-icono';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONOS[nombre] || ''}</svg>`;
  return span;
}

/** Fecha corta local: 19/11/2026 10:42 */
export function fechaCorta(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Atrapa el foco dentro de un diálogo; devuelve la función para liberarlo */
export function atraparFoco(dialogo) {
  const enfocables = () => [...dialogo.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((e) => !e.closest('[hidden]'));
  const alTeclear = (ev) => {
    if (ev.key !== 'Tab') return;
    const lista = enfocables();
    if (!lista.length) return;
    const primero = lista[0]; const ultimo = lista[lista.length - 1];
    if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus(); }
    else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
  };
  dialogo.addEventListener('keydown', alTeclear);
  return () => dialogo.removeEventListener('keydown', alTeclear);
}

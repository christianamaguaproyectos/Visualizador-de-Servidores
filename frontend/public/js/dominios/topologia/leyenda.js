/**
 * Leyenda generada desde las constantes visuales (la misma fuente que dibuja la escena).
 */
import { h } from './dom.js';
import { ESTADOS, IMPACTO, TIPOS_DEPENDENCIA, CRITICIDADES } from './constantesVisuales.js';

export function crearLeyenda({ raiz, estado }) {
  const boton = raiz.querySelector('.topo-leyenda__boton');
  const cuerpo = raiz.querySelector('.topo-leyenda__cuerpo');

  function fijarAbierta(v) {
    cuerpo.hidden = !v;
    boton.setAttribute('aria-expanded', v ? 'true' : 'false');
  }
  boton.addEventListener('click', () => fijarAbierta(cuerpo.hidden));
  // Abierta por defecto solo en pantallas anchas (≥1600): a 1440 tapaba la primera columna de nodos
  fijarAbierta(window.innerWidth >= 1600);

  function muestraColor(color, clase = '') {
    const s = h('span', { class: `topo-leyenda__muestra ${clase}`, 'aria-hidden': 'true' });
    s.style.setProperty('--muestra', color);
    return s;
  }

  function render() {
    const es2d = estado.modo === '2d';
    cuerpo.replaceChildren(
      h('h3', {}, 'Estado'),
      h('ul', { class: 'topo-leyenda__lista' },
        Object.values(ESTADOS).map((e) => h('li', {}, muestraColor(e.color, 'topo-leyenda__muestra--punto'), `${e.texto} · ${e.descripcion}`)),
        Object.values(IMPACTO).map((e) => h('li', {}, muestraColor(e.color, 'topo-leyenda__muestra--anillo'), e.texto))),
      h('h3', {}, 'Tipo de dependencia'),
      h('ul', { class: 'topo-leyenda__lista topo-leyenda__lista--2col' },
        Object.values(TIPOS_DEPENDENCIA).map((t) => h('li', {}, muestraColor(es2d ? t.color2d : t.color, 'topo-leyenda__muestra--linea'), t.corto))),
      h('h3', {}, 'Criticidad (grosor)'),
      h('ul', { class: 'topo-leyenda__lista topo-leyenda__lista--2col' },
        Object.entries(CRITICIDADES).map(([k, c]) => h('li', {}, h('span', { class: `topo-leyenda__grosor topo-leyenda__grosor--${k.toLowerCase()}`, 'aria-hidden': 'true' }), c.texto))),
      h('p', { class: 'topo-leyenda__nota' }, es2d
        ? 'Flecha: del servidor que depende al proveedor. Línea roja animada: propagación de la caída.'
        : 'Partículas: flujo de la petición (origen → proveedor). Partículas rojas: propagación de la caída.'),
      h('p', { class: 'topo-leyenda__badges' },
        h('span', { class: 'topo-badge topo-badge--fisico' }, 'FÍSICO'), es2d ? ' tarjeta con franja de estado' : ' chasis con bahías y pedestal redondo',
        h('br'),
        h('span', { class: `topo-badge ${es2d ? 'topo-badge--vm-claro' : 'topo-badge--vm-claro'}` }, 'VM'), es2d ? ' máquina virtual' : ' cubo translúcido y pedestal hexagonal'),
    );
  }
  return { render, fijarAbierta };
}

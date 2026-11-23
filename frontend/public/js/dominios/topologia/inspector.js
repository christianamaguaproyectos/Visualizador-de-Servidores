/**
 * Panel Inspector compartido por el 3D y el 2D. Muestra el nodo o la arista
 * seleccionados y sus acciones. El "Análisis" se carga bajo demanda.
 */
import { h, icono, fechaCorta } from './dom.js';
import { ESTADOS, TIPOS_SERVIDOR, TIPOS_DEPENDENCIA, textoCriticidad, textoTipo, pildoraImpacto, colorDeNodo } from './constantesVisuales.js';
import { analisisImpacto } from './apiTopologia.js';

export function crearInspector({ raiz, estado, acciones }) {
  const cuerpo = raiz.querySelector('.topo-inspector__cuerpo');
  const titulo = raiz.querySelector('.topo-inspector__titulo');
  raiz.querySelector('.topo-inspector__cerrar').addEventListener('click', () => acciones.cerrar());
  let peticion = 0;

  const nombreDe = (id) => estado.nodoPorId.get(String(id))?.name || `#${id}`;

  function pildoraEstado(status) {
    const e = ESTADOS[status] || ESTADOS.UNKNOWN;
    return h('span', { class: `topo-pill-estado topo-pill-estado--${String(status || 'UNKNOWN').toLowerCase()}` },
      h('span', { class: 'topo-pill-estado__punto', 'aria-hidden': 'true' }), e.texto);
  }

  function chipArista(e) {
    return h('span', { class: `topo-chip topo-chip--${String(e.dependencyType).toLowerCase()}` }, textoTipo(e.dependencyType));
  }

  function filaDato(etq, valor, clase = '') {
    return [h('dt', {}, etq), h('dd', { class: clase }, valor ?? '—')];
  }

  function listaRelaciones(aristas, lado) {
    if (!aristas.length) return h('p', { class: 'topo-insp__vacio' }, lado === 'out' ? 'No depende de ningún servidor.' : 'Ningún servidor depende de él.');
    return h('ul', { class: 'topo-insp__rels' }, aristas.map((e) => {
      const otro = lado === 'out' ? e.target : e.source;
      return h('li', { class: 'topo-insp__rel' },
        h('button', { type: 'button', class: 'topo-enlace', onClick: () => acciones.seleccionar({ tipo: 'nodo', id: otro }) }, nombreDe(otro)),
        h('span', { class: 'topo-insp__rel-meta' }, chipArista(e), h('span', { class: `topo-crit topo-crit--${String(e.criticality).toLowerCase()}` }, textoCriticidad(e.criticality))),
        h('span', { class: 'topo-insp__rel-acciones' },
          h('button', { type: 'button', class: 'topo-icon-btn', title: 'Ver relación', 'aria-label': `Ver relación con ${nombreDe(otro)}`, onClick: () => acciones.seleccionar({ tipo: 'arista', id: e.id }) }, icono('enlace', 14)),
          estado.esAdmin ? h('button', { type: 'button', class: 'topo-icon-btn topo-icon-btn--peligro', title: 'Eliminar relación', 'aria-label': `Eliminar relación con ${nombreDe(otro)}`, onClick: () => acciones.eliminarArista(e) }, icono('papelera', 14)) : null));
    }));
  }

  function renderNodo(n) {
    const id = String(n.id);
    const tipo = TIPOS_SERVIDOR[n.type] || TIPOS_SERVIDOR.virtuales;
    titulo.textContent = 'Servidor';
    const salientes = estado.grafo.edges.filter((e) => String(e.source) === id);
    const entrantes = estado.grafo.edges.filter((e) => String(e.target) === id);
    const p = pildoraImpacto(n, nombreDe);
    const analisis = h('div', { class: 'topo-insp__analisis' },
      h('button', { type: 'button', class: 'btn btn-secondary topo-btn-sm', onClick: (ev) => cargarAnalisis(id, ev.currentTarget.parentNode) }, 'Ver análisis de impacto'));
    const bloques = [
      h('div', { class: 'topo-insp__cabecera' },
        h('span', { class: `topo-badge ${n.type === 'fisicos' ? 'topo-badge--fisico' : 'topo-badge--vm-claro'}` }, tipo.badge),
        h('h2', { class: 'topo-insp__nombre', title: n.name }, n.name),
        h('div', { class: 'topo-insp__pills' }, pildoraEstado(n.status), p ? h('span', { class: `topo-pildora topo-pildora--${p.clase}` }, p.texto) : null)),
      h('dl', { class: 'topo-insp__datos' },
        filaDato('IP', n.ip, 'topo-mono'),
        filaDato('Hostname', n.hostname, 'topo-mono'),
        filaDato(n.type === 'fisicos' ? 'Rack' : 'Host', n.rack),
        filaDato('Inventario', n.estadoInventario),
        filaDato('Monitoreo', n.monitoring ? `${(ESTADOS[n.status] || ESTADOS.UNKNOWN).descripcion} desde ${fechaCorta(n.monitoring.changedAt)}` : 'Sin host de monitoreo')),
    ];
    if (n.isDown || n.cascadeStatus !== 'NONE') {
      const ruta = n.impactPath?.length ? n.impactPath : [id];
      bloques.push(h('section', { class: 'topo-insp__seccion topo-insp__impacto' },
        h('h3', {}, 'Impacto'),
        n.isDown
          ? h('p', {}, n.downSource === 'SIMULATED' ? 'Caída simulada (no modifica datos).' : 'Raíz de la caída según monitoreo.')
          : h('p', {}, `Afectado por ${(n.impactedByServers || []).map(nombreDe).join(', ')} (nivel ${n.impactLevel}).`),
        n.isDown ? null : h('ol', { class: 'topo-migas', 'aria-label': 'Ruta de propagación' }, ruta.map((r) => h('li', {}, nombreDe(r))))));
    }
    bloques.push(
      h('section', { class: 'topo-insp__seccion' }, h('h3', {}, `Depende de (${salientes.length})`), listaRelaciones(salientes, 'out')),
      h('section', { class: 'topo-insp__seccion' }, h('h3', {}, `Dependen de él (${entrantes.length})`), listaRelaciones(entrantes, 'in')),
      h('section', { class: 'topo-insp__seccion' }, h('h3', {}, 'Análisis'), analisis),
      h('div', { class: 'topo-insp__acciones' },
        h('button', { type: 'button', class: 'btn btn-secondary topo-btn-sm', onClick: () => acciones.enfocar(id) }, icono('enfocar', 14), 'Enfocar'),
        h('button', { type: 'button', class: 'btn btn-secondary topo-btn-sm', onClick: () => acciones.simular(id) }, icono('rayo', 14), estado.simulados.has(id) ? 'Quitar simulación' : 'Simular caída'),
        estado.esAdmin ? h('button', { type: 'button', class: 'btn btn-primary topo-btn-sm', onClick: () => acciones.nuevaRelacion({ origen: id }) }, icono('mas', 14), 'Relación desde aquí') : null,
        h('a', { class: 'btn btn-secondary topo-btn-sm', href: tipo.ruta }, 'Ver en inventario')),
    );
    cuerpo.replaceChildren(...bloques);
  }

  async function cargarAnalisis(id, contenedor) {
    const mio = ++peticion;
    contenedor.replaceChildren(h('p', { class: 'topo-insp__vacio' }, 'Cargando análisis…'));
    try {
      const a = await analisisImpacto(id);
      if (mio !== peticion) return;
      const ciclos = a.cycles || [];
      contenedor.replaceChildren(...[
        h('dl', { class: 'topo-insp__datos' },
          filaDato('Afectados si cae', String(a.totalAffected)),
          filaDato('Depende (directo)', String(a.dependsOnDirect.length)),
          filaDato('Depende (cascada)', String(a.dependsOnTransitive.length)),
          filaDato('Dependientes', `${a.dependentsDirect.length} directos · ${a.dependentsTransitive.length} en cascada`)),
        h('h4', { class: 'topo-insp__sub' }, `Ciclos (${ciclos.length})`),
        ciclos.length
          ? h('ul', { class: 'topo-insp__ciclos' }, ciclos.map((c) => h('li', { class: 'topo-mono' }, c.map(nombreDe).join(' → '))))
          : h('p', { class: 'topo-insp__vacio' }, 'Sin ciclos.'),
        a.cyclesTruncated ? h('p', { class: 'topo-aviso-texto' }, 'Lista truncada: hay más ciclos de los que se muestran.') : null,
      ].filter(Boolean));
    } catch (err) {
      if (mio !== peticion) return;
      contenedor.replaceChildren(h('p', { class: 'topo-aviso-texto' }, err?.message || 'No se pudo cargar el análisis.'));
    }
  }

  function renderArista(e) {
    titulo.textContent = 'Relación';
    const tipo = TIPOS_DEPENDENCIA[e.dependencyType];
    cuerpo.replaceChildren(...[
      h('div', { class: 'topo-insp__cabecera' },
        h('div', { class: 'topo-insp__ruta' },
          h('button', { type: 'button', class: 'topo-enlace', onClick: () => acciones.seleccionar({ tipo: 'nodo', id: e.source }) }, e.sourceName || nombreDe(e.source)),
          h('span', { class: 'topo-insp__flecha', 'aria-label': 'depende de' }, '→'),
          h('button', { type: 'button', class: 'topo-enlace', onClick: () => acciones.seleccionar({ tipo: 'nodo', id: e.target }) }, e.targetName || nombreDe(e.target))),
        h('div', { class: 'topo-insp__pills' }, chipArista(e),
          h('span', { class: `topo-crit topo-crit--${String(e.criticality).toLowerCase()}` }, textoCriticidad(e.criticality)),
          e.isBidirectionalPair ? h('span', { class: 'topo-pildora topo-pildora--neutra' }, 'Relación mutua') : null,
          e.carriesImpact ? h('span', { class: 'topo-pildora topo-pildora--caido' }, 'Transporta impacto') : null)),
      h('dl', { class: 'topo-insp__datos' },
        filaDato('Tipo', tipo ? tipo.largo : e.dependencyType),
        filaDato('Criticidad', textoCriticidad(e.criticality)),
        filaDato('Puerto / protocolo', e.port || e.protocol ? `${e.protocol || '—'} ${e.port ? `:${e.port}` : ''}` : '—', 'topo-mono'),
        filaDato('Etiqueta', e.label),
        filaDato('Notas', e.notes, 'topo-insp__notas'),
        filaDato('Creada por', e.createdBy),
        filaDato('Fecha', fechaCorta(e.createdAt))),
      estado.esAdmin ? h('div', { class: 'topo-insp__acciones' },
        h('button', { type: 'button', class: 'btn btn-secondary topo-btn-sm', onClick: () => acciones.editarArista(e) }, icono('editar', 14), 'Editar'),
        h('button', { type: 'button', class: 'btn btn-danger topo-btn-sm', onClick: () => acciones.eliminarArista(e) }, icono('papelera', 14), 'Eliminar')) : null,
    ].filter(Boolean));
  }

  function actualizar() {
    const sel = estado.seleccion;
    const elem = sel ? (sel.tipo === 'nodo' ? estado.nodoPorId.get(sel.id) : estado.aristaPorId.get(sel.id)) : null;
    if (!elem) { cerrar(); return; }
    peticion++;
    if (sel.tipo === 'nodo') renderNodo(elem); else renderArista(elem);
    raiz.hidden = false;
    requestAnimationFrame(() => raiz.classList.add('es-abierto'));
    raiz.style.setProperty('--topo-insp-acento', sel.tipo === 'nodo' ? colorDeNodo(elem) : (TIPOS_DEPENDENCIA[elem.dependencyType]?.color2d || '#1d5ed8'));
  }

  function cerrar() {
    raiz.classList.remove('es-abierto');
    raiz.hidden = true;
  }

  return { actualizar, cerrar, estaAbierto: () => !raiz.hidden };
}

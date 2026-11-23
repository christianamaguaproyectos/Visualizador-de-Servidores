/**
 * Panel Inspector compartido por el 3D y el 2D. Muestra el nodo o la arista
 * seleccionados y sus acciones. El "Análisis" se carga bajo demanda.
 */
import { h, icono, fechaCorta } from './dom.js';
import { ESTADOS, TIPOS_SERVIDOR, TIPOS_DEPENDENCIA, textoCriticidad, textoTipo, pildoraImpacto, colorDeNodo } from './constantesVisuales.js';
import { analisisImpacto } from './apiTopologia.js';
import { colocarEnRack, huecosLibres, primeraPosicionLibre, formatearDiscos, UNIDADES_RACK } from '../hosts/colocacionRack.js';

const rangoU = (inf, sup) => (sup > inf ? `U${inf}–U${sup}` : `U${inf}`);
/** Campos de la ficha del servidor (los mismos que muestra el detalle de /fisicos y /virtuales) */
const CAMPOS_FICHA = [
  ['Usuario', 'usuario'], ['Marca', 'marca'], ['Modelo', 'modelo'], ['Tipo', 'tipo'], ['Serie', 'serie'],
  ['Socket', 'socket'], ['No. por socket', 'noPorSocket'], ['Proc. lógicos', 'procesadoresLogicos'], ['RAM', 'ramGb'],
  ['Discos', 'discos'], ['Datastore', 'datastore'], ['Conexión', 'conexion'], ['Software', 'software'], ['SO', 'so'],
  ['Instalación', 'fechaInstalacion'], ['Mantenimiento', 'fechaMantenimiento'], ['Estado', 'estado'], ['Backup', 'backup'],
  ['Fecha backup', 'fechaBackup'], ['Activo', 'activo'],
];

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

  /** Rack y unidades; el nombre del rack lleva a su ficha en el inspector */
  function filaUbicacion(id, n) {
    const u = ubicacionEnRack(id);
    if (!u) return filaDato('Rack', n.rack);
    const texto = u.bloque ? ` · ${rangoU(u.bloque.uInferior, u.bloque.uSuperior)} (${u.bloque.alto}U)` : ' · sin unidades libres';
    return filaDato('Rack', h('span', {},
      h('button', { type: 'button', class: 'topo-enlace', onClick: () => acciones.seleccionar({ tipo: 'rack', id: String(u.rack.id) }) }, u.rack.name), texto));
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

  /** Rack y unidades de un servidor físico según el inventario (misma regla que /fisicos) */
  function ubicacionEnRack(id) {
    for (const r of estado.inventario?.fisicos?.racks || []) {
      if (!(r.servers || []).some((s) => String(s.id) === id)) continue;
      const b = colocarEnRack(r.servers).bloques.find((x) => String(x.servidor.id) === id);
      return { rack: r, bloque: b || null };
    }
    return null;
  }

  function fichaInventario(n) {
    const inv = estado.inventarioPorId?.get(String(n.id));
    if (!inv) return null;
    const filas = [];
    if (n.type === 'fisicos') {
      filas.push(...filaDato('Unidades', `${inv.rackUnits || 2}U`), ...filaDato('Posición (U)', inv.rackPosition ? String(inv.rackPosition) : 'Automática'));
    }
    for (const [etq, campo] of CAMPOS_FICHA) {
      const v = campo === 'discos' ? (inv.discos ? formatearDiscos(inv.discos) : null) : inv[campo];
      filas.push(...filaDato(etq, v === '' ? null : v, campo === 'discos' || campo === 'datastore' || campo === 'conexion' ? 'topo-insp__notas' : ''));
    }
    return h('details', { class: 'topo-insp__seccion topo-insp__ficha', open: true },
      h('summary', {}, 'Ficha de inventario'),
      h('dl', { class: 'topo-insp__datos' }, filas));
  }

  function renderRack(r) {
    titulo.textContent = 'Rack';
    const col = colocarEnRack(r.servers || []);
    const huecos = huecosLibres(col.porUnidad);
    const posicion = primeraPosicionLibre(col.porUnidad, 2);
    const ruta = `/fisicos#view=rack&name=${encodeURIComponent(r.name)}`;
    const filas = col.bloques.map((b) => {
      const id = String(b.servidor.id);
      const nodo = estado.nodoPorId.get(id);
      const nombre = b.servidor.nombre || b.servidor.hostname || `#${id}`;
      return h('li', { class: 'topo-insp__rel' },
        h('span', { class: 'topo-insp__u topo-mono' }, rangoU(b.uInferior, b.uSuperior)),
        nodo ? h('button', { type: 'button', class: 'topo-enlace', onClick: () => acciones.seleccionar({ tipo: 'nodo', id }) }, nombre) : h('span', {}, nombre),
        nodo ? pildoraEstado(nodo.status) : null);
    });
    const porcentaje = Math.round((col.ocupadas / UNIDADES_RACK) * 100);
    cuerpo.replaceChildren(...[
      h('div', { class: 'topo-insp__cabecera' },
        h('h2', { class: 'topo-insp__nombre', title: r.name }, r.name),
        h('div', { class: 'topo-insp__pills' }, h('span', { class: 'topo-pildora topo-pildora--neutra' }, `${col.ocupadas}/${UNIDADES_RACK}U · ${porcentaje}%`))),
      h('dl', { class: 'topo-insp__datos' },
        filaDato('Servidores', String(col.bloques.length)),
        filaDato('Ocupadas', `${col.ocupadas}U`),
        filaDato('Libres', `${col.libres}U`),
        filaDato('Huecos libres', huecos.length ? huecos.map((x) => `${rangoU(x.uInferior, x.uSuperior)} (${x.alto}U)`).join(' · ') : 'Ninguno')),
      h('section', { class: 'topo-insp__seccion' }, h('h3', {}, `Servidores por unidad (${col.bloques.length})`),
        filas.length ? h('ul', { class: 'topo-insp__rels' }, filas) : h('p', { class: 'topo-insp__vacio' }, 'Rack vacío.')),
      col.sinUbicar.length ? h('p', { class: 'topo-aviso-texto' }, `Sin unidades libres para: ${col.sinUbicar.map((s) => s.nombre || `#${s.id}`).join(', ')}.`) : null,
      h('div', { class: 'topo-insp__acciones' },
        h('button', { type: 'button', class: 'btn btn-secondary topo-btn-sm', onClick: () => acciones.enfocarRack(String(r.id)) }, icono('enfocar', 14), 'Enfocar'),
        estado.esAdmin && posicion
          ? h('a', { class: 'btn btn-primary topo-btn-sm', href: `/fisicos#view=rack&name=${encodeURIComponent(r.name)}&accion=agregar&posicion=${posicion}`, title: `Abre el alta de servidor de Físicos con el rack y la posición U${posicion}` }, icono('mas', 14), 'Agregar servidor en este rack')
          : null,
        h('a', { class: 'btn btn-secondary topo-btn-sm', href: ruta }, 'Ver en inventario')),
    ].filter(Boolean));
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
        ...(n.type === 'fisicos' ? filaUbicacion(id, n) : filaDato('Host', n.rack)),
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
      fichaInventario(n),
      h('div', { class: 'topo-insp__acciones' },
        h('button', { type: 'button', class: 'btn btn-secondary topo-btn-sm', onClick: () => acciones.enfocar(id) }, icono('enfocar', 14), 'Enfocar'),
        h('button', { type: 'button', class: 'btn btn-secondary topo-btn-sm', onClick: () => acciones.simular(id) }, icono('rayo', 14), estado.simulados.has(id) ? 'Quitar simulación' : 'Simular caída'),
        estado.esAdmin ? h('button', { type: 'button', class: 'btn btn-primary topo-btn-sm', onClick: () => acciones.nuevaRelacion({ origen: id }) }, icono('mas', 14), 'Relación desde aquí') : null,
        estado.esAdmin ? h('a', { class: 'btn btn-secondary topo-btn-sm', href: `${tipo.ruta}#view=server&id=${encodeURIComponent(id)}&accion=editar`, title: 'Abre el formulario de edición del inventario' }, icono('editar', 14), 'Editar servidor') : null,
        h('a', { class: 'btn btn-secondary topo-btn-sm', href: `${tipo.ruta}#view=server&id=${encodeURIComponent(id)}` }, 'Ver en inventario')),
    );
    cuerpo.replaceChildren(...bloques.filter(Boolean));
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
    const buscar = { nodo: (i) => estado.nodoPorId.get(i), arista: (i) => estado.aristaPorId.get(i), rack: (i) => estado.rackPorId(i) };
    const elem = sel ? buscar[sel.tipo]?.(sel.id) : null;
    if (!elem) { cerrar(); return; }
    peticion++;
    if (sel.tipo === 'nodo') renderNodo(elem); else if (sel.tipo === 'rack') renderRack(elem); else renderArista(elem);
    raiz.hidden = false;
    requestAnimationFrame(() => raiz.classList.add('es-abierto'));
    raiz.style.setProperty('--topo-insp-acento', sel.tipo === 'nodo' ? colorDeNodo(elem) : sel.tipo === 'rack' ? '#3d8bfd' : (TIPOS_DEPENDENCIA[elem.dependencyType]?.color2d || '#1d5ed8'));
  }

  function cerrar() {
    raiz.classList.remove('es-abierto');
    raiz.hidden = true;
  }

  return { actualizar, cerrar, estaAbierto: () => !raiz.hidden };
}

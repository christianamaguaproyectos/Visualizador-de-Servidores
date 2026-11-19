/**
 * Almacén de estado compartido por el 3D, el 2D, el inspector y el simulador.
 * Emite eventos: 'grafo', 'posiciones', 'seleccion', 'hover', 'filtros', 'modo',
 * 'simulacion', 'foco', 'guardado', 'animaciones', 'calidad3d'.
 */
import { capas } from './autoLayout.js';

export function crearEstadoTopologia() {
  const oyentes = new Map();
  const preferenciaReducida = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let animacionesGuardadas = null;
  try { animacionesGuardadas = localStorage.getItem('topo.animaciones'); } catch { /* sin acceso */ }
  // Calidad de la vista 3D: 'alta' | 'rendimiento' (null = automática según los fps medidos)
  let calidadGuardada = null;
  try { calidadGuardada = localStorage.getItem('topo.calidad3d'); } catch { /* sin acceso */ }

  const st = {
    usuario: null,
    esAdmin: false,
    vistas: [],
    vista: null,
    grafo: { nodes: [], edges: [], impact: null },
    nodoPorId: new Map(),
    aristaPorId: new Map(),
    posiciones: new Map(),
    layoutPorDefecto: false,
    cambiosSinGuardar: false,
    estadoGuardado: 'Sin cambios',
    filtros: { tipo: 'todos', rack: '', dependencia: '', soloConRelaciones: false },
    seleccion: null, // { tipo: 'nodo'|'arista', id }
    hover: null,
    modo: '3d',
    simulando: false,
    simulados: new Set(),
    focoImpacto: false,
    animaciones: animacionesGuardadas === null ? !preferenciaReducida : animacionesGuardadas === '1',
    calidad3d: calidadGuardada === 'alta' || calidadGuardada === 'rendimiento' ? calidadGuardada : 'alta',
    calidad3dElegida: calidadGuardada === 'alta' || calidadGuardada === 'rendimiento',

    on(evento, fn) {
      if (!oyentes.has(evento)) oyentes.set(evento, new Set());
      oyentes.get(evento).add(fn);
      return () => oyentes.get(evento).delete(fn);
    },
    emitir(evento, dato) {
      for (const fn of oyentes.get(evento) || []) {
        try { fn(dato); } catch (err) { console.error(`[topologia] oyente de ${evento}:`, err); }
      }
    },

    /** Carga un grafo nuevo. Conserva las posiciones de trabajo si se pide (p. ej. al simular) */
    fijarGrafo(grafo, { conservarPosiciones = false } = {}) {
      st.grafo = grafo;
      st.nodoPorId = new Map(grafo.nodes.map((n) => [String(n.id), n]));
      st.aristaPorId = new Map(grafo.edges.map((e) => [String(e.id), e]));
      if (grafo.view) st.vista = grafo.view;
      if (!conservarPosiciones) {
        st.posiciones = new Map();
        const sinPosicion = [];
        for (const n of grafo.nodes) {
          if (n.position) st.posiciones.set(String(n.id), { x: n.position.x, y: n.position.y, pinned: n.position.pinned });
          else sinPosicion.push(n);
        }
        st.layoutPorDefecto = sinPosicion.length === grafo.nodes.length;
        if (sinPosicion.length) {
          const auto = capas(grafo.nodes, grafo.edges);
          for (const n of sinPosicion) st.posiciones.set(String(n.id), auto[String(n.id)] || { x: 0, y: 0 });
          if (st.esAdmin) st.marcarCambios();
        } else {
          st.cambiosSinGuardar = false;
          st.estadoGuardado = 'Sin cambios';
        }
      } else {
        // Nodos nuevos (p. ej. simulados aislados) que aún no tenían posición
        const faltan = grafo.nodes.filter((n) => !st.posiciones.has(String(n.id)));
        if (faltan.length) {
          const auto = capas(grafo.nodes, grafo.edges);
          for (const n of faltan) st.posiciones.set(String(n.id), n.position || auto[String(n.id)] || { x: 0, y: 0 });
        }
      }
      if (st.seleccion) {
        const mapa = st.seleccion.tipo === 'nodo' ? st.nodoPorId : st.aristaPorId;
        if (!mapa.has(st.seleccion.id)) st.seleccion = null;
      }
      st.emitir('grafo', grafo);
    },

    moverNodo(id, x, y, { emitir = true } = {}) {
      const p = st.posiciones.get(String(id)) || {};
      st.posiciones.set(String(id), { ...p, x, y });
      if (emitir) st.emitir('posiciones', { ids: [String(id)] });
    },

    aplicarLayout(mapa) {
      for (const [id, p] of Object.entries(mapa)) st.posiciones.set(String(id), { ...st.posiciones.get(String(id)), ...p });
      st.layoutPorDefecto = false;
      st.marcarCambios();
      st.emitir('posiciones', { ids: Object.keys(mapa), todo: true });
    },

    marcarCambios() {
      st.cambiosSinGuardar = true;
      st.estadoGuardado = 'Cambios sin guardar';
      st.emitir('guardado', st.estadoGuardado);
    },
    marcarGuardado(texto) {
      st.cambiosSinGuardar = false;
      st.estadoGuardado = texto;
      st.emitir('guardado', texto);
    },

    seleccionar(sel) {
      const igual = sel && st.seleccion && sel.tipo === st.seleccion.tipo && sel.id === st.seleccion.id;
      if (igual || (!sel && !st.seleccion)) return;
      st.seleccion = sel ? { tipo: sel.tipo, id: String(sel.id) } : null;
      st.emitir('seleccion', st.seleccion);
    },
    fijarHover(h) {
      const igual = h && st.hover && h.tipo === st.hover.tipo && h.id === st.hover.id;
      if (igual || (!h && !st.hover)) return;
      st.hover = h ? { tipo: h.tipo, id: String(h.id) } : null;
      st.emitir('hover', st.hover);
    },

    fijarFiltros(parcial) {
      Object.assign(st.filtros, parcial);
      st.emitir('filtros', st.filtros);
    },

    fijarAnimaciones(valor) {
      st.animaciones = Boolean(valor);
      try { localStorage.setItem('topo.animaciones', st.animaciones ? '1' : '0'); } catch { /* sin acceso */ }
      st.emitir('animaciones', st.animaciones);
    },

    /**
     * Calidad 3D. `elegida` = la eligió la persona (se recuerda); si no, es la automática.
     */
    fijarCalidad3d(valor, { elegida = true } = {}) {
      st.calidad3d = valor === 'rendimiento' ? 'rendimiento' : 'alta';
      if (elegida) {
        st.calidad3dElegida = true;
        try { localStorage.setItem('topo.calidad3d', st.calidad3d); } catch { /* sin acceso */ }
      }
      st.emitir('calidad3d', st.calidad3d);
    },

    /** Nodos tras aplicar filtros */
    nodosVisibles() {
      const f = st.filtros;
      const aristasTipo = f.dependencia ? st.grafo.edges.filter((e) => e.dependencyType === f.dependencia) : st.grafo.edges;
      let nodos = st.grafo.nodes.filter((n) => (f.tipo === 'todos' || n.type === f.tipo) && (!f.rack || n.rack === f.rack));
      if (f.soloConRelaciones || f.dependencia) {
        const ids = new Set(nodos.map((n) => String(n.id)));
        const conRel = new Set();
        for (const e of aristasTipo) {
          if (ids.has(String(e.source)) && ids.has(String(e.target))) { conRel.add(String(e.source)); conRel.add(String(e.target)); }
        }
        nodos = nodos.filter((n) => conRel.has(String(n.id)));
      }
      return nodos;
    },

    /** Aristas cuyos dos extremos están visibles (y del tipo filtrado) */
    aristasVisibles(nodos = st.nodosVisibles()) {
      const ids = new Set(nodos.map((n) => String(n.id)));
      const f = st.filtros;
      return st.grafo.edges.filter((e) => ids.has(String(e.source)) && ids.has(String(e.target))
        && (!f.dependencia || e.dependencyType === f.dependencia));
    },

    /** true si el nodo está caído o afectado */
    nodoAfectado(n) {
      return Boolean(n && (n.isDown || n.cascadeStatus !== 'NONE'));
    },

    /** Si el foco de impacto está activo y el nodo no participa, se atenúa */
    nodoAtenuado(n) {
      return st.focoImpacto && !st.nodoAfectado(n);
    },
    aristaAtenuada(e) {
      return st.focoImpacto && !e.carriesImpact;
    },
  };
  return st;
}

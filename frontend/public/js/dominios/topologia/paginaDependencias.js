/**
 * Orquestación de la página /dependencias: estado de la URL (?vista=&modo=3d|2d&focus=),
 * barra, filtros, cambio de modo (import() dinámico del 3D), permisos por rol,
 * guardado de posiciones y conexión entre componentes.
 */
import { crearEstadoTopologia } from './estadoTopologia.js';
import * as api from './apiTopologia.js';
import { capas, anillos } from './autoLayout.js';
import { hayWebgl } from './deteccionWebgl.js';
import { crearLienzo2D } from './lienzoDrawio.js';
import { crearInspector } from './inspector.js';
import { crearFormularioRelacion } from './formularioRelacion.js';
import { crearSimulador } from './simuladorImpacto.js';
import { crearMinimapa } from './minimapa.js';
import { crearLeyenda } from './leyenda.js';
import { crearListaAccesible } from './listaAccesible.js';
import { crearPaleta } from './paletaServidores.js';
import { exportarSVG, exportarPNGDesdeSVG, exportarCanvasPNG, exportarJSON } from './exportadorDiagrama.js';
import { h, atraparFoco } from './dom.js';
import { TIPOS_DEPENDENCIA, TIPOS_SERVIDOR, ESTADOS, TARJETA } from './constantesVisuales.js';
import { confirmAction } from '../ui-system/modalConfirm.js';
import { coberturaInventario } from './salaDatos.js';

const $ = (sel) => document.querySelector(sel);
const toast = (msg, tipo = 'info', ms) => window.showToast?.(msg, tipo, ms);
// Refresco del estado de monitoreo (los cambios de inventario llegan además por SSE)
const INTERVALO_VIVO_MS = 30000;

export async function iniciarPaginaDependencias() {
  const estado = crearEstadoTopologia();
  const params = new URLSearchParams(window.location.search);
  let vistaSel = params.get('vista');
  const focoInicial = params.get('focus');
  const webgl = hayWebgl();
  estado.modo = params.get('modo') === '2d' || !webgl ? '2d' : '3d';

  const escenario = $('#topo-escenario');
  const elEstado = $('#topo-estado');
  const live = $('#topo-live');
  let escena = null;
  let cargando3d = null;
  let pendiente3d = true;
  let catalogo = [];
  // Por defecto el mapa muestra todo el inventario (también los servidores sin relaciones)
  let includeIsolated = true;
  let autoguardado = 0;
  let avisoSoloLectura = false;
  let controladorCarga = null;
  let cargaPrincipal = null; // carga pedida por el usuario (el refresco en vivo no la interrumpe)
  let firmaCargada = null; // grafo + inventario de la última carga (el refresco en vivo no redibuja si no cambió)
  let aisladosCargados = null;

  // ── Usuario y permisos ───────────────────────────────────────────────────
  try {
    const r = await api.obtenerUsuario();
    estado.usuario = r?.user || null;
  } catch { estado.usuario = null; }
  const rol = estado.usuario?.role;
  estado.esAdmin = Boolean(estado.usuario && (rol === 'admin' || rol === 'superadmin' || estado.usuario.isSuperAdmin));
  document.querySelectorAll('.topo-solo-admin').forEach((e) => e.classList.toggle('is-hidden', !estado.esAdmin));

  const nombreDe = (id) => estado.nodoPorId.get(String(id))?.name || catalogo.find((s) => String(s.id) === String(id))?.name || `#${id}`;

  // ── Componentes ──────────────────────────────────────────────────────────
  const inspector = crearInspector({
    raiz: $('#topo-inspector'), estado,
    acciones: {
      cerrar: () => { inspector.cerrar(); },
      seleccionar: (sel) => seleccionar(sel, { enfocar: false }),
      enfocar: (id) => enfocar(id),
      enfocarRack: (id) => { if (estado.modo === '3d') escena?.enfocarRack(id); },
      simular: (id) => simulador.alternar(id),
      nuevaRelacion: ({ origen }) => formulario.abrir({ origen }),
      editarArista: (e) => formulario.abrir({ arista: e }),
      eliminarArista: (e) => eliminarArista(e),
    },
  });

  const formulario = crearFormularioRelacion({
    raiz: $('#topo-modal-relacion'),
    obtenerCatalogo: () => catalogo,
    alGuardar: async (res, edicion) => {
      toast(edicion ? 'Relación actualizada' : (res.dependencies?.length > 1 ? 'Relaciones creadas en ambos sentidos' : 'Relación creada'), 'success');
      await recargar({ conservarPosiciones: true, catalogo: true });
      const id = res.dependency?.id;
      if (id) seleccionar({ tipo: 'arista', id }, { enfocar: false });
    },
  });

  const simulador = crearSimulador({
    banda: $('#topo-banda-sim'), resumen: $('#topo-resumen'), boton: $('#topo-simular'), estado,
    recargar: (ids) => recargar({ simulateDownIds: ids, conservarPosiciones: true }),
  });

  const minimapa = crearMinimapa({
    raiz: $('#topo-minimapa'), estado,
    centrar: (x, y) => { if (estado.modo === '3d') escena?.centrarEnPx(x, y); else lienzo.centrarEnPx(x, y); },
    // En 3D el minimapa refleja la disposición de la escena (sala de datos o editor)
    posicionDe: (id) => (estado.modo === '3d' && escena?.posicionPlano(id)) || estado.posiciones.get(String(id)),
  });

  const leyenda = crearLeyenda({ raiz: $('#topo-leyenda'), estado });

  const lista = crearListaAccesible({
    raiz: $('#topo-modal-lista'), estado,
    acciones: {
      inspeccionar: (id) => seleccionar({ tipo: 'nodo', id }, { enfocar: false }),
      enfocar: (id) => enfocar(id),
      simular: (id) => simulador.alternar(id),
    },
  });

  const paleta = crearPaleta({ raiz: $('#topo-paleta'), estado, obtenerCatalogo: () => catalogo, agregar: (id, pos) => agregarAlLienzo(id, pos) });

  let encuadreProgramado = 0;
  function actualizarEncuadre() {
    if (encuadreProgramado) return;
    encuadreProgramado = requestAnimationFrame(() => {
      encuadreProgramado = 0;
      if (estado.modo === '3d' && escena) minimapa.fijarEncuadre(escena.huellaCamara());
      else if (estado.modo === '2d') {
        const r = lienzo.rectVisible();
        minimapa.fijarEncuadre([[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]);
      }
    });
  }

  const lienzo = crearLienzo2D({
    contenedor: $('#topo-lienzo2d'), estado, nombreDe,
    alClicNodo: (id) => clicNodo(id),
    alClicArista: (id) => seleccionar({ tipo: 'arista', id }, { enfocar: false }),
    alClicVacio: () => estado.seleccionar(null),
    alConectar: (origen, destino) => formulario.abrir({ origen, destino }),
    alSoltarNodo: () => programarAutoguardado(),
    alCambiarVista: actualizarEncuadre,
  });

  // Soltar servidores de la paleta en el lienzo
  const zona2d = $('#topo-lienzo2d');
  zona2d.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; });
  zona2d.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const dato = ev.dataTransfer.getData('text/plain');
    if (!dato.startsWith('topo-servidor:')) return;
    const [x, y] = lienzo.aMundo(ev.clientX, ev.clientY);
    agregarAlLienzo(dato.slice('topo-servidor:'.length), { x: x - TARJETA.ancho / 2, y: y - TARJETA.alto / 2 });
  });

  // ── Selección, foco y acciones ───────────────────────────────────────────
  function clicNodo(id) {
    if (estado.simulando) { simulador.alternar(id); return; }
    seleccionar({ tipo: 'nodo', id }, { enfocar: false });
  }

  function seleccionar(sel, { enfocar: conEnfoque = false, parpadeo = false } = {}) {
    estado.seleccionar(sel);
    if (sel?.tipo === 'nodo' && conEnfoque) enfocar(sel.id, { parpadeo });
  }

  function enfocar(id, { parpadeo = false } = {}) {
    estado.seleccionar({ tipo: 'nodo', id });
    if (estado.modo === '3d' && escena) escena.enfocarNodo(id, { parpadeo });
    else lienzo.enfocarNodo(id);
  }

  async function eliminarArista(e) {
    const ok = await confirmAction({
      title: 'Eliminar relación',
      message: `¿Eliminar la dependencia ${e.sourceName || nombreDe(e.source)} → ${e.targetName || nombreDe(e.target)} (${TIPOS_DEPENDENCIA[e.dependencyType]?.corto || e.dependencyType})?`,
      confirmText: 'Eliminar',
    });
    if (!ok) return;
    try {
      await api.eliminarDependencia(e.id);
      toast('Relación eliminada', 'success');
      if (estado.seleccion?.tipo === 'arista' && estado.seleccion.id === String(e.id)) estado.seleccionar(null);
      await recargar({ conservarPosiciones: true });
    } catch (err) {
      toast(err.status === 403 ? 'No tienes permisos para eliminar relaciones' : err.message, 'error');
    }
  }

  async function agregarAlLienzo(id, pos) {
    if (!estado.esAdmin) { toast('Solo lectura: no puedes modificar la vista', 'warning'); return; }
    let p = pos;
    if (!p) {
      const r = lienzo.rectVisible();
      p = { x: r.x + r.w / 2 - TARJETA.ancho / 2, y: r.y + r.h / 2 - TARJETA.alto / 2 };
    }
    p = { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 };
    try {
      await api.guardarPosiciones(estado.vista.id, { positions: [{ serverId: id, x: p.x, y: p.y, pinned: false }] });
      estado.posiciones.set(String(id), p);
      await recargar({ conservarPosiciones: true });
      toast(`${nombreDe(id)} agregado a la vista`, 'success', 2500);
    } catch (err) { toast(err.message, 'error'); }
  }

  // ── Guardado ─────────────────────────────────────────────────────────────
  function programarAutoguardado() {
    if (!estado.esAdmin) {
      if (!avisoSoloLectura) toast('Solo lectura: los cambios de posición no se guardan', 'info');
      avisoSoloLectura = true;
      return;
    }
    estado.marcarCambios();
    clearTimeout(autoguardado);
    autoguardado = setTimeout(guardar, 2000);
  }

  async function guardar() {
    clearTimeout(autoguardado);
    if (!estado.esAdmin || !estado.vista) return;
    const positions = estado.grafo.nodes
      .filter((n) => estado.posiciones.has(String(n.id)))
      .map((n) => { const p = estado.posiciones.get(String(n.id)); return { serverId: String(n.id), x: Math.round(p.x), y: Math.round(p.y), pinned: Boolean(p.pinned) }; });
    estado.estadoGuardado = 'Guardando…';
    estado.emitir('guardado', estado.estadoGuardado);
    try {
      await api.guardarPosiciones(estado.vista.id, { positions, viewport: lienzo.obtenerViewport() });
      const d = new Date();
      estado.marcarGuardado(`Guardado ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    } catch (err) {
      estado.marcarCambios();
      toast(err.status === 403 ? 'No tienes permisos para guardar la vista' : `No se pudo guardar: ${err.message}`, 'error');
    }
  }
  $('#topo-guardar').addEventListener('click', guardar);

  // ── Carga de datos ───────────────────────────────────────────────────────
  function mostrarEstado(tipo, extra = {}) {
    elEstado.className = `topo-estado${tipo ? ` topo-estado--${tipo}` : ''}`;
    elEstado.replaceChildren();
    if (!tipo) return;
    if (tipo === 'cargando') {
      const texto = h('p', {}, 'Cargando topología…');
      elEstado.append(h('span', { class: 'topo-spinner', 'aria-hidden': 'true' }), texto);
      setTimeout(() => { if (elEstado.contains(texto)) texto.textContent = 'Esto está tardando más de lo normal…'; }, 8000);
    } else if (tipo === 'vacio') {
      elEstado.append(
        h('div', { class: 'topo-estado__ilustracion', 'aria-hidden': 'true' }),
        h('h2', {}, 'Aún no hay relaciones en esta vista'),
        estado.esAdmin
          ? h('div', { class: 'topo-estado__acciones' },
            h('button', { type: 'button', class: 'btn btn-primary', onClick: () => formulario.abrir() }, '+ Nueva relación'),
            h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { includeIsolated = true; recargar(); } }, 'Mostrar todos los servidores'))
          : h('p', {}, 'Pide a un administrador que registre dependencias.'));
    } else if (tipo === 'filtrado') {
      elEstado.append(h('h2', {}, 'Ningún servidor coincide con los filtros'),
        h('button', { type: 'button', class: 'btn btn-secondary', onClick: limpiarFiltros }, 'Limpiar filtros'));
    } else if (tipo === 'error') {
      elEstado.append(h('h2', {}, 'No se pudo cargar la topología.'), extra.detalle ? h('p', {}, extra.detalle) : null,
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => recargar() }, 'Reintentar'));
    } else if (tipo === 'noexiste') {
      elEstado.append(h('h2', {}, 'La vista solicitada no existe'),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => { vistaSel = null; actualizarUrl(); recargar(); } }, 'Ir al Mapa General'));
    }
  }

  async function cargarCatalogo() {
    try {
      const g = await api.obtenerGrafo({ vista: estado.vista?.id || vistaSel, includeIsolated: true });
      catalogo = g.nodes.map((n) => ({ id: String(n.id), name: n.name, ip: n.ip, hostname: n.hostname, type: n.type }));
    } catch { /* el catálogo es opcional */ }
  }

  /** La sala de racks 3D muestra todo el inventario: pide también los servidores sin relaciones */
  const enSalaRacks = () => estado.modo === '3d' && estado.disposicion3d === 'sala';
  const incluirAislados = () => includeIsolated || enSalaRacks();

  /** Racks y servidores de /fisicos y /virtuales (la sala de racks y la ficha del inspector) */
  async function cargarInventario() {
    const [fisicos, virtuales] = await Promise.all(['fisicos', 'virtuales'].map((t) => api.obtenerInventario(t).catch(() => null)));
    estado.fijarInventario({ fisicos, virtuales });
  }
  const firmaDe = (grafo) => JSON.stringify([grafo.nodes, grafo.edges, grafo.impact, grafo.view?.id,
    estado.inventario.fisicos?.racks, estado.inventario.virtuales?.servers]);

  async function recargar({ simulateDownIds = [...estado.simulados], conservarPosiciones = false, catalogo: conCatalogo = false, silencioso = false } = {}) {
    if (silencioso && cargaPrincipal) return;
    if (controladorCarga) controladorCarga.abort();
    const controlador = new AbortController();
    controladorCarga = controlador;
    if (!silencioso) cargaPrincipal = controlador;
    if (!conservarPosiciones) mostrarEstado('cargando');
    try {
      const aislados = incluirAislados();
      const grafo = await api.obtenerGrafo({ vista: vistaSel, includeIsolated: aislados, simulateDownIds, signal: controlador.signal });
      if (controlador.signal.aborted) return;
      aisladosCargados = aislados;
      const firma = firmaDe(grafo);
      // Refresco en vivo sin cambios: no se toca la escena (cámara, selección e inspector intactos)
      if (silencioso && firma === firmaCargada) return;
      firmaCargada = firma;
      estado.fijarGrafo(grafo, { conservarPosiciones });
      if (conCatalogo || !catalogo.length) await cargarCatalogo();
      paleta.render();
      mostrarEstado(null);
      if (!grafo.nodes.length) mostrarEstado('vacio');
      else if (!estado.nodosVisibles().length) mostrarEstado('filtrado');
    } catch (err) {
      if (err?.name === 'AbortError' || controlador.signal.aborted) return;
      if (silencioso) return; // un refresco en vivo fallido no sustituye lo que ya se ve
      if (err?.status === 404) mostrarEstado('noexiste');
      else mostrarEstado('error', { detalle: err?.datos?.error || null });
    } finally {
      if (cargaPrincipal === controlador) cargaPrincipal = null;
    }
  }

  async function cargarVistas() {
    try {
      const { views } = await api.listarVistas();
      estado.vistas = views;
      const sel = $('#topo-vista');
      sel.replaceChildren(...views.map((v) => h('option', { value: v.slug, title: v.isDefault ? 'Vista por defecto' : (v.description || '') }, v.name)));
      const actual = views.find((v) => v.slug === vistaSel || v.id === vistaSel) || views.find((v) => v.isDefault);
      if (actual) sel.value = actual.slug;
    } catch { /* el selector queda vacío; el grafo usa la vista por defecto */ }
  }

  $('#topo-vista').addEventListener('change', async (ev) => {
    vistaSel = ev.target.value;
    estado.seleccionar(null);
    actualizarUrl();
    await recargar();
  });

  // ── Reacciones al estado ─────────────────────────────────────────────────
  estado.on('grafo', () => {
    rellenarFiltros();
    redibujarTodo({ encuadrar: !estado.__encuadrado });
    estado.__encuadrado = true;
    simulador.render();
    // Recargar el grafo solo refresca el inspector si ya estaba abierto (no lo reabre)
    if (inspector.estaAbierto()) inspector.actualizar();
    if (lista.estaAbierta()) lista.render();
  });

  function redibujarTodo({ encuadrar = false } = {}) {
    if (estado.modo === '2d') {
      lienzo.renderizar();
      if (encuadrar && !lienzo.fijarViewport(estado.vista?.viewport)) lienzo.encajar();
      pendiente3d = true;
    } else if (escena) {
      escena.reconstruir({ encuadrar });
      pendiente3d = false;
    }
    minimapa.renderizar();
    actualizarEncuadre();
    actualizarConteo();
  }

  estado.on('seleccion', (sel) => {
    refrescarEstilos();
    inspector.actualizar();
    if (sel?.tipo === 'nodo') {
      const n = estado.nodoPorId.get(sel.id);
      if (n) {
        const deps = estado.grafo.edges.filter((e) => String(e.source) === sel.id).length;
        const dependientes = estado.grafo.edges.filter((e) => String(e.target) === sel.id).length;
        live.textContent = `${n.name}, ${n.type === 'fisicos' ? 'físico' : 'virtual'}, estado ${(ESTADOS[n.status] || ESTADOS.UNKNOWN).texto}, depende de ${deps}, ${dependientes} depende${dependientes === 1 ? '' : 'n'} de él`;
      }
    } else if (sel?.tipo === 'rack') {
      const r = estado.rackPorId(sel.id);
      if (r) live.textContent = `Rack ${r.name}, ${(r.servers || []).length} servidores`;
    } else if (sel?.tipo === 'arista') {
      const e = estado.aristaPorId.get(sel.id);
      if (e) live.textContent = `Relación ${e.sourceName} depende de ${e.targetName}, ${TIPOS_DEPENDENCIA[e.dependencyType]?.largo || e.dependencyType}`;
    }
  });
  estado.on('hover', () => refrescarEstilos());
  estado.on('foco', () => { refrescarEstilos(); minimapa.renderizar(); simulador.render(); });
  estado.on('animaciones', (v) => {
    $('#topo-animaciones').setAttribute('aria-checked', v ? 'true' : 'false');
    document.body.classList.toggle('topo-sin-animaciones', !v);
    refrescarEstilos();
  });
  estado.on('filtros', () => {
    estado.seleccionar(null);
    redibujarTodo({ encuadrar: true });
    if (estado.grafo.nodes.length && !estado.nodosVisibles().length) mostrarEstado('filtrado');
    else if (elEstado.classList.contains('topo-estado--filtrado')) mostrarEstado(null);
  });
  estado.on('posiciones', ({ todo } = {}) => {
    if (estado.modo === '2d') { if (todo) lienzo.renderizar(); pendiente3d = true; } else if (escena) escena.reconstruir();
    minimapa.renderizar();
    actualizarEncuadre();
    paleta.render();
  });
  estado.on('guardado', (texto) => {
    $('#topo-guardar-texto').textContent = texto;
    const b = $('#topo-guardar');
    b.classList.toggle('es-pendiente', estado.cambiosSinGuardar);
    b.classList.toggle('es-guardando', texto === 'Guardando…');
  });

  function refrescarEstilos() {
    if (estado.modo === '2d') lienzo.actualizarEstilos();
    else escena?.actualizarEstilos();
  }

  // ── Filtros ──────────────────────────────────────────────────────────────
  function rellenarFiltros() {
    const rack = $('#topo-filtro-rack');
    const racks = [...new Set(estado.grafo.nodes.map((n) => n.rack).filter(Boolean))].sort();
    const previo = rack.value;
    rack.replaceChildren(h('option', { value: '' }, 'Todos'), ...racks.map((r) => h('option', { value: r }, r)));
    rack.value = racks.includes(previo) ? previo : '';
    const dep = $('#topo-filtro-dependencia');
    if (dep.options.length <= 1) dep.append(...Object.entries(TIPOS_DEPENDENCIA).map(([k, v]) => h('option', { value: k }, v.largo)));
  }
  document.querySelectorAll('.topo-segmentado [data-tipo]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.topo-segmentado [data-tipo]').forEach((x) => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
    estado.fijarFiltros({ tipo: b.dataset.tipo });
  }));
  $('#topo-filtro-rack').addEventListener('change', (ev) => estado.fijarFiltros({ rack: ev.target.value }));
  $('#topo-filtro-dependencia').addEventListener('change', (ev) => estado.fijarFiltros({ dependencia: ev.target.value }));
  $('#topo-filtro-relaciones').addEventListener('change', (ev) => estado.fijarFiltros({ soloConRelaciones: ev.target.checked }));
  function limpiarFiltros() {
    document.querySelectorAll('.topo-segmentado [data-tipo]').forEach((x) => x.setAttribute('aria-checked', x.dataset.tipo === 'todos' ? 'true' : 'false'));
    $('#topo-filtro-rack').value = '';
    $('#topo-filtro-dependencia').value = '';
    $('#topo-filtro-relaciones').checked = false;
    estado.fijarFiltros({ tipo: 'todos', rack: '', dependencia: '', soloConRelaciones: false });
  }
  function actualizarConteo() {
    const n = estado.nodosVisibles();
    const e = estado.aristasVisibles(n);
    $('#topo-conteo').textContent = `${n.length} servidores · ${e.length} relaciones`;
    pintarCobertura();
  }
  /** Verificación visible: servidores del inventario (/fisicos + /virtuales) que el mapa dibuja */
  function pintarCobertura() {
    const el = $('#topo-cobertura');
    if (!el) return;
    const c = coberturaInventario(estado.grafo?.nodes || [], estado.inventario, { sala: enSalaRacks() });
    el.hidden = !c;
    if (!c) return;
    const completo = c.enMapa === c.inventario;
    el.className = `topo-cobertura topo-cobertura--${completo ? 'ok' : 'aviso'}`;
    el.textContent = `Inventario ${c.enMapa}/${c.inventario}`;
    el.setAttribute('aria-label', `Servidores del inventario en el mapa: ${c.enMapa} de ${c.inventario}`);
    el.title = completo ? 'El mapa muestra todos los servidores de Servidores Físicos y Servidores Virtuales'
      : `No se muestran (${c.faltan.length}): ${c.faltan.slice(0, 15).join(', ')}${c.faltan.length > 15 ? '…' : ''}. Activa "Mostrar todos los servidores" en el menú ⋯`;
    el.dataset.inventario = String(c.inventario);
    el.dataset.enMapa = String(c.enMapa);
  }

  // ── Modo 3D / 2D ─────────────────────────────────────────────────────────
  async function asegurarEscena() {
    if (escena) return escena;
    if (!cargando3d) {
      cargando3d = import('./escena3d.js').then(({ crearEscena3D }) => {
        escena = crearEscena3D({
          contenedor: $('#topo-escena3d'), elementoTeclado: escenario, estado,
          alClicNodo: (id) => clicNodo(id),
          alClicArista: (id) => seleccionar({ tipo: 'arista', id }),
          alClicRack: (id) => { if (!estado.simulando) seleccionar({ tipo: 'rack', id }); },
          alClicVacio: () => estado.seleccionar(null),
          alPerderContexto: () => { $('#topo-contexto').hidden = false; },
          alMoverCamara: actualizarEncuadre,
          alReconstruir: () => { minimapa.renderizar(); actualizarEncuadre(); },
          alRendimientoBajo: () => toast('La vista 3D pasó a modo rendimiento para moverse con fluidez. Puedes cambiarlo en el menú «Más opciones».', 'info', 6000),
        });
        pendiente3d = true;
        return escena;
      }).catch((err) => {
        console.error('[topologia] No se pudo cargar el 3D:', err);
        cargando3d = null;
        avisoSinWebgl('No se pudo iniciar la vista 3D. Se muestra el Editor 2D.');
        return null;
      });
    }
    return cargando3d;
  }

  async function cambiarModo(modo) {
    if (modo === '3d' && !webgl) return;
    estado.modo = modo;
    $('#topo-modo-3d').setAttribute('aria-checked', modo === '3d' ? 'true' : 'false');
    $('#topo-modo-2d').setAttribute('aria-checked', modo === '2d' ? 'true' : 'false');
    document.body.classList.toggle('topo-modo-2d', modo === '2d');
    document.body.classList.toggle('topo-modo-3d', modo === '3d');
    $('#topo-escena3d').classList.toggle('is-hidden', modo !== '3d');
    $('#topo-lienzo2d').classList.toggle('is-hidden', modo !== '2d');
    // El aviso de contexto gráfico perdido solo aplica a la vista 3D
    if (modo === '2d') $('#topo-contexto').hidden = true;
    $('#topo-paleta').classList.toggle('is-hidden', modo !== '2d' || !estado.esAdmin);
    document.querySelectorAll('#topo-exportar-menu [data-modo], #topo-mas-menu [data-modo]').forEach((li) => { li.hidden = li.dataset.modo !== modo; });
    lienzo.mostrar(modo === '2d');
    actualizarUrl();
    pintarAislados();
    // La sala de racks pide todos los servidores; el 2D, solo los de la vista
    if (aisladosCargados !== null && aisladosCargados !== incluirAislados()) recargar({ conservarPosiciones: true });
    leyenda.render();
    // En 2D las tarjetas ya rotulan todo: la leyenda se pliega en anchos menores de 1600
    if (modo === '2d' && window.innerWidth < 1600) leyenda.fijarAbierta(false);
    if (modo === '3d') {
      const e = await asegurarEscena();
      if (!e) { cambiarModo('2d'); return; }
      e.reanudar();
      if (pendiente3d) { e.reconstruir({ encuadrar: !e.__encuadrada }); e.__encuadrada = true; pendiente3d = false; }
      e.actualizarEstilos();
    } else {
      escena?.pausar();
      lienzo.renderizar();
      if (!lienzo.__encuadrado) { if (!lienzo.fijarViewport(estado.vista?.viewport)) lienzo.encajar(); lienzo.__encuadrado = true; }
    }
    minimapa.renderizar();
    actualizarEncuadre();
  }

  function avisoSinWebgl(texto) {
    toast(texto, 'warning', 8000);
    const b = $('#topo-modo-3d');
    b.setAttribute('aria-disabled', 'true');
    b.title = 'Tu navegador no admite WebGL';
    b.classList.add('es-deshabilitado');
  }

  $('#topo-modo-3d').addEventListener('click', () => { if (webgl) cambiarModo('3d'); });
  $('#topo-modo-2d').addEventListener('click', () => cambiarModo('2d'));
  document.querySelector('.topo-modo').addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    ev.preventDefault();
    const destino = estado.modo === '3d' ? '2d' : '3d';
    if (destino === '3d' && !webgl) return;
    cambiarModo(destino);
    $(`#topo-modo-${destino}`).focus();
  });

  $('#topo-contexto [data-accion="cerrar-contexto"]').addEventListener('click', () => { $('#topo-contexto').hidden = true; });
  $('#topo-contexto [data-accion="reintentar-3d"]').addEventListener('click', async () => {
    $('#topo-contexto').hidden = true;
    escena?.dispose();
    escena = null; cargando3d = null; pendiente3d = true;
    await cambiarModo('3d');
  });

  function actualizarUrl() {
    const q = new URLSearchParams(window.location.search);
    if (vistaSel) q.set('vista', vistaSel); else q.delete('vista');
    q.set('modo', estado.modo);
    q.delete('focus');
    history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`);
  }

  // ── Controles del lienzo ─────────────────────────────────────────────────
  document.querySelectorAll('.topo-controles [data-control]').forEach((b) => b.addEventListener('click', () => {
    const c = b.dataset.control;
    const en3d = estado.modo === '3d' && escena;
    if (c === 'acercar') en3d ? escena.zoom(0.8) : lienzo.zoom(1.2);
    if (c === 'alejar') en3d ? escena.zoom(1.25) : lienzo.zoom(1 / 1.2);
    if (c === 'cien') en3d ? escena.reiniciarCamara() : lienzo.zoom100();
    if (c === 'encajar') en3d ? escena.encajar() : lienzo.encajar();
  }));

  document.querySelectorAll('#topo-autoordenar-menu [data-layout]').forEach((b) => b.addEventListener('click', () => {
    cerrarMenus();
    const nodos = estado.nodosVisibles();
    const aristas = estado.aristasVisibles(nodos);
    estado.aplicarLayout(b.dataset.layout === 'anillos' ? anillos(nodos, aristas) : capas(nodos, aristas));
    if (estado.modo === '2d') lienzo.encajar(); else escena?.encajar();
    if (estado.esAdmin) programarAutoguardado();
  }));

  // ── Menús ────────────────────────────────────────────────────────────────
  const menus = [['#topo-exportar', '#topo-exportar-menu'], ['#topo-mas', '#topo-mas-menu'], ['#topo-autoordenar', '#topo-autoordenar-menu']];
  function cerrarMenus() {
    let habia = false;
    for (const [b, m] of menus) {
      if (!$(m).hidden) habia = true;
      $(m).hidden = true;
      $(b).setAttribute('aria-expanded', 'false');
    }
    return habia;
  }
  document.querySelectorAll('.topo-menu__cerrar').forEach((x) => x.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const boton = $(`[aria-controls="${ev.currentTarget.closest('[role="menu"]').id}"]`);
    cerrarMenus();
    boton?.focus();
  }));
  for (const [b, m] of menus) {
    $(b).addEventListener('click', (ev) => {
      ev.stopPropagation();
      const abrir = $(m).hidden;
      cerrarMenus();
      $(m).hidden = !abrir;
      $(b).setAttribute('aria-expanded', abrir ? 'true' : 'false');
      if (abrir) $(m).querySelector('li:not([hidden]) [role^="menuitem"]')?.focus();
    });
    $(m).addEventListener('keydown', (ev) => {
      const items = [...$(m).querySelectorAll('li:not([hidden]) [role^="menuitem"]')];
      const i = items.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length]?.focus(); }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    });
  }
  document.addEventListener('click', (ev) => { if (!ev.target.closest('.topo-menu')) cerrarMenus(); });

  document.querySelectorAll('#topo-exportar-menu [data-exportar]').forEach((b) => b.addEventListener('click', async () => {
    cerrarMenus();
    const tipo = b.dataset.exportar;
    const slug = estado.vista?.slug;
    const titulo = `${estado.vista?.name || 'Mapa'} · ${new Date().toLocaleString('es-EC')}`;
    try {
      if (tipo === 'json') exportarJSON(estado);
      else if (tipo === 'svg') exportarSVG(lienzo.exportarSVG(titulo), slug);
      else if (tipo === 'png2d') await exportarPNGDesdeSVG(lienzo.exportarSVG(titulo), slug, 2);
      else if (tipo === 'png3d' && escena) await exportarCanvasPNG(escena.exportarCanvas(titulo), slug);
      toast('Exportación generada', 'success', 2500);
    } catch (err) { toast(err.message || 'No se pudo exportar', 'error'); }
  }));

  $('#topo-animaciones').addEventListener('click', () => estado.fijarAnimaciones(!estado.animaciones));
  // Calidad 3D: alta (partículas, animación ambiental, resolución alta) o rendimiento
  const botonCalidad = $('#topo-rendimiento3d');
  const pintarCalidad = () => botonCalidad.setAttribute('aria-checked', estado.calidad3d === 'rendimiento' ? 'true' : 'false');
  botonCalidad.addEventListener('click', () => estado.fijarCalidad3d(estado.calidad3d === 'rendimiento' ? 'alta' : 'rendimiento'));
  // Disposición 3D: sala de datos ordenada o posiciones del editor 2D
  const pintarDisposicion = () => {
    $('#topo-disposicion-sala').setAttribute('aria-checked', estado.disposicion3d === 'sala' ? 'true' : 'false');
    $('#topo-disposicion-editor').setAttribute('aria-checked', estado.disposicion3d === 'editor' ? 'true' : 'false');
  };
  $('#topo-disposicion-sala').addEventListener('click', () => { cerrarMenus(); estado.fijarDisposicion3d('sala'); });
  $('#topo-disposicion-editor').addEventListener('click', () => { cerrarMenus(); estado.fijarDisposicion3d('editor'); });
  estado.on('disposicion3d', () => {
    pintarDisposicion();
    pintarAislados();
    if (aisladosCargados !== null && aisladosCargados !== incluirAislados()) { recargar({ conservarPosiciones: true }); return; }
    if (escena) escena.reconstruir({ encuadrar: true }); else pendiente3d = true;
  });
  pintarDisposicion();
  estado.on('calidad3d', () => {
    pintarCalidad();
    // El antialias se fija al crear el contexto WebGL: si cambia, se recrea la escena
    if (escena?.requiereRecrear()) {
      escena.dispose();
      escena = null; cargando3d = null; pendiente3d = true;
      if (estado.modo === '3d') cambiarModo('3d');
    }
  });
  pintarCalidad();
  $('#topo-ver-filtros').addEventListener('click', (ev) => {
    const visible = document.body.classList.toggle('topo-sin-filtros') === false;
    ev.currentTarget.setAttribute('aria-checked', visible ? 'true' : 'false');
  });
  // En la sala de racks ya se ven todos los servidores: la opción solo aplica al 2D y al editor
  function pintarAislados() {
    const li = $('#topo-ver-aislados').closest('li');
    if (li) li.hidden = enSalaRacks();
    pintarCobertura();
  }
  $('#topo-ver-aislados').addEventListener('click', (ev) => {
    includeIsolated = !includeIsolated;
    ev.currentTarget.textContent = includeIsolated ? 'Ocultar servidores sin relaciones' : 'Mostrar todos los servidores';
    cerrarMenus();
    recargar();
  });

  const modalAyuda = $('#topo-modal-ayuda');
  let liberarAyuda = null;
  function abrirAyuda() {
    cerrarMenus();
    modalAyuda.hidden = false;
    liberarAyuda = atraparFoco(modalAyuda);
    modalAyuda.querySelector('.topo-modal__acciones [data-accion="cancelar"]').focus();
  }
  function cerrarAyuda() { modalAyuda.hidden = true; liberarAyuda?.(); escenario.focus(); }
  $('#topo-ver-ayuda').addEventListener('click', abrirAyuda);
  modalAyuda.querySelectorAll('[data-accion="cancelar"]').forEach((b) => b.addEventListener('click', cerrarAyuda));
  modalAyuda.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); cerrarAyuda(); } });

  // Vistas: el mismo modal crea una vista nueva o renombra/elimina la actual.
  // Cada vista guarda sus propias posiciones; cambiar de vista recarga el grafo.
  const modalVista = $('#topo-modal-vista');
  const btnEliminarVista = modalVista.querySelector('[data-accion="eliminar-vista"]');
  let liberarVista = null;
  let vistaEditada = null;
  const vistaActual = () => estado.vistas?.find((v) => v.slug === $('#topo-vista').value) || estado.vista || null;

  function abrirModalVista(vista = null) {
    vistaEditada = vista;
    const f = modalVista.querySelector('form');
    f.reset();
    if (vista) {
      f.elements.name.value = vista.name || '';
      f.elements.description.value = vista.description || '';
    }
    $('#topo-modal-vista-titulo').textContent = vista ? 'Editar vista' : 'Nueva vista';
    f.querySelector('[type="submit"]').textContent = vista ? 'Guardar cambios' : 'Crear vista';
    // La vista predeterminada no se puede eliminar (la API responde 409)
    btnEliminarVista.hidden = !vista || Boolean(vista.isDefault);
    modalVista.querySelector('.topo-form__error-general').hidden = true;
    modalVista.hidden = false;
    liberarVista = atraparFoco(modalVista);
    modalVista.querySelector('input').focus();
  }
  $('#topo-vista-nueva').addEventListener('click', () => abrirModalVista(null));
  $('#topo-vista-editar').addEventListener('click', () => {
    const v = vistaActual();
    if (v) abrirModalVista(v); else toast('No hay una vista seleccionada', 'warning');
  });
  const cerrarVista = () => { modalVista.hidden = true; vistaEditada = null; liberarVista?.(); };
  modalVista.querySelectorAll('[data-accion="cancelar"]').forEach((b) => b.addEventListener('click', cerrarVista));
  modalVista.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); cerrarVista(); } });
  modalVista.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const err = modalVista.querySelector('.topo-form__error-general');
    const name = f.elements.name.value.trim();
    if (!name) { err.textContent = 'El nombre es obligatorio.'; err.hidden = false; return; }
    const description = f.elements.description.value.trim() || null;
    try {
      if (vistaEditada) {
        const { view } = await api.editarVista(vistaEditada.id, { name, description });
        cerrarVista();
        await cargarVistas();
        if (estado.vista && String(estado.vista.id) === String(view.id)) estado.vista = { ...estado.vista, name: view.name, description: view.description };
        toast(`Vista "${view.name}" guardada`, 'success');
        return;
      }
      const { view } = await api.crearVista({ name, description });
      cerrarVista();
      vistaSel = view.slug;
      await cargarVistas();
      actualizarUrl();
      await recargar();
      toast(`Vista "${view.name}" creada`, 'success');
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  });
  btnEliminarVista.addEventListener('click', async () => {
    const v = vistaEditada;
    if (!v) return;
    cerrarVista();
    const ok = await confirmAction({
      title: 'Eliminar vista',
      message: `Se eliminará la vista "${v.name}" y las posiciones guardadas en ella. Los servidores y sus relaciones no cambian.`,
      confirmText: 'Eliminar',
    });
    if (!ok) return;
    try {
      await api.eliminarVista(v.id);
      vistaSel = null;
      await cargarVistas();
      actualizarUrl();
      await recargar();
      toast(`Vista "${v.name}" eliminada`, 'success');
    } catch (e) { toast(e.message || 'No se pudo eliminar la vista', 'error'); }
  });

  $('#topo-nueva-relacion').addEventListener('click', () => formulario.abrir({ origen: estado.seleccion?.tipo === 'nodo' ? estado.seleccion.id : null }));
  $('#topo-simular').addEventListener('click', () => (estado.simulando ? simulador.desactivar() : simulador.activar()));
  $('#topo-lista').addEventListener('click', () => lista.abrir());

  // ── Búsqueda ─────────────────────────────────────────────────────────────
  const buscador = $('#topo-buscar');
  const listaBusqueda = $('#topo-buscar-lista');
  let coincidencias = [];
  let activa = 0;
  function pintarBusqueda() {
    const q = buscador.value.trim().toLowerCase();
    if (q.length < 2) { listaBusqueda.hidden = true; buscador.setAttribute('aria-expanded', 'false'); return; }
    coincidencias = estado.nodosVisibles().filter((n) => `${n.name} ${n.ip || ''} ${n.hostname || ''}`.toLowerCase().includes(q)).slice(0, 8);
    activa = Math.min(activa, Math.max(0, coincidencias.length - 1));
    listaBusqueda.replaceChildren(...(coincidencias.length ? coincidencias.map((n, i) => h('li', {
      role: 'option', id: `topo-busq-${i}`, class: `topo-combo__op${i === activa ? ' es-activa' : ''}`, 'aria-selected': i === activa ? 'true' : 'false',
      onMousedown: (ev) => { ev.preventDefault(); elegirBusqueda(n); },
    }, h('span', { class: 'topo-combo__nombre' }, n.name), h('span', { class: 'topo-combo__ip' }, `${(TIPOS_SERVIDOR[n.type] || {}).badge || ''} · ${n.ip || ''}`))) : [h('li', { class: 'topo-combo__vacio' }, 'Sin coincidencias')]));
    listaBusqueda.hidden = false;
    buscador.setAttribute('aria-expanded', 'true');
    buscador.setAttribute('aria-activedescendant', coincidencias.length ? `topo-busq-${activa}` : '');
  }
  function elegirBusqueda(n) {
    listaBusqueda.hidden = true;
    buscador.setAttribute('aria-expanded', 'false');
    buscador.value = n.name;
    seleccionar({ tipo: 'nodo', id: n.id }, { enfocar: true, parpadeo: true });
  }
  buscador.addEventListener('input', () => { activa = 0; pintarBusqueda(); });
  buscador.addEventListener('blur', () => setTimeout(() => { listaBusqueda.hidden = true; buscador.setAttribute('aria-expanded', 'false'); }, 100));
  buscador.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); activa = Math.min(coincidencias.length - 1, activa + 1); pintarBusqueda(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); activa = Math.max(0, activa - 1); pintarBusqueda(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (coincidencias[activa]) elegirBusqueda(coincidencias[activa]); }
    else if (ev.key === 'Escape' && !listaBusqueda.hidden) { ev.stopPropagation(); listaBusqueda.hidden = true; }
  });

  // ── Teclado ──────────────────────────────────────────────────────────────
  escenario.addEventListener('keydown', (ev) => {
    if (ev.target !== escenario && !ev.target.closest('.topo-3d, .topo-lienzo')) return;
    const nodos = [...estado.nodosVisibles()].sort((a, b) => a.name.localeCompare(b.name));
    const actual = estado.seleccion?.tipo === 'nodo' ? nodos.findIndex((n) => String(n.id) === estado.seleccion.id) : -1;
    const k = ev.key;
    if (k === 'n' || k === 'N') {
      if (!nodos.length) return;
      const i = ev.shiftKey ? (actual <= 0 ? nodos.length - 1 : actual - 1) : (actual + 1) % nodos.length;
      enfocar(nodos[i].id);
    } else if (k === 'Enter' && estado.seleccion) inspector.actualizar();
    else if ((k === 's' || k === 'S') && estado.seleccion?.tipo === 'nodo') simulador.alternar(estado.seleccion.id);
    else if (k === 'f' || k === 'F') { if (estado.modo === '3d') escena?.encajar(); else lienzo.encajar(); }
    else if (k === '+' || k === '=') { if (estado.modo === '3d') escena?.zoom(0.8); else lienzo.zoom(1.2); }
    else if (k === '-') { if (estado.modo === '3d') escena?.zoom(1.25); else lienzo.zoom(1 / 1.2); }
    else if (k === '?') abrirAyuda();
    else if (estado.modo === '2d' && k.startsWith('Arrow')) {
      const d = 40;
      lienzo.pan(k === 'ArrowLeft' ? d : k === 'ArrowRight' ? -d : 0, k === 'ArrowUp' ? d : k === 'ArrowDown' ? -d : 0);
    } else return;
    ev.preventDefault();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    // Prioridad: menú o modal → simulación → inspector → selección
    if (cerrarMenus()) return;
    if (document.querySelector('.ui-confirm-overlay')) return; // lo cierra modalConfirm
    if (formulario.estaAbierto()) { formulario.cerrar(); return; }
    if (lista.estaAbierta()) { lista.cerrar(); return; }
    if (!modalAyuda.hidden) { cerrarAyuda(); return; }
    if (!modalVista.hidden) { cerrarVista(); return; }
    if (estado.simulando) { simulador.desactivar(); return; }
    if (inspector.estaAbierto()) { inspector.cerrar(); return; }
    estado.seleccionar(null);
  });

  // ── Arranque ─────────────────────────────────────────────────────────────
  estado.fijarAnimaciones(estado.animaciones);
  estado.emitir('guardado', estado.estadoGuardado);
  if (!webgl) avisoSinWebgl('Tu equipo o navegador no admite gráficos 3D (WebGL). Se muestra el Editor 2D.');
  await cambiarModo(estado.modo);
  await Promise.all([cargarVistas(), cargarInventario()]);
  await recargar();
  iniciarTiempoReal();
  if (focoInicial) {
    // Un servidor sin relaciones ni posición en la vista no viene en el grafo: se muestran todos
    if (!estado.nodoPorId.has(String(focoInicial)) && /^\d+$/.test(focoInicial)) {
      includeIsolated = true;
      $('#topo-ver-aislados').textContent = 'Ocultar servidores sin relaciones';
      await recargar();
    }
    if (estado.nodoPorId.has(String(focoInicial))) {
      setTimeout(() => seleccionar({ tipo: 'nodo', id: focoInicial }, { enfocar: true, parpadeo: true }), 50);
    } else toast('No se encontró el servidor solicitado', 'warning');
  }
  // ── Tiempo real ──────────────────────────────────────────────────────────
  // Inventario: el servidor avisa por SSE (/events, evento "update") al crear, editar o borrar
  // servidores y racks. Monitoreo: refresco ligero periódico del grafo. Ninguno recarga la
  // página ni mueve la cámara: si nada cambió, no se redibuja.
  function iniciarTiempoReal() {
    let pendiente = 0;
    let enCurso = false;
    const actualizar = async () => {
      if (enCurso || document.hidden || estado.simulando) return;
      enCurso = true;
      try {
        await cargarInventario();
        await recargar({ conservarPosiciones: true, silencioso: true });
      } finally { enCurso = false; }
    };
    const programar = (ms = 400) => { clearTimeout(pendiente); pendiente = setTimeout(actualizar, ms); };
    try {
      const fuente = new EventSource('/events');
      // Referencia global para cerrarla al cerrar sesión (como en /fisicos)
      window.__eventosServidor = fuente;
      fuente.addEventListener('update', () => programar());
    } catch { /* sin SSE queda el refresco periódico */ }
    setInterval(() => programar(0), INTERVALO_VIVO_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) programar(0); });
  }

  // Exposición mínima para las pruebas automatizadas en navegador
  window.__topologia = { estado, escena: () => escena, lienzo, simulador };
}

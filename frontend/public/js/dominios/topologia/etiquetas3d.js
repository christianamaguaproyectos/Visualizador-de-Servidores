/**
 * Etiquetas CSS2D de los nodos con nivel de detalle por distancia.
 * El DOM se construye con createElement/textContent (nunca innerHTML con datos).
 * CSS2DRenderer las posiciona con element.style.transform (CSSOM, permitido por la CSP).
 */
import { Vector3 } from '/vendor/three/three.module.js';
import { CSS2DObject } from '/vendor/three/addons/renderers/CSS2DRenderer.js';
import { ESTADOS, TIPOS_SERVIDOR, colorDeNodo, pildoraImpacto } from './constantesVisuales.js';

const ALTURA = { fisicos: 3.55, virtuales: 1.95 };
// Máximo de etiquetas visibles a la vez (las más cercanas; las importantes siempre)
const MAX_VISIBLES = { alta: 40, minimas: 16 };
// Separación vertical (px) entre la etiqueta y su ancla (margin-bottom del CSS) y entre escalones
const MARGEN_ANCLA_PX = 12;
const SEPARACION_PX = 4;
const tmpV = new Vector3();

export function crearEtiquetas3D(escena) {
  let registros = new Map();
  // Opciones de la sala de racks: ancla en la unidad del servidor, línea de detalle (rack/U o
  // host) y etiquetas "discretas" (el frente del rack ya rotula el nombre: solo se muestran
  // con hover, selección, caída o impacto)
  let opciones = {};

  function crearElemento() {
    const raiz = document.createElement('div');
    raiz.className = 'topo-etq';
    const fila = document.createElement('div');
    fila.className = 'topo-etq__fila';
    const badge = document.createElement('span');
    const nombre = document.createElement('span');
    nombre.className = 'topo-etq__nombre';
    fila.append(badge, nombre);
    const ip = document.createElement('div');
    ip.className = 'topo-etq__ip';
    const detalle = document.createElement('div');
    detalle.className = 'topo-etq__detalle';
    const estado = document.createElement('div');
    estado.className = 'topo-etq__estado';
    const punto = document.createElement('span');
    punto.className = 'topo-etq__punto';
    const textoEstado = document.createElement('span');
    const pildora = document.createElement('span');
    estado.append(punto, textoEstado);
    raiz.append(fila, ip, detalle, estado, pildora);
    return { raiz, badge, nombre, ip, detalle, estado, punto, textoEstado, pildora };
  }

  /**
   * @param {{anclaDe?: (id) => number[]|null, detalleDe?: (n) => string, discreta?: (id) => boolean}} [opc]
   */
  function construir(nodos, centroDe, nombreDe, opc = {}) {
    limpiar();
    opciones = opc;
    for (const n of nodos) {
      const c = centroDe(n.id);
      if (!c) continue;
      const el = crearElemento();
      const obj = new CSS2DObject(el.raiz);
      obj.center.set(0.5, 1); // la etiqueta queda por encima del ancla
      const ancla = opciones.anclaDe?.(n.id);
      if (ancla) obj.position.set(...ancla); else obj.position.set(c.x, ALTURA[n.type] ?? 1.95, c.z);
      escena.add(obj);
      const reg = { id: String(n.id), obj, el, nodo: n, centro: c, discreta: Boolean(opciones.discreta?.(n.id)) };
      registros.set(reg.id, reg);
      rellenar(reg, nombreDe);
    }
  }

  function rellenar(reg, nombreDe) {
    const { el, nodo: n } = reg;
    reg.tam = {}; // el contenido cambia: se vuelve a medir
    const tipo = TIPOS_SERVIDOR[n.type] || TIPOS_SERVIDOR.virtuales;
    el.badge.className = `topo-badge ${n.type === 'fisicos' ? 'topo-badge--fisico' : 'topo-badge--vm'}`;
    el.badge.textContent = tipo.badge;
    el.nombre.textContent = n.name || `Servidor ${n.id}`;
    el.ip.textContent = n.ip || '—';
    const detalle = opciones.detalleDe?.(n) || '';
    el.detalle.textContent = detalle;
    el.detalle.hidden = !detalle;
    const estado = ESTADOS[n.status] || ESTADOS.UNKNOWN;
    el.textoEstado.textContent = estado.texto;
    const color = n.isDown ? colorDeNodo(n) : estado.color;
    el.punto.style.backgroundColor = color;
    el.textoEstado.style.color = color;
    el.raiz.style.setProperty('--topo-etq-color', color);
    const p = pildoraImpacto(n, nombreDe);
    el.pildora.className = p ? `topo-pildora topo-pildora--${p.clase}` : 'topo-pildora';
    el.pildora.textContent = p ? p.texto : '';
    el.pildora.hidden = !p;
    // Caída real: la etiqueta entera en rojo, legible sin hover
    el.raiz.classList.toggle('topo-etq--caida', p?.clase === 'caido');
  }

  function actualizarDatos(nodos, nombreDe, estiloDe) {
    for (const n of nodos) {
      const reg = registros.get(String(n.id));
      if (!reg) continue;
      reg.nodo = n;
      // Solo se reescribe el DOM si cambió algo visible (el hover no cambia los datos)
      const firma = [n.name, n.ip, n.status, n.type, n.isDown, n.downSource, n.cascadeStatus, n.impactLevel, (n.impactedByServers || []).join(','), opciones.detalleDe?.(n) || ''].join('|');
      if (reg.firma !== firma) { reg.firma = firma; rellenar(reg, nombreDe); }
      const atenuada = estiloDe(n).atenuado;
      if (reg.atenuada !== atenuada) { reg.atenuada = atenuada; reg.el.raiz.classList.toggle('topo-etq--atenuada', atenuada); }
    }
  }

  /**
   * Nivel de detalle por distancia a la cámara. Solo toca el DOM cuando el nivel cambia.
   * @param {THREE.Camera} camara
   * @param {Set<string>} siempre IDs que deben mostrar al menos nombre y estado
   * @param {Set<string>} completos IDs con etiqueta completa (hover y selección)
   * @param {{minimas?: boolean, ancho?: number, alto?: number}} opciones minimas: solo el
   *   nombre (modo rendimiento); ancho/alto: tamaño en px del lienzo (evita solapes)
   */
  function nivelDetalle(camara, siempre, completos, { minimas = false, ancho = 0, alto = 0 } = {}) {
    // Umbral de etiqueta completa: 30 u (22 con muchos nodos)
    const umbralCompleto = minimas ? -1 : registros.size > 80 ? 22 : 30;
    const lista = [];
    for (const reg of registros.values()) {
      reg.distancia = camara.position.distanceTo(reg.obj.position);
      // Prioridad: hover/selección > caídos > impactados > resto
      reg.prioridad = completos.has(reg.id) || siempre.has(reg.id) ? 3 : reg.nodo.isDown ? 2 : reg.nodo.cascadeStatus !== 'NONE' ? 1 : 0;
      // Siempre visibles: el seleccionado, el del hover y las caídas simuladas. Las caídas
      // reales e impactados se ven en rojo/naranja en el propio equipo; su etiqueta solo
      // aparece de cerca o al pulsarlos (al entrar no se llena la sala de burbujas).
      const simulado = reg.nodo.downSource === 'SIMULATED' || reg.nodo.downSource === 'BOTH';
      reg.importante = reg.prioridad === 3 || simulado;
      lista.push(reg);
    }
    // Las importantes primero y luego por cercanía; el resto se oculta pasado el máximo
    lista.sort((a, b) => (b.prioridad - a.prioridad) || (a.distancia - b.distancia));
    const maximo = minimas ? MAX_VISIBLES.minimas : MAX_VISIBLES.alta;
    const ocupados = [];
    lista.forEach((reg, i) => {
      const d = reg.distancia;
      let nivel = d < umbralCompleto ? 'completa' : d < 90 ? 'compacta' : 'oculta';
      if (completos.has(reg.id)) nivel = 'completa';
      else if (nivel === 'oculta' && reg.importante) nivel = 'compacta';
      if (i >= maximo && !reg.importante && !completos.has(reg.id)) nivel = 'oculta';
      if (reg.discreta && !reg.importante) nivel = 'oculta';
      let escalon = 0;
      if (nivel !== 'oculta' && ancho > 0 && alto > 0) [nivel, escalon] = colocarSinSolape(reg, nivel, camara, ancho, alto, ocupados, completos.has(reg.id));
      reg.obj.visible = nivel !== 'oculta';
      if (reg.nivel !== nivel) {
        reg.nivel = nivel;
        reg.el.raiz.classList.toggle('topo-etq--compacta', nivel === 'compacta');
      }
      // Escalón: la etiqueta sube y una guía vertical la une con su equipo
      const subida = escalon ? escalon * (tamano(reg, nivel).h + SEPARACION_PX) : 0;
      const centroY = subida ? 1 + subida / tamano(reg, nivel).h : 1;
      if (reg.obj.center.y !== centroY) reg.obj.center.y = centroY;
      if (reg.subida !== subida) {
        reg.subida = subida;
        reg.el.raiz.classList.toggle('topo-etq--escalonada', subida > 0);
        reg.el.raiz.style.setProperty('--topo-etq-guia', `${subida + MARGEN_ANCLA_PX}px`);
      }
    });
  }

  /** Tamaño en px de la etiqueta en un nivel: medido si ya se dibujó, si no estimado */
  function tamano(reg, nivel) {
    reg.tam ??= {};
    if (reg.tam[nivel]) return reg.tam[nivel];
    const raiz = reg.el.raiz;
    if (reg.nivel === nivel && reg.obj.visible && raiz.style.display !== 'none' && raiz.offsetWidth > 0) {
      reg.tam[nivel] = { w: raiz.offsetWidth, h: raiz.offsetHeight };
      return reg.tam[nivel];
    }
    const largo = String(reg.nodo.name || '').length;
    const w = Math.min(260, 30 + largo * 7.6);
    return nivel === 'compacta' ? { w, h: 25 } : { w: Math.max(w + 24, 150), h: reg.el.pildora.hidden ? 74 : 98 };
  }

  /**
   * Busca un hueco sin solapes en pantalla: primero sobre su equipo y, si choca, un escalón más
   * arriba (dos las importantes). Las de prioridad baja se reducen a compactas y, si aun así
   * chocan, se ocultan (reaparecen con el hover).
   * @returns {[string, number]} nivel final y escalón (0 = sobre su equipo)
   */
  function colocarSinSolape(reg, nivel, camara, ancho, alto, ocupados, fija) {
    tmpV.copy(reg.obj.position).project(camara);
    if (tmpV.z < -1 || tmpV.z > 1) return [nivel, 0];
    const sx = (tmpV.x * 0.5 + 0.5) * ancho;
    const sy = (-tmpV.y * 0.5 + 0.5) * alto;
    const niveles = nivel === 'completa' && !fija ? ['completa', 'compacta'] : [nivel];
    // Escalonadas: siguen centradas sobre su equipo, un escalón más arriba si la de abajo choca
    const escalones = [0, 1, 2];
    for (const nv of niveles) {
      const { w, h } = tamano(reg, nv);
      for (const k of escalones) {
        const y1 = sy - MARGEN_ANCLA_PX - k * (h + SEPARACION_PX);
        const r = { x0: sx - w / 2 - 2, x1: sx + w / 2 + 2, y0: y1 - h - 2, y1: y1 + 2 };
        if (!ocupados.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0)) {
          ocupados.push(r);
          return [nv, k];
        }
      }
    }
    if (!reg.importante) return ['oculta', 0];
    // Importante sin hueco: se muestra igualmente sobre su equipo (compacta si no es la fija)
    const nv = niveles[niveles.length - 1];
    const { w, h } = tamano(reg, nv);
    ocupados.push({ x0: sx - w / 2, x1: sx + w / 2, y0: sy - MARGEN_ANCLA_PX - h, y1: sy - MARGEN_ANCLA_PX });
    return [nv, 0];
  }

  function limpiar() {
    for (const reg of registros.values()) escena.remove(reg.obj);
    registros = new Map();
  }

  /** Datos para componer el PNG del 3D */
  function paraExportar() {
    return [...registros.values()].filter((r) => r.obj.visible).map((r) => ({
      posicion: r.obj.position, nombre: r.nodo.name, color: r.nodo.isDown ? colorDeNodo(r.nodo) : (ESTADOS[r.nodo.status] || ESTADOS.UNKNOWN).color,
      atenuada: r.el.raiz.classList.contains('topo-etq--atenuada'),
    }));
  }

  return { construir, actualizarDatos, nivelDetalle, paraExportar, dispose: limpiar };
}

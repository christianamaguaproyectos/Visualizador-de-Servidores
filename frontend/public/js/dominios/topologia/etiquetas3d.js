/**
 * Etiquetas CSS2D de los nodos (§4.1) con nivel de detalle por distancia.
 * El DOM se construye con createElement/textContent (nunca innerHTML con datos).
 * CSS2DRenderer las posiciona con element.style.transform (CSSOM, permitido por la CSP).
 */
import { CSS2DObject } from '/vendor/three/addons/renderers/CSS2DRenderer.js';
import { ESTADOS, TIPOS_SERVIDOR, colorDeNodo, pildoraImpacto } from './constantesVisuales.js';

const ALTURA = { fisicos: 2.55, virtuales: 1.95 };

export function crearEtiquetas3D(escena) {
  let registros = new Map();

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
    const estado = document.createElement('div');
    estado.className = 'topo-etq__estado';
    const punto = document.createElement('span');
    punto.className = 'topo-etq__punto';
    const textoEstado = document.createElement('span');
    const pildora = document.createElement('span');
    estado.append(punto, textoEstado);
    raiz.append(fila, ip, estado, pildora);
    return { raiz, badge, nombre, ip, estado, punto, textoEstado, pildora };
  }

  function construir(nodos, centroDe, nombreDe) {
    limpiar();
    for (const n of nodos) {
      const c = centroDe(n.id);
      if (!c) continue;
      const el = crearElemento();
      const obj = new CSS2DObject(el.raiz);
      obj.center.set(0.5, 1); // la etiqueta queda por encima del ancla
      obj.position.set(c.x, ALTURA[n.type] ?? 1.95, c.z);
      escena.add(obj);
      const reg = { id: String(n.id), obj, el, nodo: n, centro: c };
      registros.set(reg.id, reg);
      rellenar(reg, nombreDe);
    }
  }

  function rellenar(reg, nombreDe) {
    const { el, nodo: n } = reg;
    const tipo = TIPOS_SERVIDOR[n.type] || TIPOS_SERVIDOR.virtuales;
    el.badge.className = `topo-badge ${n.type === 'fisicos' ? 'topo-badge--fisico' : 'topo-badge--vm'}`;
    el.badge.textContent = tipo.badge;
    el.nombre.textContent = n.name || `Servidor ${n.id}`;
    el.ip.textContent = n.ip || '—';
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
  }

  function actualizarDatos(nodos, nombreDe, estiloDe) {
    for (const n of nodos) {
      const reg = registros.get(String(n.id));
      if (!reg) continue;
      reg.nodo = n;
      rellenar(reg, nombreDe);
      reg.raiz = reg.el.raiz;
      reg.el.raiz.classList.toggle('topo-etq--atenuada', estiloDe(n).atenuado);
    }
  }

  /**
   * Nivel de detalle por distancia a la cámara.
   * @param {THREE.Camera} camara
   * @param {Set<string>} siempre IDs que deben mostrar al menos nombre y estado
   */
  function nivelDetalle(camara, siempre, completos) {
    // Umbral de etiqueta completa: 30 u (la especificación pedía 45; con el encuadre ajustado
    // casi toda la escena queda a <45 u y las etiquetas completas se solapaban)
    const umbralCompleto = registros.size > 80 ? 22 : 30;
    for (const reg of registros.values()) {
      const d = camara.position.distanceTo(reg.obj.position);
      const importante = siempre.has(reg.id) || reg.nodo.isDown || reg.nodo.cascadeStatus !== 'NONE';
      let nivel = d < umbralCompleto ? 'completa' : d < 90 ? 'compacta' : 'oculta';
      if (completos.has(reg.id)) nivel = 'completa';
      else if (nivel === 'oculta' && importante) nivel = 'compacta';
      reg.obj.visible = nivel !== 'oculta';
      reg.el.raiz.classList.toggle('topo-etq--compacta', nivel === 'compacta');
    }
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

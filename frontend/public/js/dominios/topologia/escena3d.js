/**
 * Escena 3D del mapa de dependencias (§7). Se carga con import() dinámico solo al
 * entrar en el modo 3D: el Editor 2D nunca descarga three.js.
 *
 * Render bajo demanda: solo hay bucle continuo mientras hay animación (partículas,
 * halos, tween de cámara o amortiguamiento de los controles).
 */
import * as THREE from '/vendor/three/three.module.js';
import { OrbitControls } from '/vendor/three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from '/vendor/three/addons/renderers/CSS2DRenderer.js';
import { ESCENARIO, ESCALA_3D, LAYOUT } from './constantesVisuales.js';
import { crearModelosNodos } from './modelos3d.js';
import { crearAristas3D } from './aristas3d.js';
import { crearEtiquetas3D } from './etiquetas3d.js';

const GRADOS = Math.PI / 180;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * @param {{ contenedor: HTMLElement, estado: object, alClicNodo: Function, alClicArista: Function,
 *           alClicVacio: Function, alPerderContexto: Function, alMoverCamara?: Function }} opciones
 */
export function crearEscena3D({ contenedor, elementoTeclado = null, estado, alClicNodo, alClicArista, alClicVacio, alPerderContexto, alMoverCamara }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  let ratio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(ratio);
  renderer.domElement.className = 'topo-3d__canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  contenedor.appendChild(renderer.domElement);

  const rotulos = new CSS2DRenderer();
  rotulos.domElement.className = 'topo-3d__rotulos';
  contenedor.appendChild(rotulos.domElement);

  const escena = new THREE.Scene();
  escena.background = new THREE.Color(ESCENARIO.fondo);
  escena.fog = new THREE.Fog(ESCENARIO.fondo, ESCENARIO.niebla[0], ESCENARIO.niebla[1]);
  escena.add(new THREE.HemisphereLight(0xcfe0ff, ESCENARIO.fondo, 0.65));
  const sol = new THREE.DirectionalLight(0xffffff, 1.1);
  sol.position.set(30, 50, 25);
  escena.add(sol);

  // Suelo y cuadrícula (celdas de 4 u)
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: ESCENARIO.suelo, roughness: 0.95, metalness: 0 }));
  suelo.rotation.x = -Math.PI / 2;
  escena.add(suelo);
  let rejilla = null;
  function crearRejilla(tam) {
    if (rejilla) { escena.remove(rejilla); rejilla.geometry.dispose(); rejilla.material.dispose(); }
    const div = Math.max(10, Math.round(tam / 4));
    rejilla = new THREE.GridHelper(div * 4, div, ESCENARIO.rejillaMayor, ESCENARIO.rejillaMenor);
    rejilla.material.transparent = true;
    rejilla.material.opacity = 0.35;
    rejilla.material.depthWrite = false;
    rejilla.position.y = 0.001;
    escena.add(rejilla);
  }

  const camara = new THREE.PerspectiveCamera(45, 1, 0.5, 600);
  const controles = new OrbitControls(camara, renderer.domElement);
  controles.dampingFactor = 0.08;
  controles.minDistance = 6;
  controles.maxDistance = 180;
  controles.minPolarAngle = 10 * GRADOS;
  controles.maxPolarAngle = 82 * GRADOS;
  controles.screenSpacePanning = false;
  controles.listenToKeyEvents(elementoTeclado || contenedor);
  controles.keyPanSpeed = 25;

  const nodos3d = crearModelosNodos(escena);
  const aristas3d = crearAristas3D(escena);
  const etiquetas = crearEtiquetas3D(escena);

  let caja = new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 0, 10));
  let centros = new Map();
  let tipos = new Map();
  let raf = 0;
  let pedido = false;
  let activo = true;
  let tween = null;
  let ultimoT = performance.now();
  let reloj = 0;
  let hoverPendiente = null;
  let hoverActual = null;
  const raycaster = new THREE.Raycaster();
  const puntero = new THREE.Vector2();
  // Medición de fps de los 3 primeros segundos
  const medicion = { inicio: 0, frames: 0, hecha: false };

  function animaciones() { return estado.animaciones; }
  controles.enableDamping = animaciones();

  // ── Datos → escena ───────────────────────────────────────────────────────
  // Factor Z constante (no solo con layout por defecto): así guardar posiciones no
  // cambia la disposición 3D en la siguiente carga. Es solo visual y no se guarda.
  function factorZ() { return LAYOUT.factorZ3d; }
  function aEspacio(p) { return new THREE.Vector3(p.x * ESCALA_3D, 0, p.y * ESCALA_3D * factorZ()); }

  function reconstruir({ encuadrar = false } = {}) {
    const nodos = estado.nodosVisibles();
    const aristas = estado.aristasVisibles(nodos);
    centros = new Map();
    tipos = new Map();
    for (const n of nodos) {
      const p = estado.posiciones.get(String(n.id)) || { x: 0, y: 0 };
      centros.set(String(n.id), aEspacio(p));
      tipos.set(String(n.id), n.type);
    }
    nodos3d.construir(nodos, centros);
    aristas3d.construir(aristas, (id) => centros.get(String(id)), (id) => tipos.get(String(id)));
    etiquetas.construir(nodos, (id) => centros.get(String(id)), nombreDe);
    caja = new THREE.Box3();
    for (const c of centros.values()) caja.expandByPoint(c);
    if (caja.isEmpty()) caja.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 0, 10));
    const tam = caja.getSize(new THREE.Vector3());
    crearRejilla(Math.max(tam.x, tam.z) + 80);
    actualizarEstilos();
    if (encuadrar) encajar({ instantaneo: true });
    pedirRender();
  }

  function nombreDe(id) { return estado.nodoPorId.get(String(id))?.name || `#${id}`; }

  function actualizarEstilos() {
    const nodos = estado.nodosVisibles();
    const sel = estado.seleccion;
    const hov = estado.hover;
    const estiloNodo = (n) => ({ atenuado: estado.nodoAtenuado(n) });
    nodos3d.actualizarEstilos(estiloNodo);
    etiquetas.actualizarDatos(nodos, nombreDe, estiloNodo);
    const nodoFoco = hov?.tipo === 'nodo' ? hov.id : null;
    aristas3d.actualizarEstilos((e) => {
      if (estado.aristaAtenuada(e)) return 'atenuada';
      if (nodoFoco) return String(e.source) === nodoFoco || String(e.target) === nodoFoco ? 'resaltada' : 'tenue';
      if ((hov?.tipo === 'arista' && hov.id === String(e.id)) || (sel?.tipo === 'arista' && sel.id === String(e.id))) return 'resaltada';
      return 'normal';
    }, animaciones());
    nodos3d.fijarSeleccion(sel?.tipo === 'nodo' ? sel.id : null);
    // Escala de hover (nodo, o extremos de la arista)
    const escalados = new Set();
    if (hov?.tipo === 'nodo') escalados.add(hov.id);
    if (hov?.tipo === 'arista') {
      const e = estado.aristaPorId.get(hov.id);
      if (e) { escalados.add(String(e.source)); escalados.add(String(e.target)); }
    }
    for (const id of centros.keys()) nodos3d.fijarEscala(id, escalados.has(id) ? 1.04 : 1);
    const aristaEtq = hov?.tipo === 'arista' ? hov.id : (sel?.tipo === 'arista' ? sel.id : null);
    aristas3d.resaltar(aristaEtq);
    controles.enableDamping = animaciones();
    pedirRender();
  }

  // ── Cámara ───────────────────────────────────────────────────────────────
  function encajar({ instantaneo = false } = {}) {
    // Encaje por ancho (fov horizontal) y por fondo (fov vertical, con la inclinación de la cámara);
    // la esfera envolvente de la especificación dejaba la escena a la mitad del escenario.
    const esfera = caja.getBoundingSphere(new THREE.Sphere());
    const tam = caja.getSize(new THREE.Vector3());
    const mediaV = (camara.fov / 2) * GRADOS;
    const mediaH = Math.atan(Math.tan(mediaV) * camara.aspect);
    const ancho = tam.x / 2 + 3.5;
    const fondo = tam.z / 2 + 3.5;
    // El fondo se ve escorzado por la inclinación (~40°): basta ~0,8 de su tamaño
    const dist = Math.max(18, Math.max(ancho / Math.tan(mediaH), (fondo * 0.8 + 2) / Math.tan(mediaV)) * 1.08);
    const dir = new THREE.Vector3(0, 0.85, 1).normalize();
    // Objetivo algo detrás del centro: la escena baja y deja sitio al resumen superior
    const objetivo = new THREE.Vector3(esfera.center.x, 1, esfera.center.z - tam.z * 0.05);
    moverCamara(objetivo, objetivo.clone().addScaledVector(dir, Math.min(dist, controles.maxDistance)), instantaneo);
  }

  function enfocarNodo(id, { parpadeo = false } = {}) {
    const c = centros.get(String(id));
    if (!c) return false;
    const objetivo = new THREE.Vector3(c.x, 1, c.z);
    const dir = camara.position.clone().sub(controles.target).normalize();
    moverCamara(objetivo, objetivo.clone().addScaledVector(dir, 14), false);
    if (parpadeo) nodos3d.parpadear();
    return true;
  }

  function moverCamara(objetivo, posicion, instantaneo) {
    if (instantaneo || !animaciones()) {
      tween = null;
      controles.target.copy(objetivo);
      camara.position.copy(posicion);
      controles.update();
      pedirRender();
      return;
    }
    tween = { t0: performance.now(), dur: 600, desdeT: controles.target.clone(), desdeP: camara.position.clone(), aT: objetivo, aP: posicion };
    pedirRender();
  }

  function reiniciarCamara() { encajar(); }

  function zoom(factor) {
    const dir = camara.position.clone().sub(controles.target);
    const d = THREE.MathUtils.clamp(dir.length() * factor, controles.minDistance, controles.maxDistance);
    moverCamara(controles.target.clone(), controles.target.clone().add(dir.setLength(d)), true);
  }

  /** Limita el target a la caja de los nodos + 30 u */
  function limitarObjetivo() {
    const t = controles.target;
    const min = caja.min; const max = caja.max;
    const x = THREE.MathUtils.clamp(t.x, min.x - 30, max.x + 30);
    const z = THREE.MathUtils.clamp(t.z, min.z - 30, max.z + 30);
    if (x !== t.x || z !== t.z) {
      const dx = x - t.x; const dz = z - t.z;
      t.x = x; t.z = z;
      camara.position.x += dx; camara.position.z += dz;
    }
  }
  controles.addEventListener('change', () => { limitarObjetivo(); pedirRender(); });

  /** Centra el objetivo en un punto del lienzo 2D (px), usado por el minimapa */
  function centrarEnPx(x, y) {
    const p = aEspacio({ x, y });
    const delta = new THREE.Vector3(p.x - controles.target.x, 0, p.z - controles.target.z);
    controles.target.add(delta);
    camara.position.add(delta);
    controles.update();
    pedirRender();
  }

  /** Huella del frustum sobre el suelo, en px del 2D (para el minimapa) */
  function huellaCamara() {
    const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const puntos = [];
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      raycaster.setFromCamera(new THREE.Vector2(x, y), camara);
      const p = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plano, p) || p.distanceTo(camara.position) > 400) {
        // Rayo por encima del horizonte: se recorta a 400 u
        p.copy(raycaster.ray.direction).setY(0).normalize().multiplyScalar(400).add(camara.position).setY(0);
      }
      puntos.push([p.x / ESCALA_3D, p.z / ESCALA_3D / factorZ()]);
    }
    return puntos;
  }

  // ── Picking ──────────────────────────────────────────────────────────────
  function elegir(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    puntero.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(puntero, camara);
    const hitN = raycaster.intersectObjects(nodos3d.objetosPicking(), false)[0];
    const hitE = raycaster.intersectObjects(aristas3d.objetosPicking(), false)[0];
    // Los nodos tienen prioridad: son el objetivo principal y las aristas convergen sobre ellos
    if (hitN) {
      const id = nodos3d.idDesdeInterseccion(hitN);
      if (id) return { tipo: 'nodo', id };
    }
    if (hitE) {
      const id = aristas3d.idDesdeInterseccion(hitE);
      if (id) return { tipo: 'arista', id };
    }
    return null;
  }

  const lienzo = renderer.domElement;
  let abajo = null;
  lienzo.addEventListener('pointermove', (ev) => {
    hoverPendiente = [ev.clientX, ev.clientY];
    pedirRender();
  });
  lienzo.addEventListener('pointerleave', () => { hoverPendiente = null; estado.fijarHover(null); });
  lienzo.addEventListener('pointerdown', (ev) => { abajo = [ev.clientX, ev.clientY]; });
  lienzo.addEventListener('pointerup', (ev) => {
    if (!abajo) return;
    const movido = Math.hypot(ev.clientX - abajo[0], ev.clientY - abajo[1]);
    abajo = null;
    if (movido > 4 || ev.button !== 0) return;
    const hit = elegir(ev.clientX, ev.clientY);
    if (hit?.tipo === 'nodo') alClicNodo(hit.id, ev);
    else if (hit?.tipo === 'arista') alClicArista(hit.id, ev);
    else alClicVacio();
  });
  lienzo.addEventListener('dblclick', (ev) => {
    const hit = elegir(ev.clientX, ev.clientY);
    if (hit?.tipo === 'nodo') enfocarNodo(hit.id);
  });

  function procesarHover() {
    if (!hoverPendiente) return;
    const [x, y] = hoverPendiente;
    hoverPendiente = null;
    const hit = elegir(x, y);
    lienzo.classList.toggle('es-apuntable', Boolean(hit));
    const clave = hit ? `${hit.tipo}:${hit.id}` : null;
    if (clave !== hoverActual) {
      hoverActual = clave;
      estado.fijarHover(hit);
    }
  }

  // ── Bucle ────────────────────────────────────────────────────────────────
  function pedirRender() {
    pedido = true;
    if (!raf && activo) raf = requestAnimationFrame(bucle);
  }

  function bucle(ahora) {
    raf = 0;
    if (!activo) return;
    const dt = Math.min(0.1, (ahora - ultimoT) / 1000);
    ultimoT = ahora;
    reloj += dt;
    procesarHover();
    let seguir = false;
    if (tween) {
      const k = Math.min(1, (ahora - tween.t0) / tween.dur);
      const e = easeInOutCubic(k);
      controles.target.lerpVectors(tween.desdeT, tween.aT, e);
      camara.position.lerpVectors(tween.desdeP, tween.aP, e);
      if (k >= 1) tween = null;
      seguir = true;
    }
    const cambio = controles.update(dt);
    const anim = animaciones();
    const a1 = nodos3d.animar(reloj, dt, anim);
    const a2 = aristas3d.animar(dt, anim);
    seguir = seguir || cambio || a1 || a2;
    if (seguir || pedido) render();
    pedido = false;
    medirFps(ahora);
    if (seguir) raf = requestAnimationFrame(bucle);
  }

  function render() {
    const siempre = new Set();
    const completos = new Set();
    if (estado.seleccion?.tipo === 'nodo') { siempre.add(estado.seleccion.id); completos.add(estado.seleccion.id); }
    if (estado.hover?.tipo === 'nodo') { siempre.add(estado.hover.id); completos.add(estado.hover.id); }
    etiquetas.nivelDetalle(camara, siempre, completos);
    renderer.render(escena, camara);
    rotulos.render(escena, camara);
    if (alMoverCamara) alMoverCamara();
  }

  function medirFps(ahora) {
    if (medicion.hecha) return;
    if (!medicion.inicio) { medicion.inicio = ahora; return; }
    medicion.frames++;
    const trans = ahora - medicion.inicio;
    if (trans >= 3000) {
      medicion.hecha = true;
      const fps = (medicion.frames * 1000) / trans;
      if (fps < 40 && ratio > 1.25) {
        ratio = 1.25;
        renderer.setPixelRatio(ratio);
        redimensionar();
      }
    }
  }

  function redimensionar() {
    const w = Math.max(1, contenedor.clientWidth);
    const h = Math.max(1, contenedor.clientHeight);
    renderer.setSize(w, h, false);
    rotulos.setSize(w, h);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
    pedirRender();
  }
  const observador = new ResizeObserver(redimensionar);
  observador.observe(contenedor);
  redimensionar();

  function alVisibilidad() {
    if (document.hidden) pausar(); else reanudar();
  }
  document.addEventListener('visibilitychange', alVisibilidad);

  function pausar() {
    activo = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function reanudar() {
    if (activo) return;
    activo = true;
    ultimoT = performance.now();
    redimensionar();
  }

  lienzo.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    pausar();
    alPerderContexto();
  });

  /** PNG del 3D: render y copia en el mismo tick (sin preserveDrawingBuffer) + rótulos y franja */
  function exportarCanvas(titulo) {
    render();
    const w = lienzo.width; const h = lienzo.height;
    const franja = Math.round(36 * ratio);
    const c = document.createElement('canvas');
    c.width = w; c.height = h + franja;
    const g = c.getContext('2d');
    g.drawImage(lienzo, 0, 0);
    const escala = ratio;
    g.font = `600 ${Math.round(13 * escala)}px Inter, "Segoe UI", sans-serif`;
    g.textBaseline = 'middle';
    for (const etq of etiquetas.paraExportar()) {
      const v = etq.posicion.clone().project(camara);
      if (v.z < -1 || v.z > 1) continue;
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      const ancho = g.measureText(etq.nombre).width + 30 * escala;
      g.globalAlpha = etq.atenuada ? 0.3 : 1;
      g.fillStyle = 'rgba(10,18,34,0.85)';
      g.fillRect(x - ancho / 2, y - 12 * escala, ancho, 24 * escala);
      g.fillStyle = etq.color;
      g.beginPath();
      g.arc(x - ancho / 2 + 11 * escala, y, 4 * escala, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f1f5ff';
      g.fillText(etq.nombre, x - ancho / 2 + 20 * escala, y);
    }
    g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    g.fillRect(0, h, w, franja);
    g.fillStyle = '#1d2939';
    g.font = `600 ${Math.round(13 * escala)}px Inter, "Segoe UI", sans-serif`;
    g.fillText(titulo, 14 * escala, h + franja / 2);
    return c;
  }

  function dispose() {
    pausar();
    observador.disconnect();
    document.removeEventListener('visibilitychange', alVisibilidad);
    controles.dispose();
    nodos3d.dispose();
    aristas3d.dispose();
    etiquetas.dispose();
    if (rejilla) { rejilla.geometry.dispose(); rejilla.material.dispose(); }
    suelo.geometry.dispose(); suelo.material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    rotulos.domElement.remove();
  }

  /** Coordenadas de pantalla del centro de un nodo (pruebas y accesibilidad) */
  function proyectar(id) {
    const c = centros.get(String(id));
    if (!c) return null;
    const v = new THREE.Vector3(c.x, tipos.get(String(id)) === 'fisicos' ? 1.1 : 1.0, c.z).project(camara);
    const r = lienzo.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  }

  return {
    reconstruir,
    proyectar,
    actualizarEstilos,
    encajar,
    enfocarNodo,
    reiniciarCamara,
    zoom,
    centrarEnPx,
    huellaCamara,
    exportarCanvas,
    pausar,
    reanudar,
    pedirRender,
    info: () => renderer.info,
    dispose,
  };
}

/**
 * Aristas 3D: tubos curvos, puntas de flecha instanciadas, partículas de flujo,
 * conos fijos de dirección (movimiento reducido), proxies de picking y etiqueta.
 *
 * Los proxies de picking (tubos de r=0,18) NO se añaden a la escena: el raycast se hace
 * directamente contra ellos, así no cuestan llamadas de dibujo.
 *
 * Partículas: un único THREE.Points con un búfer de posiciones y colores para todas las
 * aristas (una sola llamada de dibujo); se pausan mientras se gira la cámara.
 */
import * as THREE from '/vendor/three/three.module.js';
import { CSS2DObject } from '/vendor/three/addons/renderers/CSS2DRenderer.js';
import { TIPOS_DEPENDENCIA, CRITICIDADES, COLOR_CAIDA, SEPARACION, resumenArista } from './constantesVisuales.js';
import { indicesParalelas, desplazamientoLateral, normalCanonica, puntoControl3D, anclaHacia } from './geometriaAristas.js';
import { alturaAncla } from './modelos3d.js';

const LARGO_PUNTA = 0.34;
const RADIO_SALIDA = 1.0;
const RADIO_LLEGADA = 1.1;
const VELOCIDAD = 2.5;
const ESTADO_OPACIDAD = { normal: 1, resaltada: 1 / 0.6, tenue: 0.4, atenuada: 0 };
// Segmentos de los tubos: a lo largo y alrededor (los tubos son finos: 4 lados bastan)
const SEG_TUBO = 24;
const LADOS_TUBO = 4;

/** Textura redonda y difusa para las partículas */
function texturaParticula() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Curva que recorre la base solo hasta tFin (deja sitio a la punta) */
class CurvaRecortada extends THREE.Curve {
  constructor(base, tFin) { super(); this.base = base; this.tFin = tFin; }
  getPoint(t, destino = new THREE.Vector3()) { return this.base.getPoint(t * this.tFin, destino); }
}

export function crearAristas3D(escena) {
  const grupo = new THREE.Group();
  grupo.name = 'aristas';
  escena.add(grupo);

  const materiales = new Map();
  const geoPunta = new THREE.ConeGeometry(1, LARGO_PUNTA, 16);
  const texParticula = texturaParticula();
  const geoCono = new THREE.ConeGeometry(0.11, 0.3, 8);
  const matPunta = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const matParticula = new THREE.PointsMaterial({
    size: 0.26, map: texParticula, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, sizeAttenuation: true,
  });
  const matProxy = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });
  const matResalte = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false });

  let aristas = [];
  let porId = new Map();
  let puntas = null;
  let particulas = null;
  let conos = null;
  let listaParticulas = [];
  // Malla de resalte persistente (geometría vacía si no hay arista resaltada): su shader se
  // compila al cargar la escena y no en el primer hover
  const resalte = new THREE.Mesh(new THREE.BufferGeometry(), matResalte);
  resalte.matrixAutoUpdate = false;
  resalte.renderOrder = 2;
  resalte.frustumCulled = false;
  grupo.add(resalte);
  let tiempo = 0;
  let particulasActivas = false; // animaciones encendidas y calidad alta
  let particulasPausadas = false; // la cámara se está moviendo
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const ARRIBA = new THREE.Vector3(0, 1, 0);
  const tmpColor = new THREE.Color();

  // Etiqueta única reutilizada
  const elEtiqueta = document.createElement('div');
  elEtiqueta.className = 'topo-etq topo-etq--arista';
  const elEtqLinea1 = document.createElement('div');
  elEtqLinea1.className = 'topo-etq__fila';
  const elEtqLinea2 = document.createElement('div');
  elEtqLinea2.className = 'topo-etq__sub';
  elEtiqueta.append(elEtqLinea1, elEtqLinea2);
  const etiqueta = new CSS2DObject(elEtiqueta);
  etiqueta.visible = false;
  grupo.add(etiqueta);

  function material(tipo, crit, estado, impacto) {
    const clave = `${tipo}|${crit}|${estado}|${impacto ? 1 : 0}`;
    if (!materiales.has(clave)) {
      const base = CRITICIDADES[crit] || CRITICIDADES.MEDIUM;
      const color = impacto ? COLOR_CAIDA : (TIPOS_DEPENDENCIA[tipo]?.color || '#cbd5e1');
      let opacidad = impacto ? 1 : base.opacidad;
      if (estado === 'atenuada') opacidad = 0.08;
      else opacidad = Math.min(1, opacidad * ESTADO_OPACIDAD[estado]);
      materiales.set(clave, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacidad, toneMapped: false, depthWrite: estado !== 'atenuada' }));
    }
    return materiales.get(clave);
  }

  function limpiar() {
    for (const a of aristas) { grupo.remove(a.tubo); a.tubo.geometry.dispose(); a.proxy.geometry.dispose(); }
    for (const m of [puntas, conos]) if (m) { grupo.remove(m); m.dispose(); }
    if (particulas) { grupo.remove(particulas); particulas.geometry.dispose(); }
    quitarResalte();
    aristas = []; porId = new Map(); listaParticulas = [];
    puntas = null; particulas = null; conos = null;
  }

  function quitarResalte() {
    resalte.geometry.dispose();
    resalte.geometry = new THREE.BufferGeometry();
  }

  /**
   * @param {Array} lista aristas visibles
   * @param {(id) => THREE.Vector3|undefined} centroDe
   * @param {(id) => string} tipoDe tipo de servidor ('fisicos'|'virtuales')
   * @param {{elevacion?: number}} opciones elevacion: altura extra de los arcos
   */
  function construir(lista, centroDe, tipoDe, { elevacion = 0 } = {}) {
    limpiar();
    const paralelas = indicesParalelas(lista);
    for (const e of lista) {
      const cs = centroDe(e.source); const ct = centroDe(e.target);
      if (!cs || !ct) continue;
      const k = paralelas.get(String(e.id)) || 0;
      const off = desplazamientoLateral(e, k, { base: SEPARACION.bidireccional3d, paso: SEPARACION.paralela3d });
      const n = normalCanonica([cs.x, cs.z], [ct.x, ct.z], e.source, e.target);
      const p0 = anclaHacia([cs.x, 0, cs.z], [ct.x, 0, ct.z], RADIO_SALIDA, alturaAncla(tipoDe(e.source)));
      const p1 = anclaHacia([ct.x, 0, ct.z], [cs.x, 0, cs.z], RADIO_LLEGADA, alturaAncla(tipoDe(e.target)));
      // El desplazamiento lateral también separa los extremos de un par bidireccional
      if (off) {
        const f = Math.max(-0.6, Math.min(0.6, off * 0.55));
        p0[0] += n[0] * f; p0[2] += n[1] * f;
        p1[0] += n[0] * f; p1[2] += n[1] * f;
      }
      const c = puntoControl3D(p0, p1, n, off, k, SEPARACION.alturaParalela3d, elevacion);
      const base = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...p0), new THREE.Vector3(...c), new THREE.Vector3(...p1));
      const largo = base.getLength();
      const tFin = Math.max(0.5, 1 - LARGO_PUNTA / largo);
      const recortada = new CurvaRecortada(base, tFin);
      const crit = CRITICIDADES[e.criticality] || CRITICIDADES.MEDIUM;
      const r = crit.radio * (e.carriesImpact ? 1.15 : 1);
      const tubo = new THREE.Mesh(new THREE.TubeGeometry(recortada, SEG_TUBO, r, LADOS_TUBO, false), material(e.dependencyType, e.criticality, 'normal', e.carriesImpact));
      tubo.renderOrder = 1;
      tubo.matrixAutoUpdate = false; // geometría ya en coordenadas del mundo
      grupo.add(tubo);
      const proxy = new THREE.Mesh(new THREE.TubeGeometry(recortada, 12, 0.18, 4, false), matProxy);
      proxy.updateMatrixWorld();
      const reg = { id: String(e.id), arista: e, base, recortada, tFin, largo, tubo, proxy, r, estado: 'normal', idx: aristas.length };
      proxy.userData.aristaId = reg.id;
      aristas.push(reg);
      porId.set(reg.id, reg);
    }

    puntas = new THREE.InstancedMesh(geoPunta, matPunta, Math.max(1, aristas.length));
    puntas.count = aristas.length;
    puntas.frustumCulled = false;
    puntas.matrixAutoUpdate = false;
    puntas.renderOrder = 1;
    aristas.forEach((reg, i) => {
      const crit = CRITICIDADES[reg.arista.criticality] || CRITICIDADES.MEDIUM;
      const pos = reg.base.getPoint(reg.tFin, tmpV);
      const tang = reg.base.getTangent(reg.tFin, tmpV2).normalize();
      tmpQ.setFromUnitVectors(ARRIBA, tang);
      const rad = reg.r * 2.8;
      tmpM.compose(pos.clone().addScaledVector(tang, LARGO_PUNTA / 2), tmpQ, tmpS.set(rad, 1, rad));
      puntas.setMatrixAt(i, tmpM);
      puntas.setColorAt(i, tmpColor.set(0xffffff));
    });
    grupo.add(puntas);

    // Partículas de flujo
    listaParticulas = [];
    for (const reg of aristas) {
      const cuantas = (CRITICIDADES[reg.arista.criticality] || CRITICIDADES.MEDIUM).particulas;
      for (let j = 0; j < cuantas; j++) listaParticulas.push({ reg, fase: j / cuantas });
    }
    const geoP = new THREE.BufferGeometry();
    const posP = new THREE.BufferAttribute(new Float32Array(Math.max(1, listaParticulas.length) * 3), 3);
    posP.setUsage(THREE.DynamicDrawUsage);
    geoP.setAttribute('position', posP);
    geoP.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Math.max(1, listaParticulas.length) * 3).fill(1), 3));
    geoP.setDrawRange(0, listaParticulas.length);
    particulas = new THREE.Points(geoP, matParticula);
    particulas.frustumCulled = false;
    particulas.matrixAutoUpdate = false;
    particulas.renderOrder = 5;
    grupo.add(particulas);

    // Conos fijos de dirección (sustituyen a las partículas con movimiento reducido)
    conos = new THREE.InstancedMesh(geoCono, matPunta, Math.max(1, aristas.length * 3));
    conos.count = aristas.length * 3;
    conos.frustumCulled = false;
    conos.matrixAutoUpdate = false;
    aristas.forEach((reg, i) => {
      [0.3, 0.5, 0.7].forEach((t, j) => {
        const pos = reg.base.getPoint(t * reg.tFin, tmpV);
        const tang = reg.base.getTangent(t * reg.tFin, tmpV2).normalize();
        if (reg.arista.carriesImpact) tang.negate();
        tmpQ.setFromUnitVectors(ARRIBA, tang);
        tmpM.compose(pos, tmpQ, tmpS.set(1, 1, 1));
        conos.setMatrixAt(i * 3 + j, tmpM);
        conos.setColorAt(i * 3 + j, tmpColor.set(0xffffff));
      });
    });
    grupo.add(conos);
  }

  /**
   * @param {(e) => 'normal'|'resaltada'|'tenue'|'atenuada'} estiloDe
   * @param {boolean} animaciones
   */
  function actualizarEstilos(estiloDe, animaciones) {
    aristas.forEach((reg, i) => {
      const estado = estiloDe(reg.arista);
      reg.estado = estado;
      reg.tubo.material = material(reg.arista.dependencyType, reg.arista.criticality, estado, reg.arista.carriesImpact);
      const colorBase = tmpColor.set(reg.arista.carriesImpact ? COLOR_CAIDA : (TIPOS_DEPENDENCIA[reg.arista.dependencyType]?.color || '#cbd5e1'));
      const factor = estado === 'atenuada' ? 0.12 : estado === 'tenue' ? 0.45 : 1;
      const c = colorBase.clone().multiplyScalar(factor);
      puntas.setColorAt(i, c);
      for (let j = 0; j < 3; j++) conos.setColorAt(i * 3 + j, c);
    });
    const colores = particulas?.geometry.attributes.color;
    listaParticulas.forEach((p, i) => {
      const a = p.reg.arista;
      const factor = p.reg.estado === 'atenuada' ? 0 : p.reg.estado === 'tenue' ? 0.35 : 1;
      tmpColor.set(a.carriesImpact ? COLOR_CAIDA : (TIPOS_DEPENDENCIA[a.dependencyType]?.color || '#cbd5e1')).multiplyScalar(factor);
      colores.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
    });
    if (colores) colores.needsUpdate = true;
    if (puntas?.instanceColor) puntas.instanceColor.needsUpdate = true;
    if (conos?.instanceColor) conos.instanceColor.needsUpdate = true;
    particulasActivas = animaciones;
    if (particulas) particulas.visible = particulasActivas && !particulasPausadas;
    if (conos) conos.visible = !animaciones;
    if (animaciones) moverParticulas(0);
  }

  /** Oculta las partículas mientras se mueve la cámara (y las recupera al soltar) */
  function pausarParticulas(pausa) {
    particulasPausadas = pausa;
    if (particulas) particulas.visible = particulasActivas && !particulasPausadas;
  }

  function moverParticulas(dt) {
    if (!particulas) return;
    tiempo += dt;
    const pos = particulas.geometry.attributes.position;
    listaParticulas.forEach((p, i) => {
      const reg = p.reg;
      const rapidez = reg.arista.carriesImpact ? 1.6 : 1;
      let t = (p.fase + (tiempo * VELOCIDAD * rapidez) / reg.largo) % 1;
      if (reg.arista.carriesImpact) t = 1 - t; // propagación target → source
      reg.base.getPoint(t * reg.tFin, tmpV);
      pos.setXYZ(i, tmpV.x, tmpV.y, tmpV.z);
    });
    pos.needsUpdate = true;
  }

  function animar(dt, animaciones) {
    if (!animaciones || particulasPausadas || !listaParticulas.length) return false;
    moverParticulas(dt);
    return true;
  }

  /** Muestra la etiqueta y el tubo de resalte (r ×1,3) de una arista; null para ocultar */
  function resaltar(id) {
    quitarResalte();
    const reg = id ? porId.get(String(id)) : null;
    etiqueta.visible = Boolean(reg);
    if (!reg) return;
    const a = reg.arista;
    elEtqLinea1.textContent = resumenArista(a);
    elEtqLinea2.textContent = a.label || '';
    elEtqLinea2.hidden = !a.label;
    etiqueta.position.copy(reg.base.getPoint(0.5, tmpV));
    etiqueta.position.y += 0.35;
    resalte.geometry.dispose();
    resalte.geometry = new THREE.TubeGeometry(reg.recortada, SEG_TUBO, reg.r * 1.3, LADOS_TUBO, false);
    matResalte.color.set(a.carriesImpact ? COLOR_CAIDA : (TIPOS_DEPENDENCIA[a.dependencyType]?.color || '#ffffff'));
  }

  return {
    construir,
    actualizarEstilos,
    animar,
    pausarParticulas,
    resaltar,
    objetosPicking: () => aristas.map((a) => a.proxy),
    idDesdeInterseccion: (hit) => hit.object.userData.aristaId || null,
    puntoMedio: (id) => porId.get(String(id))?.base.getPoint(0.5),
    lista: () => aristas,
    dispose() {
      limpiar();
      grupo.remove(etiqueta);
      escena.remove(grupo);
      for (const m of materiales.values()) m.dispose();
      materiales.clear();
      [geoPunta, geoCono].forEach((g) => g.dispose());
      texParticula.dispose();
      [matPunta, matParticula, matProxy, matResalte].forEach((m) => m.dispose());
    },
  };
}

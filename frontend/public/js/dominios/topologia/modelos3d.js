/**
 * Modelos 3D de los servidores. Geometrías y materiales compartidos; las piezas
 * repetidas son InstancedMesh con color por instancia. Cada nodo guarda la lista de
 * sus piezas (malla, índice de instancia y matriz local) para poder escalarlo en hover.
 *
 * Dos formas de dibujar un servidor físico:
 *  - montado en un rack (sala de racks): un chasis del alto de sus U, con frontal y LEDs de
 *    estado, dentro del gabinete (el gabinete lo dibuja salaRacks3d.js);
 *  - suelto (posiciones del editor): gabinete propio sobre un pedestal.
 * Las VMs son cubos translúcidos con un núcleo que gira.
 *
 * Picking: una caja invisible por nodo (una sola InstancedMesh fuera de la escena), en
 * lugar de raycast contra todas las piezas. Halos: materiales compartidos por color.
 */
import * as THREE from '/vendor/three/three.module.js';
import { ESCENARIO, ESTADOS, COLOR_CAIDA, colorDeNodo } from './constantesVisuales.js';

const ALTURA_ANCLA = { fisicos: 1.8, virtuales: 1.0 };
// Gabinete de rack: armario alto con UNIDADES servidores de 2U en el frente
const UNIDADES = 6;
const ALTO_GABINETE = 3.2;
const BASE_GABINETE = 0.12;
// Fracción de la caja de picking (3,4 u) que ocupa una VM
const ALTO_PICKING_VM = 0.62;
// Medidas de la caja de picking (geo.caja)
const CAJA = { ancho: 3.0, alto: 3.4 };
export const alturaAncla = (tipo) => ALTURA_ANCLA[tipo] ?? 1.0;
const ALTURA_HALO = 1.1;
// Frontal del servidor montado según su estado (sin luz: el color se lee igual desde lejos)
const FRONTAL = { normal: '#3a5480', DOWN: '#c0281c', DEGRADED: '#8a5a00', MAINTENANCE: '#5b3aa8', UNKNOWN: '#2a3242' };

/** Textura radial (blanco → transparente) para halos y sombras */
function texturaRadial(colorCentro, alfaCentro) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(${colorCentro},${alfaCentro})`);
  grad.addColorStop(1, `rgba(${colorCentro},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Textura de anillo discontinuo (24 segmentos) para los nodos simulados */
function texturaDiscontinua() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff';
  g.lineWidth = 22;
  const segmentos = 24;
  for (let i = 0; i < segmentos; i++) {
    const a0 = (i / segmentos) * Math.PI * 2;
    g.beginPath();
    g.arc(128, 128, 120, a0, a0 + (Math.PI * 2) / segmentos * 0.55);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function crearRecursos() {
  const geo = {
    pedestalFis: new THREE.BoxGeometry(1.9, 0.12, 1.9).translate(0, 0.06, 0),
    pedestalVm: new THREE.CylinderGeometry(1.35, 1.45, 0.12, 6).translate(0, 0.06, 0),
    anillo: new THREE.RingGeometry(1.42, 1.6, 32).rotateX(-Math.PI / 2),
    seleccion: new THREE.RingGeometry(1.75, 1.85, 40).rotateX(-Math.PI / 2),
    chasis: new THREE.BoxGeometry(1.5, ALTO_GABINETE, 1.5),
    bahia: new THREE.BoxGeometry(1.3, 0.34, 0.04),
    led: new THREE.BoxGeometry(0.07, 0.07, 0.02),
    rejilla: new THREE.BoxGeometry(1.3, 0.03, 1.3),
    vmCubo: new THREE.BoxGeometry(1.3, 1.3, 1.3),
    vmNucleo: new THREE.OctahedronGeometry(0.28),
    sombra: new THREE.CircleGeometry(1.9, 24).rotateX(-Math.PI / 2),
    // Caja unidad: se escala por instancia (servidores montados en rack)
    unidad: new THREE.BoxGeometry(1, 1, 1),
    // Volumen de picking de un nodo (cubre pedestal, chasis o cubo)
    caja: new THREE.BoxGeometry(CAJA.ancho, CAJA.alto, CAJA.ancho).translate(0, CAJA.alto / 2, 0),
  };
  geo.vmAristas = new THREE.EdgesGeometry(geo.vmCubo);
  geo.marco = new THREE.EdgesGeometry(geo.unidad);
  const tex = { halo: texturaRadial('255,255,255', 1), sombra: texturaRadial('0,0,0', 0.45), discontinua: texturaDiscontinua() };
  const mat = {
    pedestal: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    anillo: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide }),
    seleccion: new THREE.MeshBasicMaterial({ color: ESCENARIO.seleccion, transparent: true, opacity: 0.9, toneMapped: false, side: THREE.DoubleSide }),
    chasis: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    bahia: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    led: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    rejilla: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    srvChasis: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    srvFrente: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    marco: new THREE.LineBasicMaterial({ color: ESCENARIO.seleccion, toneMapped: false, transparent: true, opacity: 0.95 }),
    vmCubo: new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false,
      emissive: new THREE.Color(ESCENARIO.vm), emissiveIntensity: 0.25, metalness: 0.1, roughness: 0.4,
    }),
    vmAristas: new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, toneMapped: false }),
    vmNucleo: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    sombra: new THREE.MeshBasicMaterial({ map: tex.sombra, transparent: true, depthWrite: false, color: 0xffffff }),
    invisible: new THREE.MeshBasicMaterial({ visible: false }),
    discontinuo: new THREE.MeshBasicMaterial({
      map: tex.discontinua, color: COLOR_CAIDA, transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false,
    }),
  };
  return { geo, mat, tex };
}

const C = (hex) => new THREE.Color(hex);
const GRIS_FONDO = C(ESCENARIO.fondo);

/** Atenúa un color: ×0,25 y desaturado hacia el fondo */
function atenuar(color) {
  const hsl = {};
  color.getHSL(hsl);
  return color.clone().setHSL(hsl.h, hsl.s * 0.35, hsl.l).multiplyScalar(0.25).lerp(GRIS_FONDO, 0.25);
}

export function crearModelosNodos(escena) {
  const { geo, mat, tex } = crearRecursos();
  const grupo = new THREE.Group();
  grupo.name = 'nodos';
  escena.add(grupo);

  const anilloSel = new THREE.Mesh(geo.seleccion, mat.seleccion);
  anilloSel.position.y = 0.13;
  anilloSel.visible = false;
  anilloSel.renderOrder = 3;
  grupo.add(anilloSel);
  // Selección de un servidor montado: contorno de su chasis
  const marcoSel = new THREE.LineSegments(geo.marco, mat.marco);
  marcoSel.visible = false;
  marcoSel.renderOrder = 5;
  grupo.add(marcoSel);

  let mallas = {};
  let info = []; // por nodo
  let infoPorId = new Map();
  let cajas = null; // InstancedMesh de picking (instancia i = info[i]); no se dibuja
  let lineasVm = null;
  const materialesHalo = new Map(); // `${color}|${late}` -> SpriteMaterial compartido
  let ultimoLed = -1;
  let halos = [];
  let discontinuos = [];
  let seleccionId = null;
  let parpadeo = 0;
  const tmpM = new THREE.Matrix4();
  const tmpM2 = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();
  const tmpColor = new THREE.Color();

  function limpiar() {
    for (const m of Object.values(mallas)) { grupo.remove(m); m.dispose(); }
    if (lineasVm) { grupo.remove(lineasVm); lineasVm.geometry.dispose(); lineasVm = null; }
    for (const h of halos) grupo.remove(h.sprite);
    for (const d of discontinuos) grupo.remove(d.mesh);
    if (cajas) { cajas.dispose(); cajas = null; }
    mallas = {}; info = []; infoPorId = new Map(); halos = []; discontinuos = [];
  }

  function materialHalo(color, late) {
    const clave = `${color}|${late ? 1 : 0}`;
    let m = materialesHalo.get(clave);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: tex.halo, color: C(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      materialesHalo.set(clave, m);
    }
    m.opacity = late ? 0.7 : 0.4;
    return m;
  }

  function nuevaInstanciada(nombre, geometria, material, cuenta, { orden = 0 } = {}) {
    const m = new THREE.InstancedMesh(geometria, material, Math.max(1, cuenta));
    m.count = cuenta;
    m.name = nombre;
    m.renderOrder = orden;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.matrixAutoUpdate = false; // la malla está en el origen; solo cambian sus instancias
    if (cuenta > 0) m.setColorAt(0, tmpColor.set(0xffffff));
    grupo.add(m);
    mallas[nombre] = m;
    return m;
  }

  /**
   * Construye todas las instancias.
   * @param {Array} nodos nodos visibles del grafo
   * @param {Map<string, THREE.Vector3>} centros centro en el suelo de cada nodo
   * @param {Map<string, {x,y,z,ancho,alto,fondo}>} [slots] hueco de rack de los servidores montados
   */
  function construir(nodos, centros, slots = new Map()) {
    limpiar();
    const montado = (n) => n.type === 'fisicos' && slots.has(String(n.id));
    const rack = nodos.filter(montado);
    const fis = nodos.filter((n) => n.type === 'fisicos' && !montado(n));
    const vms = nodos.filter((n) => n.type !== 'fisicos');
    const nf = fis.length; const nv = vms.length; const nr = rack.length; const ns = nf + nv;
    nuevaInstanciada('sombra', geo.sombra, mat.sombra, ns, { orden: 0 });
    nuevaInstanciada('pedestalFis', geo.pedestalFis, mat.pedestal, nf);
    nuevaInstanciada('pedestalVm', geo.pedestalVm, mat.pedestal, nv);
    nuevaInstanciada('anillo', geo.anillo, mat.anillo, ns, { orden: 1 });
    nuevaInstanciada('chasis', geo.chasis, mat.chasis, nf);
    nuevaInstanciada('bahia', geo.bahia, mat.bahia, nf * UNIDADES);
    nuevaInstanciada('ledEstado', geo.led, mat.led, nf * UNIDADES);
    nuevaInstanciada('ledActividad', geo.led, mat.led, nf * UNIDADES);
    nuevaInstanciada('rejilla', geo.rejilla, mat.rejilla, nf);
    nuevaInstanciada('srvChasis', geo.unidad, mat.srvChasis, nr);
    nuevaInstanciada('srvFrente', geo.unidad, mat.srvFrente, nr, { orden: 1 });
    nuevaInstanciada('srvLed', geo.unidad, mat.led, nr, { orden: 2 });
    nuevaInstanciada('srvLedAct', geo.unidad, mat.led, nr, { orden: 2 });
    nuevaInstanciada('vmNucleo', geo.vmNucleo, mat.vmNucleo, nv);
    nuevaInstanciada('vmCubo', geo.vmCubo, mat.vmCubo, nv, { orden: 2 });
    const n = nodos.length;
    cajas = new THREE.InstancedMesh(geo.caja, mat.invisible, Math.max(1, n));
    cajas.count = n;

    const local = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
    const pieza = (x, y, z, sx, sy, sz) => new THREE.Matrix4().makeScale(sx, sy, sz).setPosition(x, y, z);
    let iF = 0; let iV = 0; let iN = 0; let iR = 0;
    const posLineas = [];
    const coloresLineas = [];
    const vertsAristas = geo.vmAristas.attributes.position;

    for (const nodo of [...rack, ...fis, ...vms]) {
      const id = String(nodo.id);
      const slot = montado(nodo) ? slots.get(id) : null;
      const centro = slot ? new THREE.Vector3(slot.x, slot.y, slot.z) : (centros.get(id) || new THREE.Vector3());
      const reg = { id, nodo, tipo: nodo.type, centro: centro.clone(), escala: 1, partes: [], fase: Math.random() * 10, slot };
      const idx = info.length;
      if (slot) {
        // Chasis del alto de sus U; frontal, LED de estado y LED de actividad en la cara frontal
        reg.iR = iR;
        const { ancho, alto, fondo } = slot;
        const frente = fondo / 2;
        const altoLed = Math.min(0.1, alto * 0.42);
        reg.partes.push({ mesh: mallas.srvChasis, i: iR, local: pieza(0, 0, 0, ancho, alto - 0.024, fondo) });
        reg.partes.push({ mesh: mallas.srvFrente, i: iR, local: pieza(0, 0, frente + 0.01, ancho - 0.05, alto - 0.04, 0.02) });
        reg.partes.push({ mesh: mallas.srvLed, i: iR, local: pieza(ancho / 2 - 0.18, 0, frente + 0.028, 0.13, altoLed, 0.02) });
        reg.partes.push({ mesh: mallas.srvLedAct, i: iR, local: pieza(ancho / 2 - 0.36, 0, frente + 0.028, 0.09, altoLed, 0.02) });
        iR++;
        cajas.setMatrixAt(idx, tmpM.makeScale(ancho / CAJA.ancho, alto / CAJA.alto, (fondo + 0.1) / CAJA.ancho).setPosition(slot.x, slot.y - alto / 2, slot.z));
      } else {
        reg.partes.push({ mesh: mallas.sombra, i: iN, local: local(0, 0.002, 0) });
        reg.partes.push({ mesh: mallas.anillo, i: iN, local: local(0, 0.125, 0), anillo: true });
        reg.iN = iN;
        iN++;
        // Volumen de picking a la altura de cada modelo: el de una VM no tapa al gabinete de detrás
        cajas.setMatrixAt(idx, tmpM.makeScale(1, nodo.type === 'fisicos' ? 1 : ALTO_PICKING_VM, 1).setPosition(centro.x, 0, centro.z));
      }
      if (slot) {
        // Montado en rack: sus piezas ya están
      } else if (nodo.type === 'fisicos') {
        reg.iF = iF;
        reg.partes.push({ mesh: mallas.pedestalFis, i: iF, local: local(0, 0, 0) });
        reg.partes.push({ mesh: mallas.chasis, i: iF, local: local(0, BASE_GABINETE + ALTO_GABINETE / 2, 0) });
        reg.partes.push({ mesh: mallas.rejilla, i: iF, local: local(0, BASE_GABINETE + ALTO_GABINETE + 0.015, 0) });
        for (let b = 0; b < UNIDADES; b++) {
          const y = BASE_GABINETE + 0.42 + b * 0.47; // unidades de abajo arriba en el frente
          const u = iF * UNIDADES + b;
          reg.partes.push({ mesh: mallas.bahia, i: u, local: local(0, y, 0.76) });
          reg.partes.push({ mesh: mallas.ledEstado, i: u, local: local(0.52, y, 0.785) });
          reg.partes.push({ mesh: mallas.ledActividad, i: u, local: local(0.4, y, 0.785) });
        }
        iF++;
      } else {
        reg.iV = iV;
        reg.partes.push({ mesh: mallas.pedestalVm, i: iV, local: local(0, 0, 0) });
        reg.partes.push({ mesh: mallas.vmCubo, i: iV, local: local(0, 1.0, 0) });
        reg.partes.push({ mesh: mallas.vmNucleo, i: iV, local: local(0, 1.0, 0), nucleo: true });
        reg.parteNucleo = reg.partes[reg.partes.length - 1];
        reg.lineaInicio = posLineas.length / 3;
        for (let k = 0; k < vertsAristas.count; k++) {
          posLineas.push(vertsAristas.getX(k) + centro.x, vertsAristas.getY(k) + 1.0, vertsAristas.getZ(k) + centro.z);
          coloresLineas.push(1, 1, 1);
        }
        reg.lineaFin = posLineas.length / 3;
        iV++;
      }
      info.push(reg);
      infoPorId.set(reg.id, reg);
      aplicarMatrices(reg);
    }

    if (posLineas.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(posLineas, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(coloresLineas, 3));
      lineasVm = new THREE.LineSegments(g, mat.vmAristas);
      lineasVm.renderOrder = 2;
      grupo.add(lineasVm);
    }
    for (const m of Object.values(mallas)) m.instanceMatrix.needsUpdate = true;
    cajas.computeBoundingSphere();
  }

  /** Solo la matriz del núcleo giratorio de una VM (sin tocar el resto de piezas) */
  function girarNucleo(reg, rot) {
    const p = reg.parteNucleo;
    if (!p || p.oculta) return;
    tmpS.set(reg.escala, reg.escala, reg.escala);
    tmpM.compose(reg.centro, tmpQ.identity(), tmpS);
    tmpM2.makeRotationY(rot).setPosition(0, 1.0, 0).premultiply(tmpM);
    p.mesh.setMatrixAt(p.i, tmpM2);
  }

  function aplicarMatrices(reg, rotNucleo = 0) {
    tmpS.set(reg.escala, reg.escala, reg.escala);
    tmpM.compose(reg.centro, tmpQ.identity(), tmpS);
    for (const p of reg.partes) {
      if (p.oculta) {
        tmpM2.makeScale(0, 0, 0);
      } else if (p.nucleo) {
        tmpM2.makeRotationY(rotNucleo).setPosition(0, 1.0, 0);
        tmpM2.premultiply(tmpM);
      } else {
        tmpM2.multiplyMatrices(tmpM, p.local);
      }
      p.mesh.setMatrixAt(p.i, tmpM2);
      p.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Posición del halo y del anillo de simulación de un nodo */
  function puntoFrontal(reg) {
    if (reg.slot) return new THREE.Vector3(reg.centro.x, reg.centro.y, reg.centro.z + reg.slot.fondo / 2 + 0.2);
    return new THREE.Vector3(reg.centro.x, ALTURA_HALO, reg.centro.z);
  }

  /**
   * Aplica colores de estado, atenuación, halos y anillos discontinuos.
   * @param {(n) => {atenuado: boolean}} estilo
   */
  function actualizarEstilos(estilo) {
    for (const h of halos) grupo.remove(h.sprite);
    for (const d of discontinuos) grupo.remove(d.mesh);
    halos = []; discontinuos = [];
    const lineasColor = lineasVm?.geometry.attributes.color;
    for (const reg of info) {
      const n = reg.nodo;
      const { atenuado } = estilo(n);
      const f = (hex) => (atenuado ? atenuar(C(hex)) : C(hex));
      const colorEstado = colorDeNodo(n);
      const colorLedEstado = (ESTADOS[n.status] || ESTADOS.UNKNOWN).color;
      const simulado = n.downSource === 'SIMULATED';
      if (reg.slot) {
        let chasis = C(ESCENARIO.chasis);
        if (n.isDown) chasis = chasis.lerp(C(colorEstado), 0.3);
        else if (n.cascadeStatus === 'DIRECT_IMPACT') chasis = chasis.lerp(C(colorEstado), 0.22);
        else if (n.cascadeStatus === 'TRANSITIVE_IMPACT') chasis = chasis.lerp(C(colorEstado), 0.12);
        mallas.srvChasis.setColorAt(reg.iR, atenuado ? atenuar(chasis) : chasis);
        let frontal = FRONTAL[n.isDown ? 'DOWN' : n.status] || FRONTAL.normal;
        if (n.status === 'UP' && !n.isDown) frontal = FRONTAL.normal;
        if (n.isDown && simulado) frontal = colorEstado;
        mallas.srvFrente.setColorAt(reg.iR, f(frontal));
        mallas.srvLed.setColorAt(reg.iR, f(n.isDown ? colorEstado : colorLedEstado));
        mallas.srvLedAct.setColorAt(reg.iR, f('#0b3d26'));
      } else {
        mallas.sombra.setColorAt(reg.iN, C(0xffffff));
        mallas.anillo.setColorAt(reg.iN, f(colorEstado));
        const parteAnillo = reg.partes.find((p) => p.anillo);
        parteAnillo.oculta = simulado;
      }
      if (reg.slot) {
        // Montado en rack: colores ya aplicados
      } else if (reg.tipo === 'fisicos') {
        mallas.pedestalFis.setColorAt(reg.iF, f(ESCENARIO.pedestal));
        let base = C(ESCENARIO.chasis);
        if (n.isDown) base = base.lerp(C(colorEstado), 0.35);
        else if (n.cascadeStatus === 'DIRECT_IMPACT') base = base.lerp(C(colorEstado), 0.25);
        else if (n.cascadeStatus === 'TRANSITIVE_IMPACT') base = base.lerp(C(colorEstado), 0.15);
        mallas.chasis.setColorAt(reg.iF, atenuado ? atenuar(base) : base);
        mallas.rejilla.setColorAt(reg.iF, f(ESCENARIO.rejillaSuperior));
        for (let b = 0; b < UNIDADES; b++) {
          mallas.bahia.setColorAt(reg.iF * UNIDADES + b, f(ESCENARIO.bahia));
          mallas.ledEstado.setColorAt(reg.iF * UNIDADES + b, f(n.isDown ? colorEstado : colorLedEstado));
          mallas.ledActividad.setColorAt(reg.iF * UNIDADES + b, f('#0b3d26'));
        }
      } else {
        mallas.pedestalVm.setColorAt(reg.iV, f(ESCENARIO.pedestal));
        let cubo = C(ESCENARIO.vm);
        if (n.isDown || n.cascadeStatus !== 'NONE') cubo = cubo.lerp(C(colorEstado), n.isDown ? 0.6 : 0.4);
        mallas.vmCubo.setColorAt(reg.iV, atenuado ? atenuar(cubo) : cubo);
        mallas.vmNucleo.setColorAt(reg.iV, f(colorEstado));
        if (lineasColor) {
          const cl = atenuado ? atenuar(C(ESCENARIO.vmAristas)) : C(ESCENARIO.vmAristas);
          for (let k = reg.lineaInicio; k < reg.lineaFin; k++) lineasColor.setXYZ(k, cl.r, cl.g, cl.b);
        }
      }
      reg.atenuado = atenuado;
      reg.activo = !atenuado && n.status === 'UP' && !n.isDown;
      aplicarMatrices(reg);

      // Halo: caídos (latiendo) e impacto directo (fijo)
      const conHalo = n.isDown || n.cascadeStatus === 'DIRECT_IMPACT';
      const punto = puntoFrontal(reg);
      if (conHalo && !atenuado) {
        const sprite = new THREE.Sprite(materialHalo(colorEstado, n.isDown));
        sprite.position.copy(punto);
        const escala = reg.slot ? reg.slot.ancho * 1.05 : 3.4;
        sprite.scale.setScalar(escala);
        sprite.renderOrder = 4;
        sprite.updateMatrix();
        grupo.add(sprite);
        halos.push({ sprite, late: n.isDown, fase: reg.fase, escala });
      }
      if (simulado) {
        const mesh = new THREE.Mesh(geo.anillo, mat.discontinuo);
        if (reg.slot) {
          // Anillo vertical delante del servidor montado
          mesh.position.copy(punto);
          mesh.rotation.x = Math.PI / 2;
          mesh.scale.setScalar(Math.max(0.3, reg.slot.alto * 1.6));
        } else {
          mesh.position.set(reg.centro.x, 0.13, reg.centro.z);
        }
        mesh.renderOrder = 3;
        grupo.add(mesh);
        discontinuos.push({ mesh, vertical: Boolean(reg.slot) });
      }
    }
    for (const m of Object.values(mallas)) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (lineasColor) lineasColor.needsUpdate = true;
    if (lineasVm) lineasVm.material.opacity = 0.9;
    actualizarSeleccion();
  }

  function fijarEscala(id, escala) {
    const reg = infoPorId.get(String(id));
    if (!reg || reg.escala === escala) return;
    reg.escala = escala;
    aplicarMatrices(reg);
  }

  function fijarSeleccion(id) {
    seleccionId = id ? String(id) : null;
    actualizarSeleccion();
  }
  function actualizarSeleccion() {
    const reg = seleccionId ? infoPorId.get(seleccionId) : null;
    anilloSel.visible = Boolean(reg && !reg.slot);
    marcoSel.visible = Boolean(reg?.slot);
    if (reg?.slot) {
      marcoSel.position.copy(reg.centro);
      marcoSel.scale.set(reg.slot.ancho + 0.12, reg.slot.alto + 0.05, reg.slot.fondo + 0.12);
    } else if (reg) anilloSel.position.set(reg.centro.x, 0.13, reg.centro.z);
  }
  /** El anillo de selección parpadea 2 veces (búsqueda) */
  function parpadear() { parpadeo = 0.9; }

  /**
   * Animación por frame. Devuelve true si hay algo animándose.
   */
  function animar(t, dt, animaciones) {
    let activo = false;
    if (parpadeo > 0) {
      parpadeo -= dt;
      const reg = seleccionId ? infoPorId.get(seleccionId) : null;
      const visible = Boolean(reg) && (parpadeo <= 0 || Math.floor(parpadeo / 0.225) % 2 === 0);
      if (reg?.slot) marcoSel.visible = visible; else anilloSel.visible = visible;
      activo = true;
    }
    if (!animaciones) {
      for (const h of halos) if (h.late) { h.sprite.material.opacity = 0.7; h.sprite.scale.setScalar(h.escala); }
      return activo;
    }
    anilloSel.rotation.y += 0.3 * dt;
    // Gira sobre su eje (también el anillo vertical de un servidor montado)
    for (const d of discontinuos) d.mesh.rotation.y -= 0.5 * dt;
    const ciclo = (t % 1.2) / 1.2;
    const pulso = 0.5 - 0.5 * Math.cos(ciclo * Math.PI * 2);
    // Los halos que laten comparten material por color
    for (const h of halos) {
      if (!h.late) continue;
      h.sprite.material.opacity = 0.45 + 0.4 * pulso;
      h.sprite.scale.setScalar(h.escala * (0.94 + 0.18 * pulso));
    }
    // Núcleos de VM girando (solo su matriz)
    const nucleo = mallas.vmNucleo;
    if (nucleo?.count) {
      for (const reg of info) if (reg.tipo !== 'fisicos') girarNucleo(reg, t * 0.4 + reg.fase);
      nucleo.instanceMatrix.needsUpdate = true;
    }
    // LEDs de actividad: 8 cambios por segundo bastan (no se suben colores en cada frame)
    const tick = Math.floor(t * 8);
    if (tick !== ultimoLed) {
      ultimoLed = tick;
      const led = mallas.ledActividad;
      const ledR = mallas.srvLedAct;
      for (const reg of info) {
        if (reg.tipo !== 'fisicos') continue;
        if (reg.slot) {
          const on = reg.activo && Math.sin(t * 7 + reg.fase * 3) > 0.35;
          ledR.setColorAt(reg.iR, tmpColor.set(on ? '#12b76a' : '#0b3d26'));
          continue;
        }
        for (let b = 0; b < UNIDADES; b++) {
          const on = reg.activo && Math.sin(t * 7 + reg.fase * 3 + b * 1.7) > 0.35;
          led.setColorAt(reg.iF * UNIDADES + b, tmpColor.set(on ? '#12b76a' : '#0b3d26'));
        }
      }
      if (led?.instanceColor) led.instanceColor.needsUpdate = true;
      if (ledR?.instanceColor) ledR.instanceColor.needsUpdate = true;
    }
    return true;
  }

  function idDesdeInterseccion(hit) {
    if (hit.object !== cajas || hit.instanceId === undefined) return null;
    return info[hit.instanceId]?.id ?? null;
  }

  /** Punto de salida de los arcos de un servidor montado (frente de su unidad) o null */
  function anclaDe(id) {
    const reg = infoPorId.get(String(id));
    if (!reg?.slot) return null;
    return [reg.centro.x, reg.centro.y, reg.centro.z + reg.slot.fondo / 2 + 0.05];
  }

  /** Datos nuevos del grafo (estado de monitoreo e impacto) sin tocar la geometría */
  function refrescarDatos(nodoDe) {
    for (const reg of info) { const n = nodoDe(reg.id); if (n) reg.nodo = n; }
  }

  return {
    construir,
    refrescarDatos,
    actualizarEstilos,
    fijarEscala,
    fijarSeleccion,
    parpadear,
    animar,
    idDesdeInterseccion,
    anclaDe,
    objetosPicking: () => (cajas && cajas.count ? [cajas] : []),
    parpadeando: () => parpadeo > 0,
    centro: (id) => infoPorId.get(String(id))?.centro,
    hayHalosLatiendo: () => halos.some((h) => h.late) || discontinuos.length > 0,
    dispose() {
      limpiar();
      escena.remove(grupo);
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mat).forEach((m) => m.dispose());
      Object.values(tex).forEach((t) => t.dispose());
      for (const m of materialesHalo.values()) m.dispose();
      materialesHalo.clear();
    },
  };
}

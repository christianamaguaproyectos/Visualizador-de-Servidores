/**
 * Modelos 3D de los servidores (§4). Geometrías y materiales compartidos; las piezas
 * repetidas son InstancedMesh con color por instancia. Cada nodo guarda la lista de
 * sus piezas (malla, índice de instancia y matriz local) para poder escalarlo en hover.
 */
import * as THREE from '/vendor/three/three.module.js';
import { ESCENARIO, ESTADOS, COLOR_CAIDA, colorDeNodo } from './constantesVisuales.js';

const ALTURA_ANCLA = { fisicos: 1.4, virtuales: 1.0 };
export const alturaAncla = (tipo) => ALTURA_ANCLA[tipo] ?? 1.0;
const ALTURA_HALO = 1.1;

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
    pedestalFis: new THREE.CylinderGeometry(1.5, 1.6, 0.12, 48).translate(0, 0.06, 0),
    pedestalVm: new THREE.CylinderGeometry(1.35, 1.45, 0.12, 6).translate(0, 0.06, 0),
    anillo: new THREE.RingGeometry(1.42, 1.6, 64).rotateX(-Math.PI / 2),
    seleccion: new THREE.RingGeometry(1.75, 1.85, 64).rotateX(-Math.PI / 2),
    chasis: new THREE.BoxGeometry(1.6, 2.0, 1.2),
    bahia: new THREE.BoxGeometry(1.44, 0.36, 0.04),
    led: new THREE.BoxGeometry(0.07, 0.07, 0.02),
    rejilla: new THREE.BoxGeometry(1.2, 0.02, 0.8),
    vmCubo: new THREE.BoxGeometry(1.3, 1.3, 1.3),
    vmNucleo: new THREE.OctahedronGeometry(0.28),
    sombra: new THREE.CircleGeometry(1.9, 32).rotateX(-Math.PI / 2),
  };
  geo.vmAristas = new THREE.EdgesGeometry(geo.vmCubo);
  const tex = { halo: texturaRadial('255,255,255', 1), sombra: texturaRadial('0,0,0', 0.45), discontinua: texturaDiscontinua() };
  const mat = {
    pedestal: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.7 }),
    anillo: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide }),
    seleccion: new THREE.MeshBasicMaterial({ color: ESCENARIO.seleccion, transparent: true, opacity: 0.9, toneMapped: false, side: THREE.DoubleSide }),
    chasis: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.45 }),
    bahia: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.6 }),
    led: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    rejilla: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.6 }),
    vmCubo: new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false,
      emissive: new THREE.Color(ESCENARIO.vm), emissiveIntensity: 0.25, metalness: 0.1, roughness: 0.4,
    }),
    vmAristas: new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, toneMapped: false }),
    vmNucleo: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    sombra: new THREE.MeshBasicMaterial({ map: tex.sombra, transparent: true, depthWrite: false, color: 0xffffff }),
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

  let mallas = {};
  let info = []; // por nodo
  let infoPorId = new Map();
  let mapaPicking = new Map(); // malla -> [infoIndex por instancia]
  let lineasVm = null;
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
    for (const h of halos) { grupo.remove(h.sprite); h.sprite.material.dispose(); }
    for (const d of discontinuos) grupo.remove(d.mesh);
    mallas = {}; info = []; infoPorId = new Map(); mapaPicking = new Map(); halos = []; discontinuos = [];
  }

  function nuevaInstanciada(nombre, geometria, material, cuenta, { picking = false, orden = 0 } = {}) {
    const m = new THREE.InstancedMesh(geometria, material, Math.max(1, cuenta));
    m.count = cuenta;
    m.name = nombre;
    m.renderOrder = orden;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    if (cuenta > 0) m.setColorAt(0, tmpColor.set(0xffffff));
    grupo.add(m);
    mallas[nombre] = m;
    if (picking) mapaPicking.set(m, []);
    return m;
  }

  /**
   * Construye todas las instancias.
   * @param {Array} nodos nodos visibles del grafo
   * @param {Map<string, THREE.Vector3>} centros centro en el suelo de cada nodo
   */
  function construir(nodos, centros) {
    limpiar();
    const fis = nodos.filter((n) => n.type === 'fisicos');
    const vms = nodos.filter((n) => n.type !== 'fisicos');
    const nf = fis.length; const nv = vms.length; const n = nodos.length;
    nuevaInstanciada('sombra', geo.sombra, mat.sombra, n, { orden: 0 });
    nuevaInstanciada('pedestalFis', geo.pedestalFis, mat.pedestal, nf, { picking: true });
    nuevaInstanciada('pedestalVm', geo.pedestalVm, mat.pedestal, nv, { picking: true });
    nuevaInstanciada('anillo', geo.anillo, mat.anillo, n, { orden: 1 });
    nuevaInstanciada('chasis', geo.chasis, mat.chasis, nf, { picking: true });
    nuevaInstanciada('bahia', geo.bahia, mat.bahia, nf * 4);
    nuevaInstanciada('ledEstado', geo.led, mat.led, nf * 4);
    nuevaInstanciada('ledActividad', geo.led, mat.led, nf * 4);
    nuevaInstanciada('rejilla', geo.rejilla, mat.rejilla, nf);
    nuevaInstanciada('vmNucleo', geo.vmNucleo, mat.vmNucleo, nv);
    nuevaInstanciada('vmCubo', geo.vmCubo, mat.vmCubo, nv, { picking: true, orden: 2 });

    const local = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
    let iF = 0; let iV = 0; let iN = 0;
    const posLineas = [];
    const coloresLineas = [];
    const vertsAristas = geo.vmAristas.attributes.position;

    for (const nodo of [...fis, ...vms]) {
      const centro = centros.get(String(nodo.id)) || new THREE.Vector3();
      const reg = { id: String(nodo.id), nodo, tipo: nodo.type, centro: centro.clone(), escala: 1, partes: [], fase: Math.random() * 10 };
      const idx = info.length;
      reg.partes.push({ mesh: mallas.sombra, i: iN, local: local(0, 0.002, 0) });
      reg.partes.push({ mesh: mallas.anillo, i: iN, local: local(0, 0.125, 0), anillo: true });
      reg.iN = iN;
      if (nodo.type === 'fisicos') {
        reg.iF = iF;
        reg.partes.push({ mesh: mallas.pedestalFis, i: iF, local: local(0, 0, 0) });
        reg.partes.push({ mesh: mallas.chasis, i: iF, local: local(0, 1.12, 0) });
        reg.partes.push({ mesh: mallas.rejilla, i: iF, local: local(0, 2.13, 0) });
        for (let b = 0; b < 4; b++) {
          const y = 0.12 + 0.36 + b * 0.44; // base del chasis en y=0,12
          reg.partes.push({ mesh: mallas.bahia, i: iF * 4 + b, local: local(0, y, 0.61) });
          reg.partes.push({ mesh: mallas.ledEstado, i: iF * 4 + b, local: local(0.58, y, 0.635) });
          reg.partes.push({ mesh: mallas.ledActividad, i: iF * 4 + b, local: local(0.46, y, 0.635) });
        }
        mapaPicking.get(mallas.pedestalFis)[iF] = idx;
        mapaPicking.get(mallas.chasis)[iF] = idx;
        iF++;
      } else {
        reg.iV = iV;
        reg.partes.push({ mesh: mallas.pedestalVm, i: iV, local: local(0, 0, 0) });
        reg.partes.push({ mesh: mallas.vmCubo, i: iV, local: local(0, 1.0, 0) });
        reg.partes.push({ mesh: mallas.vmNucleo, i: iV, local: local(0, 1.0, 0), nucleo: true });
        mapaPicking.get(mallas.pedestalVm)[iV] = idx;
        mapaPicking.get(mallas.vmCubo)[iV] = idx;
        reg.lineaInicio = posLineas.length / 3;
        for (let k = 0; k < vertsAristas.count; k++) {
          posLineas.push(vertsAristas.getX(k) + centro.x, vertsAristas.getY(k) + 1.0, vertsAristas.getZ(k) + centro.z);
          coloresLineas.push(1, 1, 1);
        }
        reg.lineaFin = posLineas.length / 3;
        iV++;
      }
      iN++;
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

  /**
   * Aplica colores de estado, atenuación, halos y anillos discontinuos.
   * @param {(n) => {atenuado: boolean}} estilo
   */
  function actualizarEstilos(estilo) {
    for (const h of halos) { grupo.remove(h.sprite); h.sprite.material.dispose(); }
    for (const d of discontinuos) grupo.remove(d.mesh);
    halos = []; discontinuos = [];
    const lineasColor = lineasVm?.geometry.attributes.color;
    for (const reg of info) {
      const n = reg.nodo;
      const { atenuado } = estilo(n);
      const f = (hex) => (atenuado ? atenuar(C(hex)) : C(hex));
      const colorEstado = colorDeNodo(n);
      const colorLedEstado = (ESTADOS[n.status] || ESTADOS.UNKNOWN).color;
      mallas.sombra.setColorAt(reg.iN, C(0xffffff));
      mallas.anillo.setColorAt(reg.iN, f(colorEstado));
      const simulado = n.downSource === 'SIMULATED';
      const parteAnillo = reg.partes.find((p) => p.anillo);
      parteAnillo.oculta = simulado;
      if (reg.tipo === 'fisicos') {
        mallas.pedestalFis.setColorAt(reg.iF, f(ESCENARIO.pedestal));
        let base = C(ESCENARIO.chasis);
        if (n.isDown) base = base.lerp(C(colorEstado), 0.35);
        else if (n.cascadeStatus === 'DIRECT_IMPACT') base = base.lerp(C(colorEstado), 0.25);
        else if (n.cascadeStatus === 'TRANSITIVE_IMPACT') base = base.lerp(C(colorEstado), 0.15);
        mallas.chasis.setColorAt(reg.iF, atenuado ? atenuar(base) : base);
        mallas.rejilla.setColorAt(reg.iF, f(ESCENARIO.rejillaSuperior));
        for (let b = 0; b < 4; b++) {
          mallas.bahia.setColorAt(reg.iF * 4 + b, f(ESCENARIO.bahia));
          mallas.ledEstado.setColorAt(reg.iF * 4 + b, f(n.isDown ? colorEstado : colorLedEstado));
          mallas.ledActividad.setColorAt(reg.iF * 4 + b, f('#0b3d26'));
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
      if (conHalo && !atenuado) {
        const sm = new THREE.SpriteMaterial({
          map: tex.halo, color: C(colorEstado), transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, opacity: n.isDown ? 0.7 : 0.4, toneMapped: false,
        });
        const sprite = new THREE.Sprite(sm);
        sprite.position.set(reg.centro.x, ALTURA_HALO, reg.centro.z);
        sprite.scale.setScalar(3.4);
        sprite.renderOrder = 4;
        grupo.add(sprite);
        halos.push({ sprite, late: n.isDown, fase: reg.fase });
      }
      if (simulado) {
        const mesh = new THREE.Mesh(geo.anillo, mat.discontinuo);
        mesh.position.set(reg.centro.x, 0.13, reg.centro.z);
        mesh.renderOrder = 3;
        grupo.add(mesh);
        discontinuos.push({ mesh });
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
    anilloSel.visible = Boolean(reg);
    if (reg) anilloSel.position.set(reg.centro.x, 0.13, reg.centro.z);
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
      anilloSel.visible = Boolean(seleccionId) && (parpadeo <= 0 || Math.floor(parpadeo / 0.225) % 2 === 0);
      activo = true;
    }
    if (!animaciones) {
      for (const h of halos) if (h.late) { h.sprite.material.opacity = 0.7; h.sprite.scale.setScalar(3.4); }
      return activo;
    }
    anilloSel.rotation.y += 0.3 * dt;
    for (const d of discontinuos) d.mesh.rotation.y -= 0.5 * dt;
    const ciclo = (t % 1.2) / 1.2;
    const pulso = 0.5 - 0.5 * Math.cos(ciclo * Math.PI * 2);
    for (const h of halos) {
      if (!h.late) continue;
      h.sprite.scale.setScalar(3.2 + 0.6 * pulso);
      h.sprite.material.opacity = 0.45 + 0.4 * pulso;
    }
    // Núcleo de VM girando y LEDs de actividad parpadeando
    const led = mallas.ledActividad;
    for (const reg of info) {
      if (reg.tipo !== 'fisicos') { aplicarMatrices(reg, t * 0.4 + reg.fase); continue; }
      for (let b = 0; b < 4; b++) {
        const on = reg.activo && Math.sin(t * 7 + reg.fase * 3 + b * 1.7) > 0.35;
        led.setColorAt(reg.iF * 4 + b, tmpColor.set(on ? '#12b76a' : '#0b3d26'));
      }
    }
    if (led?.instanceColor) led.instanceColor.needsUpdate = true;
    return true;
  }

  function idDesdeInterseccion(hit) {
    const lista = mapaPicking.get(hit.object);
    if (!lista || hit.instanceId === undefined) return null;
    const reg = info[lista[hit.instanceId]];
    return reg ? reg.id : null;
  }

  return {
    construir,
    actualizarEstilos,
    fijarEscala,
    fijarSeleccion,
    parpadear,
    animar,
    idDesdeInterseccion,
    objetosPicking: () => [...mapaPicking.keys()],
    centro: (id) => infoPorId.get(String(id))?.centro,
    hayHalosLatiendo: () => halos.some((h) => h.late) || discontinuos.length > 0,
    dispose() {
      limpiar();
      escena.remove(grupo);
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mat).forEach((m) => m.dispose());
      Object.values(tex).forEach((t) => t.dispose());
    },
  };
}

/**
 * Gabinetes de la sala de racks 3D: estructura de 42U, paneles ciegos en las unidades libres,
 * servidores fuera del filtro (en gris) y el rotulado frontal de cada rack (nombre, ocupación,
 * número de cada U y nombre/IP de cada servidor en su unidad).
 *
 * Rendimiento: la estructura de todos los gabinetes es UNA InstancedMesh (una caja unidad
 * escalada por pieza), igual que los paneles ciegos y los servidores fuera del filtro; el
 * rotulado frontal es un plano por rack con textura de canvas (texto con fillText, nunca HTML).
 * El picking usa una caja invisible por rack fuera de la escena.
 */
import * as THREE from '/vendor/three/three.module.js';
import { ESCENARIO } from './constantesVisuales.js';
import { RACK, ALTO_GABINETE } from './salaDatos.js';

const PX_ANCHO = 512; // resolución horizontal del rotulado frontal (≈30 px por U)
const COLOR = { gabinete: '#22314a', gabineteSinRack: '#2f3646', riel: '#4a5d7d', ciego: '#172134', fantasma: '#3a4252' };
const LATERAL = 0.14;

export function crearSalaRacks3D(escena) {
  const grupo = new THREE.Group();
  grupo.name = 'racks';
  escena.add(grupo);
  const unidad = new THREE.BoxGeometry(1, 1, 1);
  const mat = {
    estructura: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.45, roughness: 0.55 }),
    ciego: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.85 }),
    fantasma: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.7, transparent: true, opacity: 0.55 }),
    invisible: new THREE.MeshBasicMaterial({ visible: false }),
    marco: new THREE.LineBasicMaterial({ color: ESCENARIO.seleccion, toneMapped: false, transparent: true, opacity: 0.9 }),
  };
  const marcoSel = new THREE.LineSegments(new THREE.EdgesGeometry(unidad), mat.marco);
  marcoSel.visible = false;
  marcoSel.renderOrder = 5;
  grupo.add(marcoSel);

  let mallas = [];
  let frentes = [];
  let cajas = null;
  let lista = [];
  let porId = new Map();
  const tmpM = new THREE.Matrix4();
  const tmpColor = new THREE.Color();

  function limpiar() {
    for (const m of mallas) { grupo.remove(m); m.dispose(); }
    for (const f of frentes) { grupo.remove(f); f.geometry.dispose(); f.material.map?.dispose(); f.material.dispose(); }
    if (cajas) { cajas.dispose(); cajas = null; }
    mallas = []; frentes = []; lista = []; porId = new Map();
  }

  /** InstancedMesh de cajas unidad a partir de [x, y, z, ancho, alto, fondo, color] */
  function instanciada(piezas, material, orden = 0) {
    if (!piezas.length) return;
    const m = new THREE.InstancedMesh(unidad, material, piezas.length);
    piezas.forEach(([x, y, z, sx, sy, sz, color], i) => {
      m.setMatrixAt(i, tmpM.makeScale(sx, sy, sz).setPosition(x, y, z));
      m.setColorAt(i, tmpColor.set(color));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.matrixAutoUpdate = false;
    m.renderOrder = orden;
    m.computeBoundingSphere();
    grupo.add(m);
    mallas.push(m);
  }

  /**
   * Rotulado frontal de un rack: cabecera (nombre y ocupación), números de U en el riel
   * izquierdo y nombre/IP de cada servidor sobre sus unidades.
   */
  function texturaFrente(r) {
    const escala = PX_ANCHO / RACK.ancho;
    const alto = Math.round(ALTO_GABINETE * escala);
    const c = document.createElement('canvas');
    c.width = PX_ANCHO; c.height = alto;
    const g = c.getContext('2d');
    const yDeU = (u) => alto - (RACK.base + (u - 1) * RACK.alturaU) * escala; // borde inferior de la U
    const pxU = RACK.alturaU * escala;
    const fuente = (peso, px) => `${peso} ${px}px Inter, "Segoe UI", sans-serif`;
    g.textBaseline = 'middle';
    // Cabecera
    const altoCab = RACK.cabecera * escala;
    g.fillStyle = r.sinRack ? '#3a4252' : '#0f1a2e';
    g.fillRect(0, 0, PX_ANCHO, altoCab);
    g.fillStyle = r.sinRack ? '#d0d5dd' : '#e6efff';
    g.font = fuente(700, Math.round(altoCab * 0.5));
    g.textAlign = 'left';
    g.fillText(r.nombre, 14, altoCab / 2 + 1, PX_ANCHO * 0.62);
    g.font = fuente(600, Math.round(altoCab * 0.38));
    g.textAlign = 'right';
    g.fillStyle = r.libres === 0 ? '#fda29b' : '#9fd7b8';
    g.fillText(`${r.ocupadas}/${RACK.unidades}U`, PX_ANCHO - 12, altoCab / 2 + 1);
    // Números de U en el riel izquierdo (de 1 abajo a 42 arriba)
    const xRiel = (RACK.ancho - RACK.anchoServidor) / 2 * escala;
    g.font = fuente(600, Math.max(9, Math.round(pxU * 0.55)));
    g.textAlign = 'center';
    for (let u = 1; u <= RACK.unidades; u++) {
      g.fillStyle = u % 5 === 0 ? '#9fb2d4' : '#5f7090';
      g.fillText(String(u), xRiel / 2, yDeU(u) - pxU / 2);
    }
    // Servidores: nombre (y la IP si hay alto)
    g.textAlign = 'left';
    const x0 = xRiel + 10;
    const anchoTexto = PX_ANCHO - x0 - 80; // deja libres los LEDs de la derecha
    for (const b of r.bloques) {
      const yInf = yDeU(b.uInferior);
      const altoPx = b.alto * pxU;
      const yMedio = yInf - altoPx / 2;
      g.fillStyle = b.nodoId ? '#f1f5ff' : '#aab4c5';
      if (b.alto >= 2 && b.ip) {
        g.font = fuente(700, Math.round(Math.min(26, pxU * 0.8)));
        g.fillText(b.nombre, x0, yMedio - pxU * 0.38, anchoTexto);
        g.font = fuente(500, Math.round(Math.min(22, pxU * 0.66)));
        g.fillStyle = b.nodoId ? '#b9c7e0' : '#8b95a7';
        g.fillText(b.ip, x0, yMedio + pxU * 0.42, anchoTexto);
      } else {
        g.font = fuente(700, Math.round(pxU * 0.68));
        g.fillText(b.ip ? `${b.nombre} · ${b.ip}` : b.nombre, x0, yMedio + 1, anchoTexto);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  /** @param {Array} racks racks de disposicionSalaRacks (con x, z = frente, bloques y porUnidad) */
  function construir(racks) {
    limpiar();
    lista = racks;
    const estructura = [];
    const ciegos = [];
    const fantasmas = [];
    const H = ALTO_GABINETE;
    const { ancho, fondo, base, alturaU, unidades, anchoServidor, fondoServidor } = RACK;
    cajas = new THREE.InstancedMesh(unidad, mat.invisible, Math.max(1, racks.length));
    cajas.count = racks.length;
    racks.forEach((r, i) => {
      porId.set(String(r.id), r);
      const col = r.sinRack ? COLOR.gabineteSinRack : COLOR.gabinete;
      const zc = r.z - fondo / 2;
      const altoU = unidades * alturaU;
      // Estructura: laterales, techo, zócalo, panel trasero, cabecera frontal y rieles
      estructura.push(
        [r.x - ancho / 2 + LATERAL / 2, H / 2, zc, LATERAL, H, fondo, col],
        [r.x + ancho / 2 - LATERAL / 2, H / 2, zc, LATERAL, H, fondo, col],
        [r.x, H - 0.05, zc, ancho, 0.1, fondo, col],
        [r.x, base / 2, zc, ancho, base, fondo, col],
        [r.x, H / 2, r.z - fondo + 0.05, ancho, H, 0.1, col],
        [r.x, H - RACK.cabecera / 2, r.z - 0.05, ancho - 2 * LATERAL, RACK.cabecera - 0.04, 0.1, col],
        [r.x - anchoServidor / 2 - 0.06, base + altoU / 2, r.z - 0.05, 0.09, altoU, 0.09, COLOR.riel],
        [r.x + anchoServidor / 2 + 0.06, base + altoU / 2, r.z - 0.05, 0.09, altoU, 0.09, COLOR.riel],
      );
      // Paneles ciegos en cada U libre (la ranura entre ellos marca las unidades)
      r.porUnidad.forEach((dueno, idx) => {
        if (dueno !== -1) return;
        const u = unidades - idx;
        ciegos.push([r.x, base + (u - 0.5) * alturaU, r.z - 0.1, anchoServidor - 0.04, alturaU - 0.026, 0.05, COLOR.ciego]);
      });
      // Servidores del inventario que el filtro actual oculta: ocupan su U, en gris
      for (const b of r.bloques) {
        if (b.nodoId) continue;
        fantasmas.push([r.x, b.y, r.z - 0.08 - fondoServidor / 2, anchoServidor, b.alto * alturaU - 0.024, fondoServidor, COLOR.fantasma]);
      }
      // Rotulado frontal
      const plano = new THREE.Mesh(
        new THREE.PlaneGeometry(ancho, H),
        new THREE.MeshBasicMaterial({ map: texturaFrente(r), transparent: true, depthWrite: false, toneMapped: false }),
      );
      plano.position.set(r.x, H / 2, r.z + 0.008);
      plano.renderOrder = 3;
      plano.matrixAutoUpdate = false;
      plano.updateMatrix();
      plano.userData.rackId = String(r.id);
      grupo.add(plano);
      frentes.push(plano);
      cajas.setMatrixAt(i, tmpM.makeScale(ancho, H, fondo).setPosition(r.x, H / 2, zc));
    });
    instanciada(estructura, mat.estructura);
    instanciada(ciegos, mat.ciego);
    instanciada(fantasmas, mat.fantasma, 1);
    cajas.computeBoundingSphere();
    fijarSeleccion(seleccion);
  }

  let seleccion = null;
  function fijarSeleccion(id) {
    seleccion = id ? String(id) : null;
    const r = seleccion ? porId.get(seleccion) : null;
    marcoSel.visible = Boolean(r);
    if (r) {
      marcoSel.position.set(r.x, ALTO_GABINETE / 2, r.z - RACK.fondo / 2);
      marcoSel.scale.set(RACK.ancho + 0.2, ALTO_GABINETE + 0.14, RACK.fondo + 0.2);
    }
  }

  function idDesdeInterseccion(hit) {
    if (hit.object !== cajas || hit.instanceId === undefined) return null;
    return lista[hit.instanceId]?.id ?? null;
  }

  return {
    construir,
    fijarSeleccion,
    idDesdeInterseccion,
    objetosPicking: () => (cajas && cajas.count ? [cajas] : []),
    rack: (id) => porId.get(String(id)) || null,
    racks: () => lista,
    dispose() {
      limpiar();
      escena.remove(grupo);
      unidad.dispose();
      marcoSel.geometry.dispose();
      Object.values(mat).forEach((m) => m.dispose());
    },
  };
}

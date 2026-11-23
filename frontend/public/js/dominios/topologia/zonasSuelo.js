/**
 * Zonas rotuladas del suelo en la disposición "Sala de datos": contorno y relleno suave de
 * cada área, fila de racks, host o clúster, más su rótulo pintado en el suelo.
 * Contornos y rellenos van fusionados en dos geometrías (2 llamadas de dibujo); cada
 * rótulo es un plano con textura de canvas (el texto se pinta con fillText, nunca HTML).
 */
import * as THREE from '/vendor/three/three.module.js';

const COLORES = { area: '#5b7fb8', rack: '#3d8bfd', host: '#9b7bff', cluster: '#9b7bff', gabinete: '#3d8bfd', sinRack: '#8a94a6' };
// Texto claro sobre placa oscura: legible sobre el suelo, la cuadrícula y los arcos
const TEXTO = { area: '#c9d8f2', rack: '#a9caff', host: '#cdbfff', cluster: '#cdbfff', gabinete: '#dce8ff', sinRack: '#d0d5dd' };
const ALTO_ROTULO = { area: 1.9, rack: 1.35, host: 1.35, cluster: 1.35, gabinete: 1.5, sinRack: 1.5 };
// Gabinetes de la sala de racks: solo el rótulo (nombre y ocupación) delante de cada rack
const SIN_CONTORNO = new Set(['gabinete', 'sinRack']);
const Y_SUELO = 0.015;

/** Placa con texto; varias líneas separadas por salto de línea (la primera en negrita) */
function texturaTexto(texto, color, colorTexto) {
  const lineas = String(texto).split('\n');
  const altoLinea = (i) => (i === 0 ? 72 : 58);
  const alto = 24 + lineas.reduce((a, _, i) => a + altoLinea(i), 0);
  const pad = 22;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const fuenteDe = (i) => (i === 0 ? '700 58px Inter, "Segoe UI", sans-serif' : '600 46px Inter, "Segoe UI", sans-serif');
  let medida = 0;
  lineas.forEach((l, i) => { g.font = fuenteDe(i); medida = Math.max(medida, g.measureText(l).width); });
  const ancho = Math.min(2048, Math.ceil(medida) + pad * 2);
  c.width = ancho; c.height = alto;
  g.fillStyle = 'rgba(10, 18, 34, 0.78)';
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(2, 2, ancho - 4, alto - 4, 16);
  g.fill();
  g.stroke();
  g.textBaseline = 'middle';
  let y = 12;
  lineas.forEach((l, i) => {
    g.font = fuenteDe(i);
    g.fillStyle = i === 0 ? colorTexto : color;
    // Varias líneas: centradas (rótulo de gabinete); una sola: alineada a la izquierda
    const x = lineas.length > 1 ? (ancho - g.measureText(l).width) / 2 : pad;
    g.fillText(l, x, y + altoLinea(i) / 2 + 3);
    y += altoLinea(i);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { textura: t, aspecto: ancho / alto };
}

export function crearZonasSuelo(escena) {
  const grupo = new THREE.Group();
  grupo.name = 'zonas';
  grupo.matrixAutoUpdate = false;
  escena.add(grupo);
  const matLinea = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, toneMapped: false, depthWrite: false });
  const matRelleno = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.07, toneMapped: false, depthWrite: false });
  let objetos = [];

  function limpiar() {
    for (const o of objetos) {
      grupo.remove(o);
      o.geometry.dispose();
      if (o.material !== matLinea && o.material !== matRelleno) { o.material.map?.dispose(); o.material.dispose(); }
    }
    objetos = [];
  }

  function agregar(o) {
    o.matrixAutoUpdate = false;
    o.updateMatrix();
    grupo.add(o);
    objetos.push(o);
  }

  /** @param {Array<{tipo, etiqueta, x0, z0, x1, z1}>} zonas */
  function construir(zonas) {
    limpiar();
    if (!zonas.length) return;
    const lineas = []; const coloresL = [];
    const tris = []; const coloresT = [];
    const col = new THREE.Color();
    for (const z of zonas) {
      col.set(COLORES[z.tipo] || COLORES.rack);
      const y = z.tipo === 'area' ? Y_SUELO : Y_SUELO + 0.005;
      const p = [[z.x0, z.z0], [z.x1, z.z0], [z.x1, z.z1], [z.x0, z.z1]];
      for (let i = 0; i < 4 && !SIN_CONTORNO.has(z.tipo); i++) {
        const a = p[i]; const b = p[(i + 1) % 4];
        lineas.push(a[0], y, a[1], b[0], y, b[1]);
        coloresL.push(col.r, col.g, col.b, col.r, col.g, col.b);
      }
      if (z.tipo !== 'area' && !SIN_CONTORNO.has(z.tipo)) {
        for (const v of [p[0], p[2], p[1], p[0], p[3], p[2]]) { tris.push(v[0], y - 0.002, v[1]); coloresT.push(col.r, col.g, col.b); }
      }
      // Rótulo en el borde frontal (el más cercano a la cámara), para que los equipos no lo
      // tapen: el de cada bloque justo delante de él y el del área en su franja frontal
      const lineasRotulo = String(z.etiqueta).split('\n').length;
      // Un bloque con varias líneas (host con sus VMs) crece en alto; el gabinete ya tiene su medida
      const alto = (ALTO_ROTULO[z.tipo] || 1.35) * (SIN_CONTORNO.has(z.tipo) ? 1 : 1 + 0.75 * (lineasRotulo - 1));
      const { textura, aspecto } = texturaTexto(z.etiqueta, COLORES[z.tipo] || COLORES.rack, TEXTO[z.tipo] || TEXTO.rack);
      const ancho = z.anchoRotulo ? Math.min(alto * aspecto, z.anchoRotulo) : Math.min(alto * aspecto, Math.max(4, z.x1 - z.x0 - 0.3));
      const plano = new THREE.Mesh(
        new THREE.PlaneGeometry(ancho, ancho / aspecto).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: textura, transparent: true, depthWrite: false, toneMapped: false }),
      );
      const altoReal = ancho / aspecto;
      const zRotulo = z.tipo === 'area' ? z.z1 - altoReal * 0.5 - 0.5 : z.z1 + altoReal * 0.5 + 0.2;
      const xRotulo = SIN_CONTORNO.has(z.tipo) ? (z.x0 + z.x1) / 2 : z.x0 + ancho / 2 + (z.tipo === 'area' ? 0.4 : 0.15);
      plano.position.set(xRotulo, y + 0.004, zRotulo);
      plano.renderOrder = 1;
      agregar(plano);
    }
    const gL = new THREE.BufferGeometry();
    gL.setAttribute('position', new THREE.Float32BufferAttribute(lineas, 3));
    gL.setAttribute('color', new THREE.Float32BufferAttribute(coloresL, 3));
    agregar(new THREE.LineSegments(gL, matLinea));
    if (tris.length) {
      const gT = new THREE.BufferGeometry();
      gT.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
      gT.setAttribute('color', new THREE.Float32BufferAttribute(coloresT, 3));
      agregar(new THREE.Mesh(gT, matRelleno));
    }
  }

  return {
    construir,
    dispose() {
      limpiar();
      escena.remove(grupo);
      matLinea.dispose();
      matRelleno.dispose();
    },
  };
}

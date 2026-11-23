/**
 * Disposición 3D "Sala de datos". Función PURA (sin DOM ni three): recibe los nodos
 * visibles y devuelve el centro de cada servidor en unidades del mundo 3D (x, z) y las
 * zonas rotuladas del suelo.
 *
 *  - Infraestructura: los servidores físicos se agrupan por su rack (campo `rack`). Cada
 *    rack es un bloque en cuadrícula (hasta 4 por fila); los racks se alinean en filas
 *    (Fila A, Fila B…) separadas por un pasillo.
 *  - Virtualización: cada VM se coloca junto a su host (el campo `rack` de la VM es su
 *    host o clúster). Si el host es un servidor físico del mapa, el host encabeza el bloque
 *    y sus VMs quedan en cuadrícula detrás; si no, el bloque se rotula como clúster.
 *
 * Todo queda alineado a una cuadrícula de PASO unidades y centrado en el origen.
 */
import { compararIds } from './geometriaAristas.js';

export const SALA = Object.freeze({
  paso: 4, // distancia entre centros de servidores vecinos
  porFila: 4, // servidores por fila dentro de un bloque
  margen: 2.4, // borde de la zona alrededor de los centros
  separacionBloques: 3, // hueco entre bloques de una misma fila
  bloquesPorFila: 4,
  pasillo: 6, // separación entre filas de bloques
  separacionAreas: 9, // entre Infraestructura y Virtualización
  margenArea: 1.6,
});

const SIN_RACK = 'Sin rack';
const SIN_HOST = 'Sin host';
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const clave = (t) => String(t || '').trim().toLowerCase();
const ordenTexto = (a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
const ordenNodos = (a, b) => ordenTexto(String(a.name || ''), String(b.name || '')) || compararIds(a.id, b.id);
const letraFila = (i) => (i < LETRAS.length ? LETRAS[i] : `${LETRAS[Math.floor(i / LETRAS.length) - 1]}${LETRAS[i % LETRAS.length]}`);

/**
 * Bloque en cuadrícula: `cabecera` (opcional, p. ej. el host) en la primera fila, centrada,
 * y `miembros` en filas de SALA.porFila detrás.
 * @returns {{ancho:number, fondo:number, celdas:Array<{id:string, x:number, z:number}>}} coords locales
 */
function bloque(miembros, cabecera = null) {
  const { paso, porFila, margen } = SALA;
  const columnas = Math.max(1, Math.min(porFila, miembros.length || 1));
  const filas = Math.ceil(miembros.length / porFila);
  const anchoCentros = (columnas - 1) * paso;
  const celdas = [];
  let z = 0;
  if (cabecera) {
    celdas.push({ id: String(cabecera.id), x: anchoCentros / 2, z: 0 });
    z = paso;
  }
  miembros.forEach((n, i) => {
    celdas.push({ id: String(n.id), x: (i % porFila) * paso, z: z + Math.floor(i / porFila) * paso });
  });
  const fondoCentros = (cabecera ? paso : 0) + Math.max(0, filas - 1) * paso;
  return { ancho: anchoCentros + margen * 2, fondo: fondoCentros + margen * 2, celdas, anchoCentros, fondoCentros };
}

/**
 * Coloca bloques en filas (izquierda a derecha, SALA.bloquesPorFila por fila) a partir de z0.
 * @returns {{zonas: object[], centros: Map<string,{x,z}>, zFin: number, xMax: number}}
 */
function colocarFilas(bloques, z0, rotular) {
  const { separacionBloques, bloquesPorFila, pasillo, margen } = SALA;
  const centros = new Map();
  const zonas = [];
  let z = z0;
  let xMax = 0;
  for (let f = 0; f * bloquesPorFila < bloques.length; f++) {
    const fila = bloques.slice(f * bloquesPorFila, (f + 1) * bloquesPorFila);
    let x = 0;
    let fondo = 0;
    fila.forEach((b, i) => {
      for (const c of b.bloque.celdas) centros.set(c.id, { x: x + margen + c.x, z: z + margen + c.z });
      zonas.push({ ...b.zona, etiqueta: rotular(b, f, i), x0: x, z0: z, x1: x + b.bloque.ancho, z1: z + b.bloque.fondo });
      x += b.bloque.ancho + separacionBloques;
      fondo = Math.max(fondo, b.bloque.fondo);
    });
    xMax = Math.max(xMax, x - separacionBloques);
    z += fondo + pasillo;
  }
  return { centros, zonas, zFin: z - pasillo, xMax };
}

/**
 * @param {Array<{id, type: 'fisicos'|'virtuales', name?: string, rack?: string}>} nodos
 * @returns {{ centros: Map<string, {x:number, z:number}>, zonas: Array<{tipo:string, etiqueta:string, x0:number, z0:number, x1:number, z1:number}> }}
 */
export function disposicionSala(nodos) {
  const fisicos = nodos.filter((n) => n.type === 'fisicos').sort(ordenNodos);
  const vms = nodos.filter((n) => n.type !== 'fisicos').sort(ordenNodos);

  // Hosts: físicos cuyo nombre coincide con el host/clúster de alguna VM
  const fisicoPorNombre = new Map();
  for (const n of fisicos) if (n.name && !fisicoPorNombre.has(clave(n.name))) fisicoPorNombre.set(clave(n.name), n);
  const vmsPorHost = new Map();
  for (const v of vms) {
    const host = String(v.rack || '').trim() || SIN_HOST;
    if (!vmsPorHost.has(host)) vmsPorHost.set(host, []);
    vmsPorHost.get(host).push(v);
  }
  const hosts = new Set();
  for (const host of vmsPorHost.keys()) {
    const f = fisicoPorNombre.get(clave(host));
    if (f) hosts.add(String(f.id));
  }

  // Infraestructura: físicos (no hosts) por rack
  const porRack = new Map();
  for (const n of fisicos) {
    if (hosts.has(String(n.id))) continue;
    const rack = String(n.rack || '').trim() || SIN_RACK;
    if (!porRack.has(rack)) porRack.set(rack, []);
    porRack.get(rack).push(n);
  }
  const bloquesRack = [...porRack.keys()].sort(ordenTexto).map((rack) => ({ nombre: rack, bloque: bloque(porRack.get(rack)), zona: { tipo: 'rack' } }));

  // Virtualización: un bloque por host o clúster
  const bloquesVirt = [...vmsPorHost.keys()].sort(ordenTexto).map((host) => {
    const fisico = fisicoPorNombre.get(clave(host));
    return {
      nombre: host,
      bloque: bloque(vmsPorHost.get(host), fisico || null),
      zona: { tipo: fisico ? 'host' : 'cluster' },
    };
  });

  const centros = new Map();
  const zonas = [];
  const { margenArea, separacionAreas } = SALA;
  let z = 0;
  if (bloquesRack.length) {
    const r = colocarFilas(bloquesRack, z, (b, f) => `Fila ${letraFila(f)} · ${b.nombre}`);
    r.centros.forEach((v, k) => centros.set(k, v));
    zonas.push({ tipo: 'area', etiqueta: 'Infraestructura', x0: -margenArea, z0: z - margenArea - 2.4, x1: r.xMax + margenArea, z1: r.zFin + margenArea + 1.6 });
    zonas.push(...r.zonas);
    z = r.zFin + separacionAreas;
  }
  if (bloquesVirt.length) {
    const r = colocarFilas(bloquesVirt, z, (b) => (b.zona.tipo === 'host' ? `Host ${b.nombre}` : `Clúster ${b.nombre}`));
    r.centros.forEach((v, k) => centros.set(k, v));
    zonas.push({ tipo: 'area', etiqueta: 'Virtualización', x0: -margenArea, z0: z - margenArea - 2.4, x1: r.xMax + margenArea, z1: r.zFin + margenArea + 1.6 });
    zonas.push(...r.zonas);
  }

  // Centrar en el origen (manteniendo la alineación a la cuadrícula de PASO/2)
  if (zonas.length) {
    const x0 = Math.min(...zonas.map((q) => q.x0)); const x1 = Math.max(...zonas.map((q) => q.x1));
    const z0 = Math.min(...zonas.map((q) => q.z0)); const z1 = Math.max(...zonas.map((q) => q.z1));
    const medio = SALA.paso / 2;
    const dx = -Math.round((x0 + x1) / 2 / medio) * medio;
    const dz = -Math.round((z0 + z1) / 2 / medio) * medio;
    for (const c of centros.values()) { c.x += dx; c.z += dz; }
    for (const q of zonas) { q.x0 += dx; q.x1 += dx; q.z0 += dz; q.z1 += dz; }
  }
  return { centros, zonas };
}

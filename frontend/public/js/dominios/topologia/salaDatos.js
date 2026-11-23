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
import { colocarEnRack, huecosLibres, UNIDADES_RACK } from '../hosts/colocacionRack.js';

export const SALA = Object.freeze({
  paso: 4, // distancia entre centros de servidores vecinos
  porFila: 4, // servidores por fila dentro de un bloque
  margen: 2.4, // borde de la zona alrededor de los centros
  separacionBloques: 3, // hueco entre bloques de una misma fila
  bloquesPorFila: 4,
  pasillo: 6, // separación entre filas de bloques
  separacionAreas: 11, // entre Infraestructura y Virtualización
  margenArea: 1.6,
  anchoMinimo: 9, // ancho mínimo de un bloque (rack, host o clúster)
  frenteArea: 3.8, // franja frontal de cada área, donde va su rótulo
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
  const { paso, porFila, margen, anchoMinimo } = SALA;
  const columnas = Math.max(1, Math.min(porFila, miembros.length || 1));
  const filas = Math.ceil(miembros.length / porFila);
  const anchoCentros = (columnas - 1) * paso;
  // Ancho mínimo para que el rótulo frontal quepa completo; los equipos quedan centrados
  const ancho = Math.max(anchoMinimo, anchoCentros + margen * 2);
  const dx = (ancho - margen * 2 - anchoCentros) / 2;
  const celdas = [];
  let z = 0;
  if (cabecera) {
    celdas.push({ id: String(cabecera.id), x: dx + anchoCentros / 2, z: 0 });
    z = paso;
  }
  miembros.forEach((n, i) => {
    celdas.push({ id: String(n.id), x: dx + (i % porFila) * paso, z: z + Math.floor(i / porFila) * paso });
  });
  const fondoCentros = (cabecera ? paso : 0) + Math.max(0, filas - 1) * paso;
  return { ancho, fondo: fondoCentros + margen * 2, celdas, anchoCentros, fondoCentros };
}

/**
 * Coloca bloques en filas (izquierda a derecha, SALA.bloquesPorFila por fila) a partir de z0.
 * @returns {{zonas: object[], centros: Map<string,{x,z}>, zFin: number, xMax: number}}
 */
function colocarFilas(bloques, z0, rotular, bloquesPorFila = SALA.bloquesPorFila) {
  const { separacionBloques, pasillo, margen } = SALA;
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
  const { margenArea, separacionAreas, frenteArea } = SALA;
  let z = 0;
  if (bloquesRack.length) {
    const r = colocarFilas(bloquesRack, z, (b, f) => `Fila ${letraFila(f)} · ${b.nombre}`);
    r.centros.forEach((v, k) => centros.set(k, v));
    zonas.push({ tipo: 'area', etiqueta: 'Infraestructura', x0: -margenArea, z0: z - margenArea, x1: r.xMax + margenArea, z1: r.zFin + frenteArea });
    zonas.push(...r.zonas);
    z = r.zFin + separacionAreas;
  }
  if (bloquesVirt.length) {
    const r = colocarFilas(bloquesVirt, z, (b) => (b.zona.tipo === 'host' ? `Host ${b.nombre}` : `Clúster ${b.nombre}`));
    r.centros.forEach((v, k) => centros.set(k, v));
    zonas.push({ tipo: 'area', etiqueta: 'Virtualización', x0: -margenArea, z0: z - margenArea, x1: r.xMax + margenArea, z1: r.zFin + frenteArea });
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

// ── Sala de racks (inventario real) ─────────────────────────────────────────

/**
 * Medidas del gabinete de 42U en unidades del mundo 3D (1U = 0,2 u; proporciones de un rack
 * de 600 × 1070 mm). Los racks forman filas con el frente hacia la cámara (+z), uno junto a
 * otro, como en una sala de datos.
 */
export const RACK = Object.freeze({
  unidades: UNIDADES_RACK,
  alturaU: 0.2,
  base: 0.24, // zócalo bajo la U1
  cabecera: 0.62, // franja superior con el rótulo del rack
  ancho: 3.4,
  fondo: 5.2,
  paso: 3.75, // distancia entre centros de racks vecinos
  porFila: 8,
  pasilloFilas: 10, // entre filas de racks (de frente a espalda)
  anchoServidor: 3.0,
  fondoServidor: 4.8,
  separacionVirtualizacion: 7,
});
export const ALTO_GABINETE = RACK.base + RACK.unidades * RACK.alturaU + RACK.cabecera;
export const ID_SIN_UBICAR = 'sin-ubicar';

/** Altura (centro) de un tramo de unidades sobre el suelo */
export const alturaTramo = (uInferior, alto) => RACK.base + (uInferior - 1) * RACK.alturaU + (alto * RACK.alturaU) / 2;

/**
 * Sala de racks fiel al inventario: cada rack físico (también los vacíos) es un gabinete de
 * 42U y cada servidor ocupa sus unidades reales (misma regla que la vista de rack de /fisicos).
 *
 * @param {Array} nodos nodos visibles del grafo
 * @param {Array<{id, name, servers: Array}>} racks racks físicos del inventario (con sus
 *   servidores en el orden de la vista de rack); los servidores que no están entre los
 *   nodos visibles se dibujan como "fuera del filtro"
 * @returns {{
 *   centros: Map<string,{x:number,z:number}>,
 *   slots: Map<string,{x,y,z,ancho,alto,fondo,rackId,uInferior,uSuperior}>,
 *   racks: Array<{id, nombre, x, z, ocupadas, libres, porUnidad, huecos, bloques, sinUbicar, sinRack?: boolean}>,
 *   zonas: Array
 * }}
 */
export function disposicionSalaRacks(nodos, racks = []) {
  const visibles = new Map(nodos.map((n) => [String(n.id), n]));
  const fisicos = nodos.filter((n) => n.type === 'fisicos');
  const vms = nodos.filter((n) => n.type !== 'fisicos').sort(ordenNodos);
  const enRack = new Set();

  const listaRacks = [...racks].sort((a, b) => ordenTexto(String(a.name), String(b.name)) || compararIds(a.id, b.id)).map((r) => {
    const servidores = (r.servers || []).map((s) => ({ ...s, id: String(s.id) }));
    const col = colocarEnRack(servidores);
    const bloques = col.bloques.map((b) => {
      const id = String(b.servidor.id);
      if (visibles.has(id)) enRack.add(id);
      return {
        nodoId: visibles.has(id) ? id : null,
        servidorId: id,
        nombre: b.servidor.nombre || b.servidor.hostname || `#${id}`,
        ip: b.servidor.ip || '',
        uInferior: b.uInferior,
        uSuperior: b.uSuperior,
        alto: b.alto,
      };
    });
    return {
      id: String(r.id), nombre: String(r.name), ocupadas: col.ocupadas, libres: col.libres, porUnidad: col.porUnidad,
      huecos: huecosLibres(col.porUnidad), bloques, sinUbicar: col.sinUbicar.map((s) => s.nombre || `#${s.id}`),
    };
  });

  // Físicos visibles que no ocupan ninguna U de su rack (sin rack, rack lleno, U compartida o
  // sin espacio): racks aparte "Sin ubicar" de 2U por servidor, tantos como hagan falta, para
  // que la sala muestre TODO el inventario
  const sueltos = fisicos.filter((n) => !enRack.has(String(n.id))).sort(ordenNodos);
  const porRackSinUbicar = Math.floor(RACK.unidades / 2);
  for (let k = 0; k * porRackSinUbicar < sueltos.length; k++) {
    const grupo = sueltos.slice(k * porRackSinUbicar, (k + 1) * porRackSinUbicar);
    const porUnidad = new Array(RACK.unidades).fill(-1);
    const bloques = grupo.map((n, i) => {
      const alto = 2;
      const u = 1 + i * alto;
      for (let j = 0; j < alto; j++) porUnidad[RACK.unidades - (u + j)] = i;
      return { nodoId: String(n.id), servidorId: String(n.id), nombre: n.name || `#${n.id}`, ip: n.ip || '', uInferior: u, uSuperior: u + alto - 1, alto };
    });
    const ocupadas = porUnidad.filter((d) => d >= 0).length;
    listaRacks.push({
      id: k === 0 ? ID_SIN_UBICAR : `${ID_SIN_UBICAR}-${k + 1}`, nombre: k === 0 ? 'Sin ubicar' : `Sin ubicar ${k + 1}`, sinRack: true,
      ocupadas, libres: RACK.unidades - ocupadas, porUnidad, huecos: huecosLibres(porUnidad), bloques, sinUbicar: [],
    });
  }

  const centros = new Map();
  const slots = new Map();
  const zonas = [];
  let xMaxInfra = -Infinity;
  let zMinInfra = Infinity;
  listaRacks.forEach((r, i) => {
    const fila = Math.floor(i / RACK.porFila);
    r.x = (i % RACK.porFila) * RACK.paso + RACK.ancho / 2;
    r.z = -fila * (RACK.fondo + RACK.pasilloFilas); // frente del gabinete
    r.fila = letraFila(fila);
    xMaxInfra = Math.max(xMaxInfra, r.x + RACK.ancho / 2);
    zMinInfra = Math.min(zMinInfra, r.z - RACK.fondo);
    const zServidor = r.z - 0.08 - RACK.fondoServidor / 2;
    for (const b of r.bloques) {
      b.y = alturaTramo(b.uInferior, b.alto);
      if (!b.nodoId) continue;
      slots.set(b.nodoId, {
        x: r.x, y: b.y, z: zServidor, ancho: RACK.anchoServidor, alto: b.alto * RACK.alturaU, fondo: RACK.fondoServidor,
        rackId: r.id, rackNombre: r.nombre, uInferior: b.uInferior, uSuperior: b.uSuperior,
      });
      centros.set(b.nodoId, { x: r.x, z: r.z });
    }
    zonas.push({
      tipo: r.sinRack ? 'sinRack' : 'gabinete', etiqueta: `${r.nombre}\n${r.ocupadas}/${RACK.unidades}U`, rackId: r.id,
      x0: r.x - RACK.ancho / 2, x1: r.x + RACK.ancho / 2, z0: r.z - RACK.fondo, z1: r.z, anchoRotulo: RACK.paso - 0.4,
    });
  });
  const { margenArea, frenteArea } = SALA;
  if (listaRacks.length) {
    zonas.push({ tipo: 'area', etiqueta: 'Sala de racks', x0: -margenArea, z0: zMinInfra - margenArea, x1: xMaxInfra + margenArea, z1: frenteArea + 1.2 });
  }

  // Virtualización: un bloque por host o clúster, a la derecha de la sala de racks
  const nombresFisicos = new Set(fisicos.map((n) => clave(n.name)));
  const vmsPorHost = new Map();
  for (const v of vms) {
    const host = String(v.rack || '').trim() || SIN_HOST;
    if (!vmsPorHost.has(host)) vmsPorHost.set(host, []);
    vmsPorHost.get(host).push(v);
  }
  const bloquesVirt = [...vmsPorHost.keys()].sort(ordenTexto).map((host) => ({
    nombre: host, bloque: bloque(vmsPorHost.get(host)), zona: { tipo: nombresFisicos.has(clave(host)) ? 'host' : 'cluster' },
  }));
  if (bloquesVirt.length) {
    // Dos bloques por fila; las filas crecen hacia el fondo y la delantera queda a la altura
    // del frente de los racks (la sala se ve compacta y los racks siguen siendo protagonistas)
    const x0 = listaRacks.length ? xMaxInfra + RACK.separacionVirtualizacion : 0;
    const conVms = (b) => {
      const nombres = vmsPorHost.get(b.nombre).map((v) => v.name || `#${v.id}`);
      const lineas = [];
      for (let i = 0; i < nombres.length; i += 3) lineas.push(nombres.slice(i, i + 3).join(' · '));
      return [`${b.zona.tipo === 'host' ? 'Host' : 'Clúster'} ${b.nombre}`, ...lineas].join('\n');
    };
    const r = colocarFilas(bloquesVirt, 0, conVms, listaRacks.length ? 2 : SALA.bloquesPorFila);
    const dz = listaRacks.length ? -r.zFin : 0;
    r.centros.forEach((v, k) => centros.set(k, { x: v.x + x0, z: v.z + dz }));
    for (const q of r.zonas) { q.x0 += x0; q.x1 += x0; q.z0 += dz; q.z1 += dz; }
    zonas.push({ tipo: 'area', etiqueta: 'Virtualización', x0: x0 - margenArea, z0: dz - margenArea, x1: x0 + r.xMax + margenArea, z1: r.zFin + dz + frenteArea + (listaRacks.length ? 1.2 : 0) });
    zonas.push(...r.zonas);
  }

  // Centrar en el origen
  if (zonas.length) {
    const x0 = Math.min(...zonas.map((q) => q.x0)); const x1 = Math.max(...zonas.map((q) => q.x1));
    const z0 = Math.min(...zonas.map((q) => q.z0)); const z1 = Math.max(...zonas.map((q) => q.z1));
    const dx = -Math.round(((x0 + x1) / 2) * 10) / 10;
    const dz = -Math.round(((z0 + z1) / 2) * 10) / 10;
    for (const c of centros.values()) { c.x += dx; c.z += dz; }
    for (const s of slots.values()) { s.x += dx; s.z += dz; }
    for (const r of listaRacks) { r.x += dx; r.z += dz; }
    for (const q of zonas) { q.x0 += dx; q.x1 += dx; q.z0 += dz; q.z1 += dz; }
  }
  return { centros, slots, racks: listaRacks, zonas };
}

/** true si el id es el de un rack "Sin ubicar" (no es un rack del inventario) */
export const esRackSinUbicar = (id) => String(id).startsWith(ID_SIN_UBICAR);

/**
 * Cobertura del inventario en el mapa: compara los servidores de /fisicos y /virtuales
 * (misma fuente de datos) con los que el mapa dibuja.
 *
 * @param {Array<{id, type, name?}>} nodos todos los nodos cargados del grafo (sin filtros)
 * @param {{fisicos?: {racks?: Array, servers?: Array}, virtuales?: {servers?: Array}}|null} inventario
 * @param {{ sala?: boolean }} [opciones] sala=true: cuenta los servidores con sitio en la sala de racks
 * @returns {{ inventario: number, enMapa: number, faltan: string[] } | null} null sin inventario
 */
export function coberturaInventario(nodos, inventario, { sala = false } = {}) {
  if (!inventario?.fisicos?.servers && !inventario?.virtuales?.servers) return null;
  const servidores = [...(inventario.fisicos?.servers || []), ...(inventario.virtuales?.servers || [])];
  let presentes = new Set(nodos.map((n) => String(n.id)));
  if (sala) {
    const d = disposicionSalaRacks(nodos, inventario.fisicos?.racks || []);
    presentes = new Set([...d.slots.keys(), ...nodos.filter((n) => n.type !== 'fisicos' && d.centros.has(String(n.id))).map((n) => String(n.id))]);
  }
  const faltan = servidores.filter((x) => !presentes.has(String(x.id))).map((x) => x.nombre || x.hostname || `#${x.id}`);
  return { inventario: servidores.length, enMapa: servidores.length - faltan.length, faltan };
}

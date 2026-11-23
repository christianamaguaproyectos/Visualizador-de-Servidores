/**
 * Geometría de aristas compartida por el 3D y el 2D. Funciones PURAS (sin DOM ni three).
 *
 * Separación de curvas:
 *  - Par bidireccional (A→B y B→A): cada curva se desplaza a un lado del segmento.
 *    La normal se calcula SIEMPRE sobre la dirección canónica (ID menor → ID mayor) y
 *    el signo depende de si la arista va en ese sentido o en el contrario; así las dos
 *    curvas quedan en lados opuestos sea cual sea el orden de los extremos.
 *  - Paralelas en el mismo sentido (A→B de distinto tipo): índice k por dependencyType;
 *    se suma k·paso al desplazamiento (y altura extra en 3D).
 */

/** Compara IDs numéricos en string sin perder precisión (igual que el backend) */
export function compararIds(a, b) {
  const sa = String(a);
  const sb = String(b);
  if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
    return sa.length - sb.length || (sa < sb ? -1 : sa > sb ? 1 : 0);
  }
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/**
 * Índice de paralela de cada arista dentro de su par dirigido (ordenado por tipo).
 * @param {Array<{id, source, target, dependencyType}>} aristas
 * @returns {Map<string, number>} id de arista -> k (0, 1, 2…)
 */
export function indicesParalelas(aristas) {
  const grupos = new Map();
  for (const e of aristas) {
    const clave = `${e.source}>${e.target}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(e);
  }
  const resultado = new Map();
  for (const lista of grupos.values()) {
    lista.sort((a, b) => String(a.dependencyType).localeCompare(String(b.dependencyType)) || compararIds(a.id, b.id));
    lista.forEach((e, k) => resultado.set(String(e.id), k));
  }
  return resultado;
}

/**
 * Desplazamiento lateral con signo respecto a la normal CANÓNICA.
 * @param {{source, target, isBidirectionalPair?: boolean}} arista
 * @param {number} k índice de paralela
 * @param {{base: number, paso: number}} medidas
 */
export function desplazamientoLateral(arista, k, { base, paso }) {
  const sentidoCanonico = compararIds(arista.source, arista.target) < 0 ? 1 : -1;
  if (arista.isBidirectionalPair) return sentidoCanonico * (base + k * paso);
  return k === 0 ? 0 : sentidoCanonico * k * paso;
}

/**
 * Normal unitaria (en el plano) de la dirección canónica entre dos puntos.
 * Se usa con (x, z) en 3D y (x, y) en 2D.
 */
export function normalCanonica(a, b, idA, idB) {
  let [p, q] = [a, b];
  if (compararIds(idA, idB) > 0) [p, q] = [b, a];
  const du = q[0] - p[0];
  const dv = q[1] - p[1];
  const l = Math.hypot(du, dv) || 1;
  return [-dv / l, du / l];
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Punto de control de la curva cuadrática 3D.
 * @param {number[]} p0 [x,y,z]  @param {number[]} p1 [x,y,z]
 * @param {number[]} n [nx, nz] normal canónica  @param {number} off desplazamiento con signo
 * @param {number} k índice de paralela
 * @param {number} elevacion altura extra (la sala de datos eleva los arcos sobre los equipos)
 */
export function puntoControl3D(p0, p1, n, off, k = 0, alturaParalela = 0.4, elevacion = 0) {
  const d = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
  const alto = clamp(1.2 + 0.18 * d, 1.5, 8) + elevacion + k * alturaParalela;
  return [
    (p0[0] + p1[0]) / 2 + n[0] * off,
    (p0[1] + p1[1]) / 2 + alto,
    (p0[2] + p1[2]) / 2 + n[1] * off,
  ];
}

/** Puntos de anclaje en el borde de un nodo 3D: radio r desde el centro hacia el otro extremo */
export function anclaHacia(centro, otro, radio, alturaAncla) {
  const dx = otro[0] - centro[0];
  const dz = otro[2] - centro[2];
  const l = Math.hypot(dx, dz) || 1;
  return [centro[0] + (dx / l) * radio, alturaAncla, centro[2] + (dz / l) * radio];
}

// ── 2D ───────────────────────────────────────────────────────────────────────

const DIRECCION_PUERTO = { N: [0, -1], S: [0, 1], E: [1, 0], O: [-1, 0] };

/** Elige los puertos por el eje dominante del vector entre centros */
export function elegirPuertos(centroA, centroB) {
  const dx = centroB[0] - centroA[0];
  const dy = centroB[1] - centroA[1];
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['E', 'O'] : ['O', 'E'];
  return dy >= 0 ? ['S', 'N'] : ['N', 'S'];
}

/** Coordenadas del puerto de una tarjeta (posición = esquina superior izquierda) */
export function puntoPuerto(pos, puerto, ancho, alto) {
  const cx = pos.x + ancho / 2;
  const cy = pos.y + alto / 2;
  switch (puerto) {
    case 'N': return [cx, pos.y];
    case 'S': return [cx, pos.y + alto];
    case 'E': return [pos.x + ancho, cy];
    default: return [pos.x, cy];
  }
}

/**
 * Trazado Bézier cúbico entre dos tarjetas.
 * @returns {{p0:number[], c1:number[], c2:number[], p1:number[], medio:number[], puertos:string[]}}
 */
export function trazado2D(posA, posB, idA, idB, off, ancho, alto) {
  const ca = [posA.x + ancho / 2, posA.y + alto / 2];
  const cb = [posB.x + ancho / 2, posB.y + alto / 2];
  const [pa, pb] = elegirPuertos(ca, cb);
  const n = normalCanonica(ca, cb, idA, idB);
  let p0 = puntoPuerto(posA, pa, ancho, alto);
  let p1 = puntoPuerto(posB, pb, ancho, alto);
  // Los extremos se separan la mitad del desplazamiento a lo largo del lado del puerto
  const desliz = (p, puerto) => {
    const [ux, uy] = DIRECCION_PUERTO[puerto];
    const tx = uy !== 0 ? 1 : 0; // lado horizontal (N/S) se desliza en x
    const ty = ux !== 0 ? 1 : 0;
    const medio = off / 2;
    const limX = ancho / 2 - 16;
    const limY = alto / 2 - 12;
    return [p[0] + tx * clamp(n[0] * medio, -limX, limX), p[1] + ty * clamp(n[1] * medio, -limY, limY)];
  };
  if (off) { p0 = desliz(p0, pa); p1 = desliz(p1, pb); }
  const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const largo = Math.max(60, d * 0.4);
  const [ax, ay] = DIRECCION_PUERTO[pa];
  const [bx, by] = DIRECCION_PUERTO[pb];
  const c1 = [p0[0] + ax * largo + n[0] * off, p0[1] + ay * largo + n[1] * off];
  const c2 = [p1[0] + bx * largo + n[0] * off, p1[1] + by * largo + n[1] * off];
  return { p0, c1, c2, p1, medio: puntoCubica(p0, c1, c2, p1, 0.5), puertos: [pa, pb] };
}

export function puntoCubica(p0, c1, c2, p1, t) {
  const u = 1 - t;
  const a = u * u * u; const b = 3 * u * u * t; const c = 3 * u * t * t; const d = t * t * t;
  return [a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]];
}

/** Atributo d de un path cúbico */
export function caminoSvg({ p0, c1, c2, p1 }) {
  const f = (v) => Math.round(v * 10) / 10;
  return `M${f(p0[0])},${f(p0[1])} C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p1[0])},${f(p1[1])}`;
}

/** Línea guía desde un puerto hasta el cursor */
export function caminoGuia(origen, puerto, destino) {
  const [ux, uy] = DIRECCION_PUERTO[puerto] || [1, 0];
  const d = Math.hypot(destino[0] - origen[0], destino[1] - origen[1]);
  const largo = Math.max(40, d * 0.4);
  return caminoSvg({ p0: origen, c1: [origen[0] + ux * largo, origen[1] + uy * largo], c2: destino, p1: destino });
}

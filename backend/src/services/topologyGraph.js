/**
 * topologyGraph.js — Lógica PURA del grafo de dependencias (sin BD ni Express).
 *
 * Semántica de una arista (dependencia):  source ──depende de──▶ target
 *   - source = servidor dependiente (cliente)
 *   - target = servidor proveedor del que necesita para funcionar
 *
 * Si un proveedor cae, se ven afectados sus dependientes: el impacto se propaga
 * en sentido INVERSO a la flecha (target -> source).
 *
 * Todos los IDs se manejan como string (los BIGINT de PostgreSQL llegan como
 * string desde `pg`, y así no se pierde precisión). Todos los recorridos usan
 * conjuntos de visitados: los ciclos (1 <-> 2) nunca provocan bucles infinitos.
 */

/** Estados de impacto en cascada de un nodo */
export const CASCADE_STATUS = Object.freeze({
  DIRECT: 'DIRECT_IMPACT',
  TRANSITIVE: 'TRANSITIVE_IMPACT',
  NONE: 'NONE',
});

/** Límites de la búsqueda de ciclos (evita explosión combinatoria en grafos densos) */
export const CYCLE_LIMITS = Object.freeze({ maxCycles: 50, maxSteps: 20000 });

const id = (v) => String(v);

/**
 * Construye listas de adyacencia sin duplicados (dos dependencias de distinto
 * tipo entre el mismo par cuentan como un único vecino para los recorridos).
 *
 * @param {Array<{source: string|number|bigint, target: string|number|bigint}>} edges
 * @returns {{ out: Map<string, string[]>, in: Map<string, string[]> }}
 *   out: servidor -> proveedores de los que depende; in: servidor -> sus dependientes
 */
export function buildAdjacency(edges) {
  const outSets = new Map();
  const inSets = new Map();
  const add = (map, k, v) => {
    if (!map.has(k)) map.set(k, new Set());
    map.get(k).add(v);
  };
  for (const e of edges || []) {
    const s = id(e.source);
    const t = id(e.target);
    if (s === t) continue; // la BD ya lo impide; aquí solo por robustez
    add(outSets, s, t);
    add(inSets, t, s);
  }
  const toLists = (m) => new Map([...m].map(([k, set]) => [k, [...set]]));
  return { out: toLists(outSets), in: toLists(inSets) };
}

/**
 * BFS desde `startId` siguiendo `adjacency` (Map id -> vecinos), SIN materializar
 * rutas: O(V + E). Devuelve el árbol BFS (predecesor y profundidad mínima de cada
 * nodo alcanzado) y el orden de visita (order[0] = startId).
 *
 * @param {string|number|bigint} startId
 * @param {Map<string, string[]>} adjacency
 * @returns {{ order: string[], parent: Map<string, string|null>, depth: Map<string, number> }}
 */
export function bfsTree(startId, adjacency) {
  const start = id(startId);
  const parent = new Map([[start, null]]); // también hace de conjunto "visitados"
  const depth = new Map([[start, 0]]);
  const order = [start];
  for (let i = 0; i < order.length; i++) {
    const current = order[i];
    for (const next of adjacency.get(current) || []) {
      if (parent.has(next)) continue;
      parent.set(next, current);
      depth.set(next, depth.get(current) + 1);
      order.push(next);
    }
  }
  return { order, parent, depth };
}

/** Ruta [raíz, ..., nodo] reconstruida desde el mapa de predecesores de un árbol BFS */
export function pathFromParents(parent, node) {
  const path = [];
  for (let n = id(node); n !== null && n !== undefined; n = parent.get(n)) path.push(n);
  return path.reverse();
}

/**
 * BFS desde `startId` con la ruta más corta [startId, ..., nodo] de cada nodo
 * alcanzado (sin incluir el inicial). Construir todas las rutas cuesta O(V·D):
 * úsese para UN origen (análisis de un servidor), no dentro de un bucle de raíces.
 *
 * @returns {Map<string, { depth: number, path: string[] }>}
 */
export function bfsFrom(startId, adjacency) {
  const { order, parent, depth } = bfsTree(startId, adjacency);
  const result = new Map();
  for (let i = 1; i < order.length; i++) {
    const node = order[i];
    result.set(node, { depth: depth.get(node), path: pathFromParents(parent, node) });
  }
  return result;
}

/**
 * Proveedores de los que depende `serverId` (directos y transitivos).
 * @returns {Array<{ id: string, depth: number, path: string[] }>} ordenado por profundidad
 */
export function dependsOnClosure(serverId, adjacency) {
  return toSortedList(bfsFrom(serverId, adjacency.out));
}

/**
 * Servidores que dependen de `serverId` (directos y transitivos): los que se
 * verían afectados si `serverId` falla.
 * @returns {Array<{ id: string, depth: number, path: string[] }>} ordenado por profundidad
 */
export function dependentsClosure(serverId, adjacency) {
  return toSortedList(bfsFrom(serverId, adjacency.in));
}

function toSortedList(map) {
  return [...map].map(([nodeId, v]) => ({ id: nodeId, depth: v.depth, path: v.path }))
    .sort((a, b) => a.depth - b.depth || compareIds(a.id, b.id));
}

/** Compara IDs numéricos en string sin perder precisión (BIGINT) */
export function compareIds(a, b) {
  const sa = id(a);
  const sb = id(b);
  if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
    return sa.length - sb.length || (sa < sb ? -1 : sa > sb ? 1 : 0);
  }
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/**
 * Impacto en cascada (BFS inverso con conjunto de visitados).
 *
 * Para cada servidor raíz caído (DOWN/DEGRADED en monitoreo o simulado) recorre
 * target -> source. Un nodo alcanzado a distancia 1 de alguna raíz es
 * DIRECT_IMPACT; a distancia >= 2 (y nunca a 1) es TRANSITIVE_IMPACT.
 *
 * - `impactedByServers`: todas las raíces caídas que lo afectan (ordenadas).
 * - `impactPath`: ruta más corta de propagación [raíz, ..., nodo] (en empate,
 *   la raíz de menor ID).
 * - Una raíz NO se marca como impactada por sí misma (el ciclo 1 <-> 2 no la
 *   "re-visita"), pero sí por OTRA raíz de la que depende.
 *
 * Complejidad: un BFS sin rutas por raíz, O(R * (V + E)) con R = número de
 * raíces; al final se reconstruye UNA ruta por nodo afectado desde el mapa de
 * predecesores de su raíz ganadora (coste proporcional al tamaño de la salida).
 *
 * @param {{ edges?: Array<{source, target}>, rootIds: Iterable<string|number|bigint>, adjacency?: object }} params
 * @returns {Map<string, { cascadeStatus: string, impactLevel: number, impactedByServers: string[], impactPath: string[] }>}
 *   Solo contiene los nodos afectados (los demás son NONE).
 */
export function computeCascadeImpact({ edges, rootIds, adjacency }) {
  const adj = adjacency || buildAdjacency(edges);
  const roots = [...new Set([...(rootIds || [])].map(id))].sort(compareIds);
  const impact = new Map();
  const ganadora = new Map(); // nodo -> raíz que da su ruta más corta
  const arboles = new Map(); // raíz -> mapa de predecesores (solo raíces ganadoras)

  for (const root of roots) {
    const { order, parent, depth } = bfsTree(root, adj.in);
    let gana = false;
    for (let i = 1; i < order.length; i++) {
      const nodeId = order[i];
      const d = depth.get(nodeId);
      const prev = impact.get(nodeId);
      if (!prev) {
        impact.set(nodeId, { impactLevel: d, impactedByServers: [root], impactPath: null });
        ganadora.set(nodeId, root);
        gana = true;
        continue;
      }
      prev.impactedByServers.push(root);
      // Raíces en orden ascendente: en empate de profundidad se queda la de menor id
      if (d < prev.impactLevel) {
        prev.impactLevel = d;
        ganadora.set(nodeId, root);
        gana = true;
      }
    }
    if (gana) arboles.set(root, parent);
  }

  for (const [nodeId, entry] of impact) {
    entry.impactPath = pathFromParents(arboles.get(ganadora.get(nodeId)), nodeId);
    entry.cascadeStatus = entry.impactLevel === 1 ? CASCADE_STATUS.DIRECT : CASCADE_STATUS.TRANSITIVE;
  }
  return impact;
}

// ─────────────────────────────────────────────
//  Alojamiento (VM → host) y aplicaciones
// ─────────────────────────────────────────────

/** Clave de comparación de nombres de equipo: solo letras y dígitos, en mayúsculas */
export function claveEquipo(texto) {
  return String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Relaciones implícitas de alojamiento: cada servidor virtual depende del servidor
 * no virtual cuyo nombre (o hostname) coincide con su host (`rack_norm`), comparando
 * solo letras y dígitos sin distinguir mayúsculas. Si varios coinciden se usa el de
 * menor id. Los nombres que no coinciden con ningún equipo no generan relación.
 *
 * @param {Array<{id, type, nombre?, hostname?, rack_norm?}>} servidores
 * @returns {Array<{ source: string, target: string }>} source = VM, target = host
 */
export function aristasDeAlojamiento(servidores) {
  const hosts = new Map();
  const ordenados = [...(servidores || [])].filter((s) => s.type !== 'virtuales').sort((a, b) => compareIds(a.id, b.id));
  for (const s of ordenados) {
    for (const nombre of [s.nombre, s.hostname]) {
      const k = claveEquipo(nombre);
      if (k && !hosts.has(k)) hosts.set(k, id(s.id));
    }
  }
  const aristas = [];
  for (const s of servidores || []) {
    if (s.type !== 'virtuales') continue;
    const host = hosts.get(claveEquipo(s.rack_norm));
    if (host && host !== id(s.id)) aristas.push({ source: id(s.id), target: host });
  }
  return aristas;
}

/** Valores del campo Software que no nombran una aplicación */
const SIN_APLICACION = new Set(['', 'NA', 'N/A', 'N.A', 'N.A.', '-', '--', 'NINGUNO', 'NINGUNA', 'NO', 'NO APLICA', 'S/N', 'SN']);

/**
 * Nombre de aplicación a partir del campo Software (texto libre del inventario):
 * espacios normalizados; null si está vacío o es un "N/A".
 */
export function nombreAplicacion(software) {
  const nombre = String(software ?? '').replace(/\s+/g, ' ').trim();
  return SIN_APLICACION.has(nombre.toUpperCase()) ? null : nombre;
}

/**
 * Aplicaciones afectadas: agrupa los servidores afectados por su aplicación
 * (campo Software), sin distinguir mayúsculas. Se muestra la forma escrita más
 * frecuente (en empate, la primera en orden alfabético).
 *
 * @param {Array<{ id, name, software, motivo }>} servidores afectados (motivo: CAIDO_REAL|SIMULADO|DIRECTO|CASCADA)
 * @returns {Array<{ name: string, servers: Array<{ id, name, motivo }> }>} más servidores primero
 */
export function agruparAplicaciones(servidores) {
  const grupos = new Map();
  for (const s of servidores || []) {
    const nombre = nombreAplicacion(s.software);
    if (!nombre) continue;
    const clave = nombre.toUpperCase();
    if (!grupos.has(clave)) grupos.set(clave, { formas: new Map(), servers: [] });
    const g = grupos.get(clave);
    g.formas.set(nombre, (g.formas.get(nombre) || 0) + 1);
    g.servers.push({ id: id(s.id), name: s.name, motivo: s.motivo });
  }
  const porNombre = (a, b) => String(a).localeCompare(String(b), 'es');
  return [...grupos.values()]
    .map((g) => ({
      name: [...g.formas].sort((a, b) => b[1] - a[1] || porNombre(a[0], b[0]))[0][0],
      servers: g.servers.sort((a, b) => porNombre(a.name, b.name)),
    }))
    .sort((a, b) => b.servers.length - a.servers.length || porNombre(a.name, b.name));
}

/**
 * Marca `isBidirectionalPair` en cada arista: true si existe también la arista
 * inversa (B -> A) de cualquier tipo. Devuelve copias (no muta la entrada).
 */
export function markBidirectionalPairs(edges) {
  const pairs = new Set((edges || []).map((e) => `${id(e.source)}>${id(e.target)}`));
  return (edges || []).map((e) => ({
    ...e,
    isBidirectionalPair: pairs.has(`${id(e.target)}>${id(e.source)}`),
  }));
}

/** true si existen A -> B y B -> A (de cualquier tipo) */
export function isBidirectionalPair(edges, a, b) {
  const sa = id(a);
  const sb = id(b);
  let ab = false;
  let ba = false;
  for (const e of edges || []) {
    const s = id(e.source);
    const t = id(e.target);
    if (s === sa && t === sb) ab = true;
    else if (s === sb && t === sa) ba = true;
    if (ab && ba) return true;
  }
  return false;
}

/**
 * Ciclos elementales que pasan por `serverId`, como listas cerradas
 * [serverId, ..., serverId] (ej. ['1', '2', '1']). Se siguen las flechas
 * source -> target.
 *
 * La DFS se restringe a la componente fuertemente conexa del nodo (nodos que
 * son a la vez alcanzables desde él y que pueden volver a él), usa la ruta
 * actual como conjunto de visitados y está acotada por `maxCycles`/`maxSteps`,
 * así que siempre termina rápido aunque el grafo sea denso.
 *
 * @returns {{ cycles: string[][], truncated: boolean }}
 */
export function findCyclesThrough(serverId, adjacency, limits = CYCLE_LIMITS) {
  const start = id(serverId);
  const { maxCycles, maxSteps } = { ...CYCLE_LIMITS, ...limits };
  const forward = bfsTree(start, adjacency.out).parent;
  const backward = bfsTree(start, adjacency.in).parent;
  const scc = new Set([start]);
  for (const k of forward.keys()) if (backward.has(k)) scc.add(k);

  const cycles = [];
  if (scc.size < 2) return { cycles, truncated: false };

  let steps = 0;
  let truncated = false;
  const path = [start];
  const onPath = new Set([start]);
  // Pila explícita (sin recursión): cada marco guarda sus vecinos y el índice siguiente
  const neighbors = (n) => (adjacency.out.get(n) || []).filter((m) => scc.has(m)).sort(compareIds);
  const stack = [{ next: neighbors(start), i: 0 }];

  while (stack.length) {
    const frame = stack[stack.length - 1];
    if (frame.i >= frame.next.length) {
      stack.pop();
      onPath.delete(path.pop());
      continue;
    }
    if (++steps > maxSteps || cycles.length >= maxCycles) { truncated = true; break; }
    const nxt = frame.next[frame.i++];
    if (nxt === start) {
      cycles.push([...path, start]);
    } else if (!onPath.has(nxt)) {
      path.push(nxt);
      onPath.add(nxt);
      stack.push({ next: neighbors(nxt), i: 0 });
    }
  }
  return { cycles, truncated };
}

/**
 * Análisis de impacto de un servidor (puro).
 * `*Transitive` = los alcanzados a profundidad >= 2 (los directos van aparte).
 *
 * @returns {{
 *   dependsOnDirect: string[], dependsOnTransitive: Array<{id, depth, path}>,
 *   dependentsDirect: string[], dependentsTransitive: Array<{id, depth, path}>,
 *   totalAffected: number, cycles: string[][], cyclesTruncated: boolean
 * }}
 */
export function analyzeServer(serverId, edges, implicitEdges = []) {
  const adj = buildAdjacency([...(edges || []), ...implicitEdges]);
  const up = dependsOnClosure(serverId, adj);
  const down = dependentsClosure(serverId, adj);
  const { cycles, truncated } = findCyclesThrough(serverId, adj);
  return {
    dependsOnDirect: up.filter((n) => n.depth === 1).map((n) => n.id),
    dependsOnTransitive: up.filter((n) => n.depth > 1),
    dependentsDirect: down.filter((n) => n.depth === 1).map((n) => n.id),
    dependentsTransitive: down.filter((n) => n.depth > 1),
    // Total de servidores que caerían (directos + en cascada) si este falla
    totalAffected: down.length,
    cycles,
    cyclesTruncated: truncated,
  };
}

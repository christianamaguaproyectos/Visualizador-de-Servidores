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
 * BFS desde `startId` siguiendo `adjacency` (Map id -> vecinos).
 * Devuelve, para cada nodo alcanzado (sin incluir el inicial), su profundidad
 * mínima y la ruta más corta [startId, ..., nodo].
 *
 * @param {string|number|bigint} startId
 * @param {Map<string, string[]>} adjacency
 * @returns {Map<string, { depth: number, path: string[] }>}
 */
export function bfsFrom(startId, adjacency) {
  const start = id(startId);
  const result = new Map();
  const parent = new Map([[start, null]]); // también hace de conjunto "visitados"
  const depth = new Map([[start, 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const next of adjacency.get(current) || []) {
      if (parent.has(next)) continue;
      parent.set(next, current);
      depth.set(next, depth.get(current) + 1);
      queue.push(next);
    }
  }
  for (const node of queue) {
    if (node === start) continue;
    const path = [];
    for (let n = node; n !== null; n = parent.get(n)) path.push(n);
    result.set(node, { depth: depth.get(node), path: path.reverse() });
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
 * Complejidad O(R * (V + E)), con R = número de raíces.
 *
 * @param {{ edges?: Array<{source, target}>, rootIds: Iterable<string|number|bigint>, adjacency?: object }} params
 * @returns {Map<string, { cascadeStatus: string, impactLevel: number, impactedByServers: string[], impactPath: string[] }>}
 *   Solo contiene los nodos afectados (los demás son NONE).
 */
export function computeCascadeImpact({ edges, rootIds, adjacency }) {
  const adj = adjacency || buildAdjacency(edges);
  const roots = [...new Set([...(rootIds || [])].map(id))].sort(compareIds);
  const impact = new Map();

  for (const root of roots) {
    for (const [nodeId, { depth, path }] of bfsFrom(root, adj.in)) {
      const prev = impact.get(nodeId);
      if (!prev) {
        impact.set(nodeId, { impactLevel: depth, impactedByServers: [root], impactPath: path });
        continue;
      }
      prev.impactedByServers.push(root);
      if (depth < prev.impactLevel) {
        prev.impactLevel = depth;
        prev.impactPath = path;
      }
    }
  }

  for (const entry of impact.values()) {
    entry.cascadeStatus = entry.impactLevel === 1 ? CASCADE_STATUS.DIRECT : CASCADE_STATUS.TRANSITIVE;
  }
  return impact;
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
  const forward = bfsFrom(start, adjacency.out);
  const backward = bfsFrom(start, adjacency.in);
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
export function analyzeServer(serverId, edges) {
  const adj = buildAdjacency(edges);
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

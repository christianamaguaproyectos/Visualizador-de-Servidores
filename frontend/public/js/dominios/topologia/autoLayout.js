/**
 * Auto-ordenación del mapa. Funciones PURAS: reciben nodos y aristas y devuelven
 * { [id]: {x, y} } en px del lienzo 2D (esquina superior izquierda de la tarjeta).
 *
 * capas(): condensa las componentes fuertemente conexas (Tarjan iterativo) para que
 * los ciclos (1 ↔ 2) formen un bloque; nivel 0 = proveedores puros (no dependen de
 * nadie); el nivel de cada componente es su camino más largo hasta un sumidero.
 */
import { compararIds } from './geometriaAristas.js';

const SEP_NIVEL = 150;
const SEP_X = 280;
const RADIO_ANILLO = 320;

/** Tarjan iterativo. Devuelve las SCC en orden topológico inverso (sumideros primero) */
export function componentesFuertes(ids, sucesores) {
  let indice = 0;
  const idx = new Map();
  const low = new Map();
  const enPila = new Set();
  const pila = [];
  const sccs = [];
  for (const raiz of ids) {
    if (idx.has(raiz)) continue;
    const llamada = [{ v: raiz, i: 0 }];
    idx.set(raiz, indice); low.set(raiz, indice); indice++;
    pila.push(raiz); enPila.add(raiz);
    while (llamada.length) {
      const marco = llamada[llamada.length - 1];
      const vecinos = sucesores.get(marco.v) || [];
      if (marco.i < vecinos.length) {
        const w = vecinos[marco.i++];
        if (!idx.has(w)) {
          idx.set(w, indice); low.set(w, indice); indice++;
          pila.push(w); enPila.add(w);
          llamada.push({ v: w, i: 0 });
        } else if (enPila.has(w)) {
          low.set(marco.v, Math.min(low.get(marco.v), idx.get(w)));
        }
        continue;
      }
      llamada.pop();
      if (llamada.length) {
        const padre = llamada[llamada.length - 1].v;
        low.set(padre, Math.min(low.get(padre), low.get(marco.v)));
      }
      if (low.get(marco.v) === idx.get(marco.v)) {
        const comp = [];
        let w;
        do { w = pila.pop(); enPila.delete(w); comp.push(w); } while (w !== marco.v);
        sccs.push(comp.sort(compararIds));
      }
    }
  }
  return sccs;
}

/** Niveles por componente: 0 = sumidero; nivel = 1 + máximo de sus dependencias */
export function calcularNiveles(nodos, aristas) {
  const ids = nodos.map((n) => String(n.id)).sort(compararIds);
  const presentes = new Set(ids);
  const suc = new Map(ids.map((i) => [i, []]));
  for (const e of aristas) {
    const s = String(e.source); const t = String(e.target);
    if (s === t || !presentes.has(s) || !presentes.has(t)) continue;
    if (!suc.get(s).includes(t)) suc.get(s).push(t);
  }
  for (const l of suc.values()) l.sort(compararIds);
  const sccs = componentesFuertes(ids, suc);
  const compDe = new Map();
  sccs.forEach((c, i) => c.forEach((v) => compDe.set(v, i)));
  const nivelComp = new Array(sccs.length).fill(0);
  const sucComp = sccs.map(() => new Set());
  sccs.forEach((c, i) => {
    for (const v of c) for (const w of suc.get(v)) if (compDe.get(w) !== i) sucComp[i].add(compDe.get(w));
    let max = -1;
    for (const j of sucComp[i]) max = Math.max(max, nivelComp[j]); // j ya calculado (orden inverso)
    nivelComp[i] = max + 1;
  });
  return { sccs, compDe, nivelComp, sucComp, suc };
}

function ordenarPorNiveles(nodos, aristas) {
  const { sccs, nivelComp, sucComp } = calcularNiveles(nodos, aristas);
  const predComp = sccs.map(() => new Set());
  sucComp.forEach((s, i) => s.forEach((j) => predComp[j].add(i)));
  const maxNivel = Math.max(0, ...nivelComp);
  const niveles = Array.from({ length: maxNivel + 1 }, () => []);
  sccs.forEach((c, i) => niveles[nivelComp[i]].push(i));
  // Orden inicial estable por el primer ID de la componente
  for (const l of niveles) l.sort((a, b) => compararIds(sccs[a][0], sccs[b][0]));
  const posicion = new Map();
  const fijar = () => niveles.forEach((l) => l.forEach((c, i) => posicion.set(c, i)));
  fijar();
  const baricentro = (c, vecinos) => {
    const v = [...vecinos].map((j) => posicion.get(j));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : posicion.get(c);
  };
  for (let pasada = 0; pasada < 2; pasada++) {
    for (let n = 1; n <= maxNivel; n++) { // hacia abajo: según proveedores
      niveles[n].sort((a, b) => baricentro(a, sucComp[a]) - baricentro(b, sucComp[b]));
      fijar();
    }
    for (let n = maxNivel - 1; n >= 0; n--) { // hacia arriba: según dependientes
      niveles[n].sort((a, b) => baricentro(a, predComp[a]) - baricentro(b, predComp[b]));
      fijar();
    }
  }
  // Expande componentes: sus miembros quedan contiguos
  return niveles.map((l) => l.flatMap((c) => sccs[c]));
}

/** Disposición por capas (arriba = infraestructura, abajo = aplicaciones) */
export function capas(nodos, aristas) {
  const filas = ordenarPorNiveles(nodos, aristas);
  const res = {};
  filas.forEach((fila, nivel) => {
    const inicio = -((fila.length - 1) * SEP_X) / 2;
    fila.forEach((id, i) => { res[id] = { x: Math.round(inicio + i * SEP_X), y: nivel * SEP_NIVEL }; });
  });
  return res;
}

/** Disposición en anillos concéntricos (nivel 0 al centro) */
export function anillos(nodos, aristas) {
  const filas = ordenarPorNiveles(nodos, aristas);
  const res = {};
  let radioPrevio = -Infinity;
  filas.forEach((fila, nivel) => {
    const n = fila.length;
    let radio = n > 1 ? Math.max(nivel * RADIO_ANILLO, (n * 260) / (2 * Math.PI), 160) : nivel * RADIO_ANILLO;
    if (radio < radioPrevio + 220) radio = n > 1 || nivel > 0 ? radioPrevio + 220 : radio;
    radioPrevio = radio;
    fila.forEach((id, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      res[id] = { x: Math.round(Math.cos(ang) * radio - 110), y: Math.round(Math.sin(ang) * radio - 48) };
    });
  });
  return res;
}

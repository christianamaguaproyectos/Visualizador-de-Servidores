// Lógica pura del mapa de dependencias del frontend (sin DOM ni three.js):
// auto-ordenación por capas/anillos y geometría de aristas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  capas, anillos, calcularNiveles, componentesFuertes,
} from '../../frontend/public/js/dominios/topologia/autoLayout.js';
import {
  compararIds, indicesParalelas, desplazamientoLateral, normalCanonica, elegirPuertos, trazado2D, caminoSvg, puntoCubica,
} from '../../frontend/public/js/dominios/topologia/geometriaAristas.js';
import { reescribirEspecificadorThree, VENDOR_THREE_LISTA } from '../../backend/src/routes/vendorThreeRoutes.js';

const nodos = (...ids) => ids.map((id) => ({ id: String(id) }));
const arista = (id, source, target, extra = {}) => ({ id: String(id), source: String(source), target: String(target), dependencyType: 'API', ...extra });

test('compararIds ordena IDs numéricos como números (sin perder precisión)', () => {
  assert.deepEqual(['10', '9', '100', '2'].sort(compararIds), ['2', '9', '10', '100']);
  assert.ok(compararIds('9007199254740993', '9007199254740992') > 0);
});

test('capas: los proveedores puros quedan en el nivel 0 y los dependientes debajo', () => {
  // 1 -> 2 -> 3  (1 depende de 2, 2 depende de 3)
  const pos = capas(nodos(1, 2, 3), [arista('a', 1, 2), arista('b', 2, 3)]);
  assert.equal(pos['3'].y, 0);
  assert.ok(pos['2'].y > pos['3'].y);
  assert.ok(pos['1'].y > pos['2'].y);
});

test('capas: un ciclo 1 <-> 2 forma un bloque en el mismo nivel y no rompe el cálculo', () => {
  const aristas = [arista('a', 1, 2), arista('b', 2, 1), arista('c', 2, 3)];
  const pos = capas(nodos(1, 2, 3), aristas);
  assert.equal(pos['1'].y, pos['2'].y, 'los miembros del ciclo comparten nivel');
  assert.ok(pos['1'].y > pos['3'].y, 'el ciclo depende de 3');
  assert.notEqual(pos['1'].x, pos['2'].x, 'no se superponen');
  const { sccs } = calcularNiveles(nodos(1, 2, 3), aristas);
  assert.ok(sccs.some((c) => c.length === 2 && c.includes('1') && c.includes('2')));
});

test('capas: determinista, ignora aristas a nodos ausentes y bucles', () => {
  const ns = nodos(5, 1, 3, 2);
  const as = [arista('a', 1, 2), arista('b', 3, 2), arista('c', 5, 99), arista('d', 1, 1)];
  assert.deepEqual(capas(ns, as), capas([...ns].reverse(), [...as].reverse()));
  const pos = capas(ns, as);
  assert.equal(Object.keys(pos).length, 4);
  const claves = new Set(Object.values(pos).map((p) => `${p.x},${p.y}`));
  assert.equal(claves.size, 4, 'ningún par de nodos en la misma posición');
});

test('anillos: nivel 0 cerca del centro y un nodo por posición', () => {
  const pos = anillos(nodos(1, 2, 3, 4), [arista('a', 1, 4), arista('b', 2, 4), arista('c', 3, 4)]);
  const radio = (p) => Math.hypot(p.x + 110, p.y + 48);
  assert.ok(radio(pos['4']) < radio(pos['1']));
  assert.equal(new Set(Object.values(pos).map((p) => `${p.x},${p.y}`)).size, 4);
});

test('componentesFuertes (Tarjan iterativo) soporta cadenas largas sin desbordar la pila', () => {
  const n = 5000;
  const ids = Array.from({ length: n }, (_, i) => String(i + 1));
  const suc = new Map(ids.map((id, i) => [id, i + 1 < n ? [ids[i + 1]] : []]));
  const sccs = componentesFuertes(ids, suc);
  assert.equal(sccs.length, n);
});

test('indicesParalelas numera las aristas del mismo sentido por tipo', () => {
  const k = indicesParalelas([
    arista('x', 1, 2, { dependencyType: 'DATABASE' }),
    arista('y', 1, 2, { dependencyType: 'API' }),
    arista('z', 2, 1, { dependencyType: 'API' }),
  ]);
  assert.deepEqual([k.get('y'), k.get('x')], [0, 1]);
  assert.equal(k.get('z'), 0);
});

test('par bidireccional: las dos curvas quedan en lados opuestos', () => {
  const medidas = { base: 28, paso: 18 };
  const ida = desplazamientoLateral(arista('a', 1, 2, { isBidirectionalPair: true }), 0, medidas);
  const vuelta = desplazamientoLateral(arista('b', 2, 1, { isBidirectionalPair: true }), 0, medidas);
  assert.ok(ida !== 0 && vuelta !== 0);
  assert.equal(Math.sign(ida), -Math.sign(vuelta));
  assert.equal(desplazamientoLateral(arista('c', 1, 3), 0, medidas), 0, 'una arista simple va recta');
  // La normal canónica no depende del orden de los extremos
  assert.deepEqual(normalCanonica([0, 0], [10, 0], '1', '2'), normalCanonica([10, 0], [0, 0], '2', '1'));
});

test('trazado2D: Bézier entre puertos de las tarjetas y camino SVG válido', () => {
  assert.deepEqual(elegirPuertos([0, 0], [500, 0]), ['E', 'O']);
  assert.deepEqual(elegirPuertos([0, 0], [-500, 0]), ['O', 'E']);
  assert.deepEqual(elegirPuertos([0, 0], [0, 500]), ['S', 'N']);
  const t = trazado2D({ x: 0, y: 0 }, { x: 500, y: 300 }, '1', '2', 0, 220, 96);
  for (const p of [t.p0, t.c1, t.c2, t.p1]) assert.ok(p.every(Number.isFinite));
  assert.match(caminoSvg(t), /^M\s*-?[\d.]+[ ,]-?[\d.]+\s*C/);
  assert.deepEqual(puntoCubica(t.p0, t.c1, t.c2, t.p1, 0).map(Math.round), t.p0.map(Math.round));
  assert.deepEqual(puntoCubica(t.p0, t.c1, t.c2, t.p1, 1).map(Math.round), t.p1.map(Math.round));
});

test('vendor three: reescribe el especificador desnudo y la lista es cerrada', () => {
  const entrada = "import { A } from 'three';\nimport * as T from \"three\";\nconst m = import('three');\nimport 'three';";
  const salida = reescribirEspecificadorThree(entrada);
  assert.doesNotMatch(salida, /['"]three['"]/);
  assert.equal((salida.match(/\/vendor\/three\/three\.module\.js/g) || []).length, 4);
  assert.equal(reescribirEspecificadorThree("from 'three/addons/x.js'"), "from 'three/addons/x.js'");
  assert.deepEqual(Object.keys(VENDOR_THREE_LISTA).sort(), [
    '/addons/controls/OrbitControls.js', '/addons/renderers/CSS2DRenderer.js', '/three.module.js',
  ]);
});

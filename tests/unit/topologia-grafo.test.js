// Lógica pura del grafo de dependencias (backend/src/services/topologyGraph.js) y
// validación de entradas (backend/src/dtos/topologyDto.js). No necesita BD.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeServer, buildAdjacency, CASCADE_STATUS, compareIds, computeCascadeImpact, findCyclesThrough,
  isBidirectionalPair, markBidirectionalPairs,
} from '../../backend/src/services/topologyGraph.js';
import {
  parseBooleanQuery, parseDependencyCreate, parseDependencyUpdate, parseIdList, parsePositionsPayload,
  parseViewCreate, parseViewSelector, slugify, LIMITS,
} from '../../backend/src/dtos/topologyDto.js';

// Ejemplo del plan: 1 <-> 2 (ciclo) y 2 -> 3 (cadena). "A -> B" = A depende de B.
const CICLO_Y_CADENA = [
  { source: '1', target: '2' },
  { source: '2', target: '1' },
  { source: '2', target: '3' },
];

describe('impacto en cascada (BFS inverso)', () => {
  test('si cae 3: 2 es impacto directo y 1 en cascada, sin bucle en el ciclo 1 <-> 2', () => {
    const impacto = computeCascadeImpact({ edges: CICLO_Y_CADENA, rootIds: ['3'] });
    assert.equal(impacto.size, 2);
    assert.equal(impacto.get('2').cascadeStatus, CASCADE_STATUS.DIRECT);
    assert.equal(impacto.get('2').impactLevel, 1);
    assert.deepEqual(impacto.get('2').impactPath, ['3', '2']);
    assert.equal(impacto.get('1').cascadeStatus, CASCADE_STATUS.TRANSITIVE);
    assert.equal(impacto.get('1').impactLevel, 2);
    assert.deepEqual(impacto.get('1').impactPath, ['3', '2', '1']);
    assert.deepEqual(impacto.get('1').impactedByServers, ['3']);
    assert.equal(impacto.has('3'), false, 'la raíz no se marca como impactada por sí misma');
  });

  test('si cae 1: solo 2 (directo); 3 no depende de nadie', () => {
    const impacto = computeCascadeImpact({ edges: CICLO_Y_CADENA, rootIds: [1] });
    assert.deepEqual([...impacto.keys()], ['2']);
    assert.equal(impacto.get('2').cascadeStatus, CASCADE_STATUS.DIRECT);
  });

  test('varias raíces: impactedByServers acumula y gana la ruta más corta', () => {
    // 4 -> 3 (directo de 3) y 4 -> 5 -> 6 (6 lo afecta a distancia 2)
    const edges = [...CICLO_Y_CADENA, { source: '4', target: '3' }, { source: '4', target: '5' }, { source: '5', target: '6' }];
    const impacto = computeCascadeImpact({ edges, rootIds: ['6', '3'] });
    const n4 = impacto.get('4');
    assert.deepEqual(n4.impactedByServers, ['3', '6']);
    assert.equal(n4.cascadeStatus, CASCADE_STATUS.DIRECT);
    assert.deepEqual(n4.impactPath, ['3', '4']);
  });

  test('una raíz que depende de otra raíz sí aparece como impactada', () => {
    const impacto = computeCascadeImpact({ edges: CICLO_Y_CADENA, rootIds: ['2', '3'] });
    assert.equal(impacto.get('2').cascadeStatus, CASCADE_STATUS.DIRECT);
    assert.deepEqual(impacto.get('2').impactedByServers, ['3']);
    assert.equal(impacto.get('1').cascadeStatus, CASCADE_STATUS.DIRECT);
  });

  test('sin raíces o sin aristas no hay impacto', () => {
    assert.equal(computeCascadeImpact({ edges: CICLO_Y_CADENA, rootIds: [] }).size, 0);
    assert.equal(computeCascadeImpact({ edges: [], rootIds: ['1'] }).size, 0);
  });

  test('grafo grande con ciclos termina rápido (anillo de 5000 nodos)', () => {
    const edges = [];
    for (let i = 1; i <= 5000; i++) edges.push({ source: String(i), target: String((i % 5000) + 1) });
    const t0 = Date.now();
    const impacto = computeCascadeImpact({ edges, rootIds: ['1'] });
    assert.equal(impacto.size, 4999);
    assert.equal(impacto.get('5000').impactLevel, 1);
    assert.equal(impacto.get('2').impactLevel, 4999);
    assert.ok(Date.now() - t0 < 2000);
  });
});

describe('análisis de un servidor', () => {
  test('servidor 3: dependiente directo 2 y en cascada 1; sin ciclos', () => {
    const a = analyzeServer('3', CICLO_Y_CADENA);
    assert.deepEqual(a.dependentsDirect, ['2']);
    assert.deepEqual(a.dependentsTransitive.map((n) => [n.id, n.depth]), [['1', 2]]);
    assert.deepEqual(a.dependentsTransitive[0].path, ['3', '2', '1']);
    assert.equal(a.totalAffected, 2);
    assert.deepEqual(a.dependsOnDirect, []);
    assert.deepEqual(a.cycles, []);
  });

  test('servidor 1: depende de 2 (directo) y de 3 (profundidad 2); ciclo [1, 2, 1]', () => {
    const a = analyzeServer('1', CICLO_Y_CADENA);
    assert.deepEqual(a.dependsOnDirect, ['2']);
    assert.deepEqual(a.dependsOnTransitive.map((n) => [n.id, n.depth]), [['3', 2]]);
    assert.deepEqual(a.dependentsDirect, ['2']);
    assert.deepEqual(a.cycles, [['1', '2', '1']]);
    assert.equal(a.cyclesTruncated, false);
  });

  test('aristas de distinto tipo entre el mismo par no duplican vecinos ni ciclos', () => {
    const edges = [...CICLO_Y_CADENA, { source: '1', target: '2', dependencyType: 'AUTH' }];
    const a = analyzeServer('1', edges);
    assert.deepEqual(a.dependsOnDirect, ['2']);
    assert.deepEqual(a.cycles, [['1', '2', '1']]);
  });
});

describe('detección de ciclos', () => {
  test('ciclo largo 1 -> 2 -> 3 -> 1 y ciclo corto 1 <-> 3', () => {
    const adj = buildAdjacency([
      { source: 1, target: 2 }, { source: 2, target: 3 }, { source: 3, target: 1 }, { source: 1, target: 3 },
    ]);
    const { cycles } = findCyclesThrough('1', adj);
    assert.deepEqual(cycles, [['1', '2', '3', '1'], ['1', '3', '1']]);
  });

  test('un nodo fuera de todo ciclo no tiene ciclos', () => {
    assert.deepEqual(findCyclesThrough('3', buildAdjacency(CICLO_Y_CADENA)).cycles, []);
  });

  test('grafo completo denso: la búsqueda se corta por límite y lo indica', () => {
    const edges = [];
    for (let i = 1; i <= 12; i++) for (let j = 1; j <= 12; j++) if (i !== j) edges.push({ source: i, target: j });
    const t0 = Date.now();
    const r = findCyclesThrough('1', buildAdjacency(edges), { maxCycles: 50, maxSteps: 20000 });
    assert.equal(r.truncated, true);
    assert.ok(r.cycles.length <= 50);
    for (const c of r.cycles) {
      assert.equal(c[0], '1');
      assert.equal(c.at(-1), '1');
      assert.equal(new Set(c.slice(0, -1)).size, c.length - 1, 'ciclo elemental');
    }
    assert.ok(Date.now() - t0 < 2000);
  });
});

describe('pares bidireccionales', () => {
  test('marca 1 -> 2 y 2 -> 1, no 2 -> 3', () => {
    const marcadas = markBidirectionalPairs(CICLO_Y_CADENA);
    assert.deepEqual(marcadas.map((e) => e.isBidirectionalPair), [true, true, false]);
    assert.equal(CICLO_Y_CADENA[0].isBidirectionalPair, undefined, 'no muta la entrada');
    assert.equal(isBidirectionalPair(CICLO_Y_CADENA, 1, 2), true);
    assert.equal(isBidirectionalPair(CICLO_Y_CADENA, '2', '3'), false);
  });

  test('compareIds ordena BIGINT como números sin perder precisión', () => {
    assert.deepEqual(['10', '9', '9223372036854775807', '100'].sort(compareIds), ['9', '10', '100', '9223372036854775807']);
  });
});

describe('validación de entradas (topologyDto)', () => {
  test('auto-dependencia -> 400', () => {
    assert.throws(() => parseDependencyCreate({ sourceServerId: 5, targetServerId: '5' }), { statusCode: 400 });
  });

  test('dependencia válida: valores por defecto, enums en mayúsculas y control chars eliminados', () => {
    const d = parseDependencyCreate({ source_server_id: '1', target_server_id: 2, dependencyType: 'database', port: '5432', label: 'BD\u0007 principal\r\n', notes: 'línea 1\nlínea 2\u0000' });
    assert.equal(d.sourceServerId, '1');
    assert.equal(d.targetServerId, '2');
    assert.equal(d.dependencyType, 'DATABASE');
    assert.equal(d.criticality, 'CRITICAL');
    assert.equal(d.port, 5432);
    assert.equal(d.label, 'BD  principal');
    assert.equal(d.notes, 'línea 1\nlínea 2');
    assert.equal(d.bidirectional, false);
  });

  for (const [nombre, cuerpo] of [
    ['tipo desconocido', { dependencyType: 'FOO' }],
    ['criticidad desconocida', { criticality: 'URGENTE' }],
    ['puerto 0', { port: 0 }],
    ['puerto 70000', { port: 70000 }],
    ['puerto decimal', { port: 80.5 }],
    ['label > 120', { label: 'x'.repeat(121) }],
    ['protocolo con espacios', { protocol: 'TCP UDP' }],
    ['id no numérico', { sourceServerId: 'abc' }],
    ['id negativo', { targetServerId: -3 }],
  ]) {
    test(`rechaza ${nombre}`, () => {
      assert.throws(() => parseDependencyCreate({ sourceServerId: 1, targetServerId: 2, ...cuerpo }), { statusCode: 400 });
    });
  }

  test('update parcial vacío -> 400; con campos -> solo esos', () => {
    assert.throws(() => parseDependencyUpdate({}), { statusCode: 400 });
    assert.deepEqual(parseDependencyUpdate({ criticality: 'low', port: null }), { criticality: 'LOW', port: null });
  });

  test('simulateDownIds: lista válida, sin duplicados; basura -> 400', () => {
    assert.deepEqual(parseIdList('3, 1,3', 'simulateDownIds'), ['3', '1']);
    assert.deepEqual(parseIdList(undefined, 'x'), []);
    assert.throws(() => parseIdList('1,abc', 'x'), { statusCode: 400 });
    assert.throws(() => parseIdList('1,0', 'x'), { statusCode: 400 });
    assert.throws(() => parseIdList(Array.from({ length: LIMITS.maxIdList + 1 }, (_, i) => String(i + 1)).join(','), 'x'), { statusCode: 400 });
  });

  test('view: id o slug; otra cosa -> 400', () => {
    assert.deepEqual(parseViewSelector('7'), { id: '7' });
    assert.deepEqual(parseViewSelector('general'), { slug: 'general' });
    assert.equal(parseViewSelector(undefined), null);
    assert.throws(() => parseViewSelector('<script>'), { statusCode: 400 });
  });

  test('includeIsolated booleano', () => {
    assert.equal(parseBooleanQuery('true', 'x', false), true);
    assert.equal(parseBooleanQuery(undefined, 'x', false), false);
    assert.throws(() => parseBooleanQuery('quizas', 'x', false), { statusCode: 400 });
  });

  test('posiciones: máximo 1000, números finitos, último duplicado gana', () => {
    const muchas = Array.from({ length: LIMITS.maxPositions + 1 }, (_, i) => ({ serverId: i + 1, x: 0, y: 0 }));
    assert.throws(() => parsePositionsPayload({ positions: muchas }), { statusCode: 400 });
    assert.throws(() => parsePositionsPayload({ positions: [{ serverId: 1, x: 'NaN', y: 0 }] }), { statusCode: 400 });
    assert.throws(() => parsePositionsPayload({ positions: [{ serverId: 1, x: 1e9, y: 0 }] }), { statusCode: 400 });
    assert.throws(() => parsePositionsPayload({ positions: [] }), { statusCode: 400 });
    assert.throws(() => parsePositionsPayload({ viewport: { zoom: 0 } }), { statusCode: 400 });
    const r = parsePositionsPayload({ positions: [{ serverId: 1, x: 1, y: 2 }, { server_id: '1', x: 3, y: 4, pinned: false }], viewport: { zoom: 1.5 } });
    assert.deepEqual(r.positions, [{ serverId: '1', x: 3, y: 4, pinned: false, collapsed: false }]);
    assert.deepEqual(r.viewport, { zoom: 1.5 });
  });

  test('vista: slug generado desde el nombre y validado', () => {
    assert.equal(slugify('Servicio ERP Núcleo — Producción'), 'servicio-erp-nucleo-produccion');
    assert.equal(parseViewCreate({ name: 'ERP Producción' }).slug, 'erp-produccion');
    assert.throws(() => parseViewCreate({ name: 'X', slug: 'Con Espacios' }), { statusCode: 400 });
    assert.throws(() => parseViewCreate({ name: '' }), { statusCode: 400 });
    assert.throws(() => parseViewCreate({ name: 'x'.repeat(121) }), { statusCode: 400 });
    assert.throws(() => parseViewCreate({ name: 'ok', filterConfig: [] }), { statusCode: 400 });
  });
});

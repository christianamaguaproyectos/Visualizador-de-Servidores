// Lógica pura del grafo de dependencias (backend/src/services/topologyGraph.js) y
// validación de entradas (backend/src/dtos/topologyDto.js). No necesita BD.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeServer, bfsFrom, bfsTree, buildAdjacency, CASCADE_STATUS, compareIds, computeCascadeImpact, findCyclesThrough,
  isBidirectionalPair, markBidirectionalPairs, pathFromParents,
} from '../../backend/src/services/topologyGraph.js';
import {
  cleanText, parseBooleanQuery, parseDependencyCreate, parseDependencyUpdate, parseIdList, parsePositionsPayload,
  parseViewCreate, parseViewSelector, slugify, LIMITS,
} from '../../backend/src/dtos/topologyDto.js';
import { SEPARADORES_IP } from '../../backend/src/services/topologyService.js';

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

describe('impacto en cascada: rendimiento y equivalencia (BFS sin materializar rutas)', () => {
  // Implementación de referencia: un BFS con TODAS las rutas por raíz
  function impactoDeReferencia(edges, rootIds) {
    const adj = buildAdjacency(edges);
    const roots = [...new Set(rootIds.map(String))].sort(compareIds);
    const impacto = new Map();
    for (const root of roots) {
      for (const [n, { depth, path }] of bfsFrom(root, adj.in)) {
        const prev = impacto.get(n);
        if (!prev) { impacto.set(n, { impactLevel: depth, impactedByServers: [root], impactPath: path }); continue; }
        prev.impactedByServers.push(root);
        if (depth < prev.impactLevel) { prev.impactLevel = depth; prev.impactPath = path; }
      }
    }
    return impacto;
  }

  test('bfsTree + pathFromParents reconstruyen la ruta más corta', () => {
    const adj = buildAdjacency(CICLO_Y_CADENA);
    const { order, parent, depth } = bfsTree('3', adj.in);
    assert.deepEqual(order, ['3', '2', '1']);
    assert.equal(depth.get('1'), 2);
    assert.deepEqual(pathFromParents(parent, '1'), ['3', '2', '1']);
  });

  test('mismo resultado que la implementación de referencia en grafos aleatorios', () => {
    let semilla = 12345;
    const azar = (n) => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
    for (let caso = 0; caso < 30; caso++) {
      const nodos = 5 + azar(40);
      const edges = [];
      for (let i = 0; i < nodos * 2; i++) {
        const s = 1 + azar(nodos);
        const t = 1 + azar(nodos);
        if (s !== t) edges.push({ source: String(s), target: String(t) });
      }
      const raices = Array.from({ length: 1 + azar(5) }, () => String(1 + azar(nodos)));
      const nuevo = computeCascadeImpact({ edges, rootIds: raices });
      const ref = impactoDeReferencia(edges, raices);
      assert.equal(nuevo.size, ref.size, `caso ${caso}`);
      for (const [n, r] of ref) {
        const x = nuevo.get(n);
        assert.equal(x.impactLevel, r.impactLevel, `caso ${caso} nodo ${n}`);
        assert.deepEqual(x.impactedByServers, r.impactedByServers, `caso ${caso} nodo ${n}`);
        assert.deepEqual(x.impactPath, r.impactPath, `caso ${caso} nodo ${n}`);
      }
    }
  });

  test('cadena de 3000 nodos con 200 raíces simuladas: responde en menos de 3 s', () => {
    const N = 3000;
    const edges = Array.from({ length: N - 1 }, (_, i) => ({ source: String(i + 1), target: String(i + 2) }));
    const raices = Array.from({ length: 200 }, (_, i) => String(N - i));
    const t0 = performance.now();
    const impacto = computeCascadeImpact({ edges, rootIds: raices });
    const ms = performance.now() - t0;
    assert.equal(impacto.size, N - 1);
    // El nodo 1 lo afecta en primer lugar la raíz más cercana (2801), a 2800 saltos
    assert.equal(impacto.get('1').impactLevel, N - 200);
    assert.equal(impacto.get('1').impactPath[0], String(N - 199));
    assert.equal(impacto.get('1').impactPath.length, N - 199);
    assert.equal(impacto.get('1').impactedByServers.length, 200);
    assert.ok(ms < 3000, `tardó ${ms.toFixed(0)} ms`);
  });
});

describe('cruce con monitoreo: separadores de IP idénticos a los del sync', () => {
  test('SEPARADORES_IP = espacios de JavaScript + "," + ";" (todo el BMP)', () => {
    const esperados = new Set([',', ';']);
    for (let c = 0; c <= 0xFFFF; c++) {
      const ch = String.fromCharCode(c);
      if (/[\n\s,;]/.test(ch)) esperados.add(ch);
    }
    assert.deepEqual(new Set(SEPARADORES_IP), esperados);
  });
});

describe('validación de entradas: reglas añadidas', () => {
  test('cleanText elimina caracteres invisibles y de control bidi', () => {
    const invisibles = [0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
      0x2066, 0x2067, 0x2068, 0x2069, 0xFEFF].map((c) => String.fromCharCode(c)).join('');
    assert.equal(cleanText(`Mapa${invisibles} General`, { field: 'name', max: 120 }), 'Mapa General');
    assert.equal(cleanText(`ab${String.fromCharCode(0x202E)}cd`, { field: 'label', max: 120 }), 'abcd');
    assert.equal(cleanText(String.fromCharCode(0x200B, 0xFEFF), { field: 'label', max: 120 }), null);
    // Letras con acento y emojis se conservan
    assert.equal(cleanText('Núcleo ERP ✓', { field: 'label', max: 120 }), 'Núcleo ERP ✓');
  });

  test('un servidor en positions y en removeServerIds a la vez -> 400', () => {
    assert.throws(
      () => parsePositionsPayload({ positions: [{ serverId: 2, x: 0, y: 0 }], removeServerIds: ['2'] }),
      { statusCode: 400, message: /a la vez en positions y en removeServerIds/ },
    );
    const ok = parsePositionsPayload({ positions: [{ serverId: 2, x: 0, y: 0 }], removeServerIds: [3] });
    assert.deepEqual(ok.removeServerIds, ['3']);
  });

  test('pinned omitido = true (arrastre manual); el auto-layout envía pinned:false', () => {
    const r = parsePositionsPayload({ positions: [{ serverId: 1, x: 0, y: 0 }, { serverId: 2, x: 5, y: 5, pinned: false }] });
    assert.equal(r.positions[0].pinned, true);
    assert.equal(r.positions[1].pinned, false);
  });

  test('límites del lote: removeServerIds > 1000, viewport fuera de rango y filterConfig > 8 KB -> 400', () => {
    const ids = Array.from({ length: LIMITS.maxPositions + 1 }, (_, i) => i + 1);
    assert.throws(() => parsePositionsPayload({ removeServerIds: ids }), { statusCode: 400 });
    assert.throws(() => parsePositionsPayload({ viewport: { zoom: 11 } }), { statusCode: 400 });
    assert.throws(() => parsePositionsPayload({ viewport: { x: 1e8 } }), { statusCode: 400 });
    assert.throws(() => parseViewCreate({ name: 'ok', filterConfig: { x: 'a'.repeat(LIMITS.maxFilterConfigBytes) } }), { statusCode: 400 });
  });
});

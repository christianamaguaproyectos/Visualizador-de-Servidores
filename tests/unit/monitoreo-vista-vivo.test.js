// Vista en tiempo real de Monitoreo: agrupación por rack, estado agregado, filtros y gráficas SVG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparPorRack, estadoAgregado, filtrarHosts, resumenEstados, SIN_RACK,
} from '../../frontend/public/js/dominios/monitoreo/modeloRacks.js';
import {
  resumirSerie, svgMiniOnda, svgOndaLatencia, techoEscala, trazoSuave,
} from '../../frontend/public/js/dominios/monitoreo/graficasOnda.js';

const h = (id, name, rack, estado, extra = {}) => ({ id: String(id), name, rack, type: 'fisico', estado_actual: estado, ...extra });

test('agruparPorRack: estado agregado, orden de racks y de servidores', () => {
  const racks = agruparPorRack([
    h(1, 'srv-b', 'RACK-A2', 'UP'),
    h(2, 'srv-a', 'RACK-A1', 'UP'),
    h(3, 'srv-c', 'RACK-A1', 'DOWN', { open_incidents: 2 }),
    h(4, 'srv-vm', 'srv-hv-01', 'DEGRADED', { type: 'virtual' }),
    h(5, 'srv-x', null, 'UNKNOWN'),
    h(6, 'srv-d', 'RACK-A10', 'MAINTENANCE'),
  ]);
  assert.deepEqual(racks.map((r) => r.nombre), ['RACK-A1', 'RACK-A2', 'RACK-A10', 'srv-hv-01', SIN_RACK]);
  const a1 = racks[0];
  assert.equal(a1.estado, 'DOWN');
  assert.equal(a1.conProblemas, 1);
  assert.equal(a1.incidentes, 2);
  assert.deepEqual(a1.hosts.map((x) => x.name), ['srv-c', 'srv-a'], 'los caídos primero');
  assert.equal(racks[2].estado, 'MAINTENANCE');
  assert.equal(racks[3].tipo, 'virtual');
  assert.equal(racks[3].estado, 'DEGRADED');
  assert.equal(racks[4].tipo, 'otro');
});

test('estadoAgregado: el peor estado manda; sin datos solo si no hay nada mejor', () => {
  assert.equal(estadoAgregado({ UP: 3, UNKNOWN: 1 }), 'UP');
  assert.equal(estadoAgregado({ UP: 3, DEGRADED: 1 }), 'DEGRADED');
  assert.equal(estadoAgregado({ UNKNOWN: 2 }), 'UNKNOWN');
  assert.equal(estadoAgregado({ MAINTENANCE: 1, UNKNOWN: 1 }), 'MAINTENANCE');
});

test('filtrarHosts y resumenEstados', () => {
  const lista = [h(1, 'srv-app-01', 'RACK-A1', 'UP', { ip: '10.0.0.11' }), h(2, 'srv-db-01', 'RACK-A2', 'DOWN'), h(3, 'srv-web-01', 'RACK-A2', 'UP', { open_incidents: 1 })];
  assert.equal(filtrarHosts(lista, { texto: '10.0.0.11' }).length, 1);
  assert.equal(filtrarHosts(lista, { texto: 'rack-a2' }).length, 2);
  assert.deepEqual(filtrarHosts(lista, { soloProblemas: true }).map((x) => x.id), ['2', '3']);
  const r = resumenEstados(lista);
  assert.equal(r.UP, 2);
  assert.equal(r.DOWN, 1);
  assert.equal(r.incidentes, 1);
});

test('resumirSerie: disponibilidad, media, p95 y última latencia solo si respondió', () => {
  const t = 1700000000000;
  const serie = [[t, 10, 'ok'], [t + 1, 20, 'ok'], [t + 2, null, 'fail'], [t + 3, 30, 'ok']];
  const r = resumirSerie(serie);
  assert.equal(r.total, 4);
  assert.equal(r.fallos, 1);
  assert.equal(r.disponibilidad, 75);
  assert.equal(r.media, 20);
  assert.equal(r.p95, 30);
  assert.equal(r.ultimaLatencia, 30);
  assert.equal(resumirSerie([[t, 2000, 'timeout']]).ultimaLatencia, null);
  assert.equal(resumirSerie([]).disponibilidad, null);
});

test('techoEscala y trazoSuave', () => {
  assert.equal(techoEscala(7), 10);
  assert.equal(techoEscala(130), 200);
  assert.equal(techoEscala(0), 10);
  assert.equal(trazoSuave([]), '');
  assert.match(trazoSuave([[0, 0], [10, 5]]), /^M0,0 C5,0 5,5 10,5$/);
});

test('SVG: sin style ni scripts, fallos marcados y textos escapados', () => {
  const t = 1700000000000;
  const serie = [[t, 12, 'ok'], [t + 60000, null, 'fail'], [t + 120000, 15, 'ok'], [t + 180000, 900, 'degraded']];
  const mini = svgMiniOnda(serie);
  const grande = svgOndaLatencia(serie, { titulo: '<b>"x"</b>' });
  for (const svg of [mini, grande]) {
    assert.ok(!/style=|<script|on\w+=/i.test(svg));
    assert.ok(/^<svg[\s\S]*<\/svg>$/.test(svg));
  }
  assert.equal((mini.match(/class="onda-fallo"/g) || []).length, 2, 'fallo y degradado marcados');
  assert.equal((grande.match(/class="disp-ok"/g) || []).length, 2);
  assert.equal((grande.match(/class="disp-fallo"/g) || []).length, 1);
  assert.equal((grande.match(/class="disp-timeout"/g) || []).length, 1);
  assert.ok(grande.includes('aria-label="&#60;b&#62;&#34;x&#34;&#60;/b&#62;"'));
  assert.ok(svgOndaLatencia([]).includes('Sin ejecuciones'));
  assert.ok(svgMiniOnda([]).includes('onda-mini--vacia'));
});

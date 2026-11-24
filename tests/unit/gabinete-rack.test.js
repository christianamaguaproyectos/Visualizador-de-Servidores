// Gabinete de rack de /fisicos: criticidad, estado de monitoreo, colocación por U y escape de datos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarCriticidad, claveMonitoreo, construirGabineteHtml, construirLeyendaHtml, contarMonitoreo,
  construirAvisoSinUbicarHtml, construirSinRackHtml,
} from '../../frontend/public/js/dominios/hosts/gabineteRack.js';
import { calcularResumenRacks } from '../../frontend/public/js/dominios/hosts/resumenRacks.js';

test('criticidad: NO_CRITICO no cuenta como crítico', () => {
  assert.equal(normalizarCriticidad('NO_CRITICO'), 'no_critico');
  assert.equal(normalizarCriticidad('No crítico'), 'no_critico');
  assert.equal(normalizarCriticidad('CRITICO'), 'critico');
  assert.equal(normalizarCriticidad('Crítico'), 'critico');
  assert.equal(normalizarCriticidad('MANTENIMIENTO'), 'mantenimiento');
  assert.equal(normalizarCriticidad('', 'NO'), 'inactivo');
  assert.equal(normalizarCriticidad(null, 'SI'), 'no_critico');
});

test('estado de monitoreo: valores desconocidos o vacíos son "sin datos"', () => {
  assert.equal(claveMonitoreo('UP'), 'UP');
  assert.equal(claveMonitoreo('down'), 'DOWN');
  assert.equal(claveMonitoreo('MAINT'), 'MAINTENANCE');
  assert.equal(claveMonitoreo(undefined), 'UNKNOWN');
  assert.equal(claveMonitoreo('OTRO'), 'UNKNOWN');
});

test('gabinete: 42 unidades numeradas, servidores en su U y unidades libres', () => {
  const servidores = [
    { id: '1', nombre: 'srv-app-01', ip: '10.0.0.11', rackPosition: 42, rackUnits: 1, estado: 'CRITICO' },
    { id: '2', nombre: 'srv-db-01', ip: '10.0.0.12', rackPosition: 10, rackUnits: 2, estado: 'NO_CRITICO' },
  ];
  const { html, ocupadas, libres } = construirGabineteHtml({ nombreRack: 'RACK-01', servidores, estados: new Map([['1', 'DOWN'], ['2', 'UP']]) });
  assert.equal(ocupadas, 3);
  assert.equal(libres, 39);
  assert.equal((html.match(/class="gab-num /g) || []).length, 42);
  assert.equal((html.match(/class="gab-libre /g) || []).length, 39);
  assert.match(html, /gab-srv gab-srv--critico gab-r-1 gab-s-1[^"]*"[^>]*data-u="U42"/);
  assert.match(html, /gab-srv gab-srv--no-critico gab-r-33 gab-s-2[^"]*"[^>]*data-u="U9–U10"/);
  assert.match(html, /gab-led gab-led--down" data-led-id="1"/);
  assert.match(html, /gab-led gab-led--up" data-led-id="2"/);
  assert.match(html, /data-position="11"/); // U libre justo encima del servidor de 2U
});

test('gabinete: escapa los datos del inventario', () => {
  const { html } = construirGabineteHtml({
    nombreRack: '<img src=x onerror=alert(1)>',
    servidores: [{ id: '9', nombre: '<script>x</script>', ip: '"><b>', rackPosition: 5, rackUnits: 1 }],
  });
  assert.doesNotMatch(html, /<script>|<img|"><b>/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
});

test('leyenda y conteos por estado de monitoreo', () => {
  const servidores = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const conteos = contarMonitoreo(servidores, new Map([['1', 'UP'], ['2', 'DOWN']]));
  assert.deepEqual(conteos, { UP: 1, DOWN: 1, UNKNOWN: 1 });
  const leyenda = construirLeyendaHtml({ conteos });
  assert.match(leyenda, /data-conteo-monitoreo="DOWN">1</);
  assert.match(leyenda, /Crítico/);
});

test('resumen de racks: NO_CRITICO se cuenta como no crítico', () => {
  const r = calcularResumenRacks([{ servers: [{ estado: 'NO_CRITICO' }, { estado: 'CRITICO' }, { estado: 'MANTENIMIENTO' }] }]);
  assert.equal(r.criticos, 1);
  assert.equal(r.noCriticos, 1);
  assert.equal(r.mantenimiento, 1);
});

test('servidores que no caben en 42U: se avisan y se listan', () => {
  const servidores = Array.from({ length: 25 }, (_, i) => ({ id: String(i + 1), nombre: `srv-${i + 1}`, rackUnits: 2 }));
  const { sinUbicar } = construirGabineteHtml({ nombreRack: 'R', servidores });
  assert.equal(sinUbicar.length, 4); // 21 de 2U caben en 42U (modo distribuido)
  const aviso = construirAvisoSinUbicarHtml(sinUbicar);
  assert.match(aviso, /4 servidores no caben/);
  assert.equal((aviso.match(/data-view="server"/g) || []).length, 4);
  assert.equal(construirAvisoSinUbicarHtml([]), '');
});

test('servidores sin rack: tarjeta con lista limitada y escape', () => {
  const servidores = Array.from({ length: 5 }, (_, i) => ({ id: String(i), nombre: i === 0 ? '<b>x</b>' : `srv-${i}` }));
  const html = construirSinRackHtml(servidores, new Map(), { limite: 3 });
  assert.match(html, /Sin rack asignado/);
  assert.equal((html.match(/data-view="server"/g) || []).length, 3);
  assert.match(html, /Se muestran 3 de 5/);
  assert.ok(!html.includes('<b>x</b>'));
  assert.equal(construirSinRackHtml([]), '');
});

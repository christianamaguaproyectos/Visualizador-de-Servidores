// Colocación de servidores por unidad (U) en un rack de 42U. La usan la vista de rack de
// /fisicos (app.js) y la sala de racks 3D: las dos muestran cada servidor en las mismas U.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  colocarEnRack, huecosLibres, primeraPosicionLibre, normalizarUnidades, formatearDiscos, UNIDADES_RACK,
} from '../../frontend/public/js/dominios/hosts/colocacionRack.js';

const srv = (id, rackPosition, rackUnits) => ({ id: String(id), rackPosition, rackUnits });
const ubicacion = (r, id) => r.bloques.filter((b) => b.servidor.id === String(id)).map((b) => [b.uInferior, b.uSuperior]);

test('posición explícita: ocupa desde su U hacia abajo tantas unidades como mide', () => {
  const r = colocarEnRack([srv(1, 10, 2), srv(2, 42, 1), srv(3, 4, 4)]);
  assert.equal(r.modo, 'posicionado');
  assert.deepEqual(ubicacion(r, 1), [[9, 10]]);
  assert.deepEqual(ubicacion(r, 2), [[42, 42]]);
  assert.deepEqual(ubicacion(r, 3), [[1, 4]]);
  assert.equal(r.ocupadas, 7);
  assert.equal(r.libres, UNIDADES_RACK - 7);
  // Índice 0 = U42 (arriba)
  assert.equal(r.porUnidad[0], 1);
  assert.equal(r.porUnidad[41], 2);
});

test('sin posición: se apilan en el primer hueco libre (desde arriba, como la vista de rack)', () => {
  const r = colocarEnRack([srv(1, 42, 2), srv(2, null, 2), srv(3, undefined, 1)]);
  assert.deepEqual(ubicacion(r, 1), [[41, 42]]);
  assert.deepEqual(ubicacion(r, 2), [[39, 40]]);
  assert.deepEqual(ubicacion(r, 3), [[38, 38]]);
  // Un hueco intermedio se rellena si cabe
  const h = colocarEnRack([srv(1, 42, 1), srv(2, 40, 1), srv(3, null, 1), srv(4, null, 2)]);
  assert.deepEqual(ubicacion(h, 3), [[41, 41]]);
  assert.deepEqual(ubicacion(h, 4), [[38, 39]]);
});

test('solapes: el servidor posterior se queda con las unidades en conflicto', () => {
  const r = colocarEnRack([srv(1, 10, 4), srv(2, 8, 2)]);
  assert.deepEqual(ubicacion(r, 1), [[9, 10]]);
  assert.deepEqual(ubicacion(r, 2), [[7, 8]]);
  // Si lo cubre entero, queda sin ubicar
  const t = colocarEnRack([srv(1, 10, 2), srv(2, 10, 2)]);
  assert.deepEqual(ubicacion(t, 1), []);
  assert.deepEqual(t.sinUbicar.map((s) => s.id), ['1']);
});

test('servidores de más de 1U y posiciones que salen del rack', () => {
  const r = colocarEnRack([srv(1, 1, 2), srv(2, 6, '4'), srv(3, 50, 2)]);
  // U1 con 2U: solo cabe la U1 (la vista de rack no lo sube)
  assert.deepEqual(ubicacion(r, 1), [[1, 1]]);
  assert.deepEqual(ubicacion(r, 2), [[3, 6]]);
  // Posición fuera de 1..42: se trata como sin posición (primer hueco desde arriba)
  assert.deepEqual(ubicacion(r, 3), [[41, 42]]);
  assert.equal(normalizarUnidades(''), 2);
  assert.equal(normalizarUnidades('abc'), 2);
  assert.equal(normalizarUnidades(0), 0);
  assert.equal(normalizarUnidades(3.7), 3);
});

test('rack lleno: lo que no cabe queda sin ubicar y no hay posición libre', () => {
  const lista = Array.from({ length: 21 }, (_, i) => srv(i + 1, 42 - i * 2, 2));
  lista.push(srv(99, null, 2));
  const r = colocarEnRack(lista);
  assert.equal(r.ocupadas, 42);
  assert.equal(r.libres, 0);
  assert.deepEqual(r.sinUbicar.map((s) => s.id), ['99']);
  assert.equal(primeraPosicionLibre(r.porUnidad, 1), null);
  assert.deepEqual(huecosLibres(r.porUnidad), []);
});

test('sin ninguna posición: reparto uniforme con huecos iguales (máximo 21 servidores de 2U)', () => {
  const r = colocarEnRack([srv(1), srv(2), srv(3)]);
  assert.equal(r.modo, 'distribuido');
  // 42 - 6 = 36 libres en 4 huecos de 9
  assert.deepEqual(ubicacion(r, 1), [[32, 33]]);
  assert.deepEqual(ubicacion(r, 2), [[21, 22]]);
  assert.deepEqual(ubicacion(r, 3), [[10, 11]]);
  const muchos = colocarEnRack(Array.from({ length: 23 }, (_, i) => srv(i + 1)));
  assert.equal(muchos.bloques.length, 21);
  assert.equal(muchos.sinUbicar.length, 2);
  assert.equal(colocarEnRack([]).ocupadas, 0);
});

test('huecos libres y primera posición libre (de abajo arriba)', () => {
  const r = colocarEnRack([srv(1, 2, 2), srv(2, 5, 1), srv(3, 42, 1)]);
  assert.deepEqual(huecosLibres(r.porUnidad).slice(0, 2), [{ uInferior: 3, uSuperior: 4, alto: 2 }, { uInferior: 6, uSuperior: 41, alto: 36 }]);
  // 2U: cabe en U3-U4 → rackPosition 4 (U superior del tramo)
  assert.equal(primeraPosicionLibre(r.porUnidad, 2), 4);
  assert.equal(primeraPosicionLibre(r.porUnidad, 4), 9);
  const otra = colocarEnRack([srv(9, 4, 2)]);
  const pos = primeraPosicionLibre(r.porUnidad, 2);
  // Colocar un servidor en esa posición lo deja exactamente en el hueco
  const con = colocarEnRack([srv(1, 2, 2), srv(2, 5, 1), srv(3, 42, 1), srv(4, pos, 2)]);
  assert.deepEqual(ubicacion(con, 4), [[3, 4]]);
  assert.equal(otra.ocupadas, 2);
});

test('la vista de rack de /fisicos usa la misma función de colocación', () => {
  // app.js dibuja los racks con gabineteRack.js, que coloca los servidores con colocarEnRack
  const app = fs.readFileSync(new URL('../../frontend/public/app.js', import.meta.url), 'utf8');
  const gabinete = fs.readFileSync(new URL('../../frontend/public/js/dominios/hosts/gabineteRack.js', import.meta.url), 'utf8');
  assert.match(app, /import \{[^}]*construirGabineteHtml[^}]*\} from '\/js\/dominios\/hosts\/gabineteRack\.js'/);
  assert.match(gabinete, /import \{[^}]*colocarEnRack[^}]*\} from '\.\/colocacionRack\.js'/);
  assert.match(gabinete, /colocarEnRack\(servidores, total\)/);
});

test('formatearDiscos: slots en JSON o texto libre', () => {
  assert.equal(formatearDiscos(JSON.stringify([{ slot: 1, cantidad: 2, capacidad: '960 GB' }])), 'Slot 1: 2x 960 GB');
  assert.equal(formatearDiscos('2 x 1 TB'), '2 x 1 TB');
  assert.equal(formatearDiscos(null), '—');
});

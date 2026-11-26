// Cálculo puro de Impacto de servicios (sin base de datos).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claveEquipo, evaluarServicios, hostsDeVms, MOTIVOS, propagarCaida,
} from '../../backend/src/services/impactoCalculo.js';
import { SEPARADORES_IP, nombreAplicacion, nombreVisible } from '../../backend/src/services/impactoService.js';
import { parseComponenteNuevo, parseListaIds } from '../../backend/src/dtos/impactoDto.js';

// Inventario de ejemplo: un host físico con dos VMs y un servidor físico suelto
const SERVIDORES = [
  { id: '1', type: 'fisicos', name: 'HOST-A', rack: 'Rack 1' },
  { id: '2', type: 'virtuales', name: 'APP-SEG', rack: 'host-a' },
  { id: '3', type: 'virtuales', name: 'BDD', rack: 'HOST A' },
  { id: '4', type: 'virtuales', name: 'NFS', rack: 'OTRO-HOST' },
  { id: '5', type: 'virtuales', name: 'NFS-SYN', rack: 'OTRO-HOST' },
  { id: '6', type: 'virtuales', name: 'NODO-1', rack: 'OTRO-HOST' },
  { id: '7', type: 'virtuales', name: 'NODO-2', rack: 'OTRO-HOST' },
  { id: '8', type: 'virtuales', name: 'BALANCEADOR', rack: 'OTRO-HOST' },
];

const SERVICIO = {
  id: '10',
  name: 'ERP',
  components: [
    { id: 'c1', serverId: '2', impact: 'TOTAL', role: 'Seguridad' },
    { id: 'c2', serverId: '3', impact: 'TOTAL', role: 'Base de datos' },
    { id: 'c3', serverId: '8', impact: 'PARCIAL', role: 'Balanceador' },
    { id: 'c4', serverId: '6', impact: 'NINGUNO' },
    { id: 'c6', serverId: '5', impact: 'SIN_DEFINIR' },
  ],
};

describe('Impacto de servicios — cálculo', () => {
  test('claveEquipo compara solo letras y números', () => {
    assert.equal(claveEquipo(' srv-esxi 10 '), 'SRVESXI10');
    assert.equal(claveEquipo(null), '');
  });

  test('hostsDeVms une cada VM con el físico cuyo nombre coincide', () => {
    const m = hostsDeVms(SERVIDORES);
    assert.equal(m.get('2'), '1');
    assert.equal(m.get('3'), '1');
    assert.equal(m.has('4'), false, 'host que no existe en Físicos: sin unión');
  });

  test('propagarCaida: las VMs caen con su host', () => {
    const caidos = propagarCaida(['1'], SERVIDORES);
    assert.deepEqual([...caidos.keys()].sort(), ['1', '2', '3']);
    assert.deepEqual(caidos.get('1'), { motivo: MOTIVOS.CAIDO, por: null, nivel: 0 });
    assert.deepEqual(caidos.get('2'), { motivo: MOTIVOS.HOST, por: '1', nivel: 1 });
  });

  test('propagarCaida ignora ids inexistentes', () => {
    const caidos = propagarCaida(['4', '999'], SERVIDORES);
    assert.deepEqual([...caidos.keys()], ['4']);
  });

  test('evaluarServicios: un servidor TOTAL deja el servicio sin funcionar', () => {
    const [r] = evaluarServicios([SERVICIO], propagarCaida(['3'], SERVIDORES));
    assert.equal(r.estado, 'NO_FUNCIONA');
    assert.equal(r.componentesCaidos[0].serverId, '3');
  });

  test('evaluarServicios: PARCIAL y SIN_DEFINIR', () => {
    assert.equal(evaluarServicios([SERVICIO], propagarCaida(['8'], SERVIDORES))[0].estado, 'PARCIAL');
    assert.equal(evaluarServicios([SERVICIO], propagarCaida(['5'], SERVIDORES))[0].estado, 'REVISAR');
    assert.equal(evaluarServicios([SERVICIO], propagarCaida(['4'], SERVIDORES))[0].estado, 'FUNCIONA');
    assert.equal(evaluarServicios([SERVICIO], propagarCaida(['6'], SERVIDORES))[0].estado, 'FUNCIONA', 'NINGUNO: sigue');
  });

  test('«si cae, también caen»: arrastra en cadena dentro del servicio', () => {
    const servicio = {
      id: '20', name: 'Web',
      components: [
        { id: 'a', serverId: '4', impact: 'NINGUNO', alsoFails: ['b'] },
        { id: 'b', serverId: '5', impact: 'NINGUNO', alsoFails: ['c'] },
        { id: 'c', serverId: '6', impact: 'NINGUNO' },
        { id: 'd', serverId: '7', impact: 'NINGUNO' },
      ],
    };
    const [r] = evaluarServicios([servicio], propagarCaida(['4'], SERVIDORES));
    assert.equal(r.estado, 'FUNCIONA');
    assert.deepEqual(r.componentesCaidos.map((c) => c.serverId), ['4', '5', '6']);
    assert.deepEqual(r.componentesCaidos[2].caida, { motivo: MOTIVOS.ARRASTRE, por: '5', nivel: 2 });
    // Si arrastra a uno que es «Deja de funcionar», cae todo el servicio
    servicio.components[2].impact = 'TOTAL';
    assert.equal(evaluarServicios([servicio], propagarCaida(['4'], SERVIDORES))[0].estado, 'NO_FUNCIONA');
  });

  test('el efecto más grave manda y los caídos van ordenados por gravedad', () => {
    const [r] = evaluarServicios([SERVICIO], propagarCaida(['8', '2'], SERVIDORES));
    assert.equal(r.estado, 'NO_FUNCIONA');
    assert.deepEqual(r.componentesCaidos.map((c) => c.serverId), ['2', '8']);
  });
});

describe('Impacto de servicios — utilidades', () => {
  test('SEPARADORES_IP = espacios de JavaScript + "," + ";" (todo el BMP)', () => {
    const esperados = new Set([',', ';']);
    for (let c = 0; c <= 0xFFFF; c++) {
      const ch = String.fromCharCode(c);
      if (/\s/.test(ch)) esperados.add(ch);
    }
    assert.deepEqual(new Set(SEPARADORES_IP), esperados);
  });

  test('nombreVisible y nombreAplicacion', () => {
    assert.equal(nombreVisible({ id: '9', nombre: ' ', hostname: '', ip: '0.0.0.0, 10.0.0.5' }), '10.0.0.5');
    assert.equal(nombreVisible({ id: '9' }), 'Servidor #9');
    for (const v of [null, '', ' ', 'N/A', 'na', '-', 'Ninguno']) assert.equal(nombreAplicacion(v), null);
    assert.equal(nombreAplicacion('  JDE   FAT '), 'JDE FAT');
  });

  test('DTO: componente y lista de ids', () => {
    assert.deepEqual(parseComponenteNuevo({ serverId: 5, impact: 'total', role: ' Base ' }),
      { serverId: '5', role: 'Base', impact: 'TOTAL', impactDetail: null, alsoFails: [] });
    assert.deepEqual(parseComponenteNuevo({ serverId: '5', alsoFails: ['3', 3, '7'] }).alsoFails, ['3', '7']);
    assert.throws(() => parseComponenteNuevo({ serverId: '5', alsoFails: '3' }), /lista/);
    assert.equal(parseComponenteNuevo({ serverId: '5' }).impact, 'SIN_DEFINIR');
    assert.throws(() => parseComponenteNuevo({ serverId: '5', impact: 'MUCHO' }), /impacto inválido/);
    assert.deepEqual(parseListaIds('3, 1,3'), ['3', '1']);
    assert.throws(() => parseListaIds('1,x'), /entero positivo/);
  });
});

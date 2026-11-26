// Cálculo puro de Impacto de servicios (sin base de datos).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claveEquipo, evaluarServicios, hostsDeVms, MOTIVOS, propagarCaida,
} from '../../backend/src/services/impactoCalculo.js';
import { SEPARADORES_IP, nombreAplicacion, nombreVisible } from '../../backend/src/services/impactoService.js';
import { parseComponenteNuevo, parseListaIds, parseRequisitoNuevo } from '../../backend/src/dtos/impactoDto.js';

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
    { id: 'c4', serverId: '6', impact: 'TOTAL', redundancyGroup: 'BSSV' },
    { id: 'c5', serverId: '7', impact: 'TOTAL', redundancyGroup: 'BSSV' },
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

  test('propagarCaida: VM cae con su host y por requisitos en cadena', () => {
    const requisitos = [{ serverId: '5', requiredServerId: '4' }, { serverId: '4', requiredServerId: '2' }];
    const caidos = propagarCaida(['1'], SERVIDORES, requisitos);
    assert.deepEqual([...caidos.keys()].sort(), ['1', '2', '3', '4', '5']);
    assert.deepEqual(caidos.get('1'), { motivo: MOTIVOS.CAIDO, por: null, nivel: 0 });
    assert.equal(caidos.get('2').motivo, MOTIVOS.HOST);
    assert.deepEqual(caidos.get('4'), { motivo: MOTIVOS.REQUIERE, por: '2', nivel: 2 });
    assert.deepEqual(caidos.get('5'), { motivo: MOTIVOS.REQUIERE, por: '4', nivel: 3 });
  });

  test('propagarCaida ignora ids inexistentes y ciclos', () => {
    const caidos = propagarCaida(['4', '999'], SERVIDORES, [{ serverId: '5', requiredServerId: '4' }, { serverId: '4', requiredServerId: '5' }]);
    assert.deepEqual([...caidos.keys()].sort(), ['4', '5']);
  });

  test('evaluarServicios: un servidor TOTAL deja el servicio sin funcionar', () => {
    const [r] = evaluarServicios([SERVICIO], propagarCaida(['3'], SERVIDORES, []));
    assert.equal(r.estado, 'NO_FUNCIONA');
    assert.equal(r.componentesCaidos[0].serverId, '3');
  });

  test('evaluarServicios: PARCIAL y SIN_DEFINIR', () => {
    assert.equal(evaluarServicios([SERVICIO], propagarCaida(['8'], SERVIDORES, []))[0].estado, 'PARCIAL');
    assert.equal(evaluarServicios([SERVICIO], propagarCaida(['5'], SERVIDORES, []))[0].estado, 'REVISAR');
    assert.equal(evaluarServicios([SERVICIO], propagarCaida(['4'], SERVIDORES, []))[0].estado, 'FUNCIONA');
  });

  test('grupo de respaldo: con uno en pie el servicio sigue; caen los dos, no funciona', () => {
    const [uno] = evaluarServicios([SERVICIO], propagarCaida(['6'], SERVIDORES, []));
    assert.equal(uno.estado, 'FUNCIONA');
    assert.equal(uno.componentesCaidos[0].impactoEfectivo, 'NINGUNO');
    assert.deepEqual(uno.componentesCaidos[0].respaldoPor, ['7']);
    const [dos] = evaluarServicios([SERVICIO], propagarCaida(['6', '7'], SERVIDORES, []));
    assert.equal(dos.estado, 'NO_FUNCIONA');
  });

  test('el efecto más grave manda y los caídos van ordenados por gravedad', () => {
    const [r] = evaluarServicios([SERVICIO], propagarCaida(['8', '2'], SERVIDORES, []));
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

  test('DTO: componente, requisito y lista de ids', () => {
    assert.deepEqual(parseComponenteNuevo({ serverId: 5, impact: 'total', role: ' Base ' }),
      { serverId: '5', role: 'Base', impact: 'TOTAL', impactDetail: null, workaround: null, redundancyGroup: null });
    assert.equal(parseComponenteNuevo({ serverId: '5' }).impact, 'SIN_DEFINIR');
    assert.throws(() => parseComponenteNuevo({ serverId: '5', impact: 'MUCHO' }), /impacto inválido/);
    assert.throws(() => parseRequisitoNuevo({ serverId: '3', requiredServerId: '3' }), /sí mismo/);
    assert.deepEqual(parseListaIds('3, 1,3'), ['3', '1']);
    assert.throws(() => parseListaIds('1,x'), /entero positivo/);
  });
});

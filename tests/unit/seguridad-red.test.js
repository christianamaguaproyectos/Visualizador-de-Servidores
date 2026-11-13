// Anti-SSRF: validador de destinos de los checks de monitoreo (Fase 1.2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esIpPermitida,
  esHostSintacticamenteValido,
  validarDestinoRed,
  validarDestinoChequeo,
} from '../../backend/src/monitoring/domain/validators/networkTargetValidator.js';

test('bloquea loopback, link-local (metadatos de nube), "esta red" y multicast', () => {
  for (const ip of ['127.0.0.1', '127.10.20.30', '169.254.169.254', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1']) {
    assert.equal(esIpPermitida(ip), false, `${ip} debería estar bloqueada`);
  }
});

test('permite IPs de servidores reales (privadas corporativas y públicas)', () => {
  for (const ip of ['10.0.0.5', '192.168.100.20', '172.16.5.4', '8.8.8.8', '2001:4860:4860::8888']) {
    assert.equal(esIpPermitida(ip), true, `${ip} debería estar permitida`);
  }
});

test('rechaza hosts que inyectan opciones al comando ping', () => {
  for (const host of ['-t', '-f', '--help', '', ' 10.0.0.1', '10.0.0.1;ls', 'a b', '$(id)']) {
    assert.equal(esHostSintacticamenteValido(host), false, `"${host}" debería ser inválido`);
  }
  assert.equal(esHostSintacticamenteValido('srv-app01.danec.local'), true);
});

test('validarDestinoRed rechaza localhost por nombre', async () => {
  const r = await validarDestinoRed('localhost');
  assert.equal(r.valido, false);
});

test('checks HTTP hacia la propia app o a metadatos de nube son rechazados', async () => {
  for (const url of ['http://127.0.0.1:3000', 'http://169.254.169.254/latest/meta-data', 'http://[::1]:8080/', 'http://localhost/']) {
    const r = await validarDestinoChequeo('http', { url });
    assert.equal(r.valido, false, `${url} debería ser rechazada`);
  }
  const malformada = await validarDestinoChequeo('http', { url: 'no es una url' });
  assert.equal(malformada.valido, false);
});

test('checks ICMP/TCP a una IP de servidor válida son aceptados', async () => {
  const r = await validarDestinoChequeo('icmp', { host: '10.20.30.40' });
  assert.equal(r.valido, true);
  const tcp = await validarDestinoChequeo('tcp', { host: '-t' });
  assert.equal(tcp.valido, false);
});

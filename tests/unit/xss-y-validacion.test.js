// Sanitización anti-XSS (frontend y backend) y validación de entradas
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml as escapeFront, escapeAttr, textoSeguro } from '../../frontend/public/js/dominios/ui-system/seguridadHtml.js';
import { escapeHtml as escapeBack, limpiarEncabezado, esEmailValido } from '../../backend/src/utils/htmlEscape.js';
import { parsePositiveBigInt } from '../../backend/src/utils/ids.js';
import { validarConfiguracionChequeo } from '../../backend/src/monitoring/domain/validators/checkConfigValidator.js';

const ATAQUE = '<img src=x onerror="alert(1)"> & \'comillas\'';

test('frontend escapeHtml convierte las etiquetas en texto', () => {
  const r = escapeFront(ATAQUE);
  assert.doesNotMatch(r, /[<>"']/);
  assert.equal(escapeFront('<b>Prueba & "Comillas"</b>'), '&lt;b&gt;Prueba &amp; &quot;Comillas&quot;&lt;/b&gt;');
  assert.equal(escapeFront(null), '');
  assert.equal(escapeFront(0), '0');
});

test('frontend escapeAttr también neutraliza el backtick', () => {
  assert.equal(escapeAttr('`x`'), '&#96;x&#96;');
});

test('frontend textoSeguro usa guion largo si está vacío', () => {
  assert.equal(textoSeguro('   '), '—');
  assert.equal(textoSeguro('<i>'), '&lt;i&gt;');
});

test('backend escapeHtml (correos) neutraliza HTML', () => {
  assert.doesNotMatch(escapeBack(ATAQUE), /[<>"]/);
});

test('backend limpiarEncabezado quita saltos de línea (inyección de cabeceras de correo)', () => {
  const r = limpiarEncabezado('Asunto\r\nBcc: victima@example.com');
  assert.doesNotMatch(r, /[\r\n]/);
});

test('backend esEmailValido', () => {
  assert.equal(esEmailValido('ops@example.com'), true);
  assert.equal(esEmailValido('no-es-correo'), false);
  assert.equal(esEmailValido('a@b.com\r\nBcc: x@y.com'), false);
});

test('ids: solo enteros positivos', () => {
  assert.equal(String(parsePositiveBigInt('42')), '42');
  for (const malo of ['abc', '-1', '0', '1.5', '1e3', '', '99999999999999999999']) {
    assert.throws(() => parsePositiveBigInt(malo), `${malo} debería rechazarse`);
  }
});

test('configuración de checks: límites de puerto y timeout', () => {
  assert.equal(validarConfiguracionChequeo('tcp', { host: '10.0.0.1', port: 70000 }).valido, false);
  assert.equal(validarConfiguracionChequeo('tcp', { host: '10.0.0.1', port: 443 }).valido, true);
});

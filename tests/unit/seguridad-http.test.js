// CSRF, cabeceras de seguridad (CSP) y contexto de petición (x-request-id / logs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCsrfProtection, ensureCsrfToken } from '../../backend/src/middleware/csrfMiddleware.js';
import { CONTENT_SECURITY_POLICY, securityHeadersMiddleware } from '../../backend/src/middleware/securityHeadersMiddleware.js';
import { sanitizarRequestId, redactarUrl } from '../../backend/src/middleware/requestContextMiddleware.js';

/** req/res mínimos al estilo Express */
function peticion({ method = 'POST', url = '/api/servers', headers = {}, session = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, originalUrl: url, session, get: (n) => h[n.toLowerCase()] };
}
function respuesta() {
  return {
    statusCode: 200, cuerpo: null, cabeceras: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.cuerpo = b; return this; },
    setHeader(k, v) { this.cabeceras[k] = v; },
  };
}
function ejecutar(mw, req) {
  const res = respuesta();
  let siguio = false;
  mw(req, res, () => { siguio = true; });
  return { res, siguio };
}

const csrf = createCsrfProtection();

test('CSRF: GET no requiere token', () => {
  const { siguio } = ejecutar(csrf, peticion({ method: 'GET', session: { user: { id: 1 } } }));
  assert.equal(siguio, true);
});

test('CSRF: POST con sesión y SIN token -> 403 CSRF_INVALID', () => {
  const req = peticion({ session: { user: { id: 1 }, csrfToken: 'abc' }, headers: { host: 'app.local' } });
  const { res, siguio } = ejecutar(csrf, req);
  assert.equal(siguio, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.cuerpo.code, 'CSRF_INVALID');
});

test('CSRF: POST con token correcto pasa; con token incorrecto no', () => {
  const session = { user: { id: 1 } };
  const token = ensureCsrfToken({ session });
  assert.ok(token && token.length >= 32);
  assert.equal(ejecutar(csrf, peticion({ session, headers: { 'x-csrf-token': token, host: 'app.local' } })).siguio, true);
  assert.equal(ejecutar(csrf, peticion({ session, headers: { 'x-csrf-token': token + 'x', host: 'app.local' } })).siguio, false);
});

test('CSRF: Origin de otro sitio -> 403 CSRF_ORIGIN aunque el token sea válido', () => {
  const session = { user: { id: 1 } };
  const token = ensureCsrfToken({ session });
  const req = peticion({ session, headers: { 'x-csrf-token': token, host: 'app.local', origin: 'https://atacante.example' } });
  const { res, siguio } = ejecutar(csrf, req);
  assert.equal(siguio, false);
  assert.equal(res.cuerpo.code, 'CSRF_ORIGIN');
});

test('CSRF: login no exige token pero sí mismo origen', () => {
  assert.equal(ejecutar(csrf, peticion({ url: '/api/auth/login', headers: { host: 'app.local' } })).siguio, true);
  assert.equal(ejecutar(csrf, peticion({ url: '/api/auth/login', headers: { host: 'app.local', origin: 'http://otro.example' } })).siguio, false);
});

test('CSP activa: sin unsafe-inline, sin unsafe-eval y sin dominios externos', () => {
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /https?:\/\//);
  assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);

  const res = respuesta();
  securityHeadersMiddleware({}, res, () => {});
  assert.equal(res.cabeceras['Content-Security-Policy'], CONTENT_SECURITY_POLICY);
  assert.equal(res.cabeceras['Content-Security-Policy-Report-Only'], undefined);
  assert.equal(res.cabeceras['X-Content-Type-Options'], 'nosniff');
});

test('x-request-id: solo se acepta con caracteres seguros y hasta 64', () => {
  assert.equal(sanitizarRequestId('abc-123_OK.v1'), 'abc-123_OK.v1');
  assert.equal(sanitizarRequestId('a'.repeat(64)), 'a'.repeat(64));
  for (const malo of ['a'.repeat(65), 'con espacio', 'salto\nde-linea', '\x1b[31mrojo', '', undefined, null, 123]) {
    assert.equal(sanitizarRequestId(malo), null, `${JSON.stringify(malo)} debería rechazarse`);
  }
});

test('logs: los tokens y contraseñas de la query se redactan', () => {
  assert.equal(redactarUrl('/api/auth/validate?token=SECRETO&otro=1'), '/api/auth/validate?token=[REDACTED]&otro=1');
  assert.equal(redactarUrl('/login?resetToken=abc'), '/login?resetToken=[REDACTED]');
  assert.equal(redactarUrl('/x?Password=p&a=b&API_KEY=k'), '/x?Password=[REDACTED]&a=b&API_KEY=[REDACTED]');
  assert.equal(redactarUrl('/api/servers?type=fisicos'), '/api/servers?type=fisicos');
  assert.equal(redactarUrl('/sin-query'), '/sin-query');
});

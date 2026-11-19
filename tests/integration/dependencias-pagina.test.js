// Integración de la página /dependencias (Fase 2): HTML compatible con la CSP estricta y
// three.js auto-alojado en /vendor/three con lista cerrada. App REAL + PostgreSQL;
// se omite si no hay TEST_POSTGRES_URL (tests/helpers/appDePrueba.js).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREDENCIALES, clienteHttp, crearUsuarios, iniciarApp, motivoParaOmitir, prepararBaseDeDatos,
} from '../helpers/appDePrueba.js';

const omitir = motivoParaOmitir();

describe('Página /dependencias y /vendor/three (integración)', { skip: omitir || false }, () => {
  let app;
  let lector;

  before(async () => {
    await prepararBaseDeDatos();
    crearUsuarios();
    app = await iniciarApp();
    lector = clienteHttp(app.base);
    assert.equal((await lector.login(CREDENCIALES.lector)).status, 200);
  });

  after(async () => {
    if (app) await app.detener();
  });

  test('sin sesión: /dependencias redirige al login y /vendor/three responde 401 o redirige', async () => {
    const anon = clienteHttp(app.base);
    const pagina = await anon.api('GET', '/dependencias');
    assert.ok([302, 401].includes(pagina.status), `estado ${pagina.status}`);
    const vendor = await anon.api('GET', '/vendor/three/three.module.js');
    assert.ok([302, 401].includes(vendor.status), `estado ${vendor.status}`);
  });

  test('GET /dependencias entrega la página con la CSP estricta y sin código inline', async () => {
    const r = await lector.api('GET', '/dependencias');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    const html = r.data;
    assert.match(html, /Mapa de Dependencias/);
    // Todo <script> carga un archivo propio (src="/...") y no lleva cuerpo
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length > 0);
    for (const [, attrs, cuerpo] of scripts) {
      assert.match(attrs, /\bsrc="\/[^"/]/, `script sin src propio: ${attrs}`);
      assert.equal(cuerpo.trim(), '', 'script con código inline');
    }
    assert.doesNotMatch(html, /<style\b/i, 'sin <style> inline');
    assert.doesNotMatch(html, /\sstyle\s*=/i, 'sin atributos style=""');
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'sin manejadores on*="" inline');
    assert.doesNotMatch(html, /https?:\/\//i, 'sin recursos de otros dominios');
  });

  test('/vendor/three sirve la lista cerrada con el especificador "three" reescrito', async () => {
    const base = await lector.api('GET', '/vendor/three/three.module.js');
    assert.equal(base.status, 200);
    assert.match(base.headers.get('content-type'), /javascript/);
    assert.ok(base.headers.get('etag'));
    assert.match(base.data, /REVISION\s*=\s*["']170["']|"170"/);

    for (const ruta of ['/vendor/three/addons/controls/OrbitControls.js', '/vendor/three/addons/renderers/CSS2DRenderer.js']) {
      const r = await lector.api('GET', ruta);
      assert.equal(r.status, 200, ruta);
      assert.match(r.data, /from\s*['"]\/vendor\/three\/three\.module\.js['"]/, `${ruta} importa el módulo auto-alojado`);
      assert.doesNotMatch(r.data, /from\s*['"]three['"]/, `${ruta} sin especificador desnudo`);
    }

    const cache = await lector.api('GET', '/vendor/three/three.module.js', { headers: { 'if-none-match': base.headers.get('etag') } });
    assert.equal(cache.status, 304);
  });

  test('/vendor/three responde 404 a todo lo que no está en la lista (sin recorrido de directorios)', async () => {
    const rutas = [
      '/vendor/three/',
      '/vendor/three/package.json',
      '/vendor/three/build/three.module.js',
      '/vendor/three/three.cjs',
      '/vendor/three/addons/controls/TrackballControls.js',
      '/vendor/three/../../package.json',
      '/vendor/three/%2e%2e/%2e%2e/package.json',
      '/vendor/three/..%2f..%2fpackage.json',
      '/vendor/three/addons/controls/..%2f..%2f..%2fpackage.json',
      '/vendor/three/three.module.js/..',
    ];
    for (const ruta of rutas) {
      const r = await lector.api('GET', ruta);
      assert.notEqual(r.status, 200, `${ruta} no debe servirse`);
      assert.ok(typeof r.data !== 'string' || !/"name"\s*:\s*"three"/.test(r.data), `${ruta} filtró package.json`);
      if (ruta.startsWith('/vendor/three/') && !ruta.includes('/../')) assert.equal(r.status, 404, ruta);
    }
  });
});

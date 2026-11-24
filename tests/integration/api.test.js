// Pruebas de integración contra la app REAL + PostgreSQL (sección 5 del plan de seguridad)
// Se omiten si no hay TEST_POSTGRES_URL (ver tests/helpers/appDePrueba.js).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {
  CREDENCIALES, clienteHttp, crearUsuarios, iniciarApp, motivoParaOmitir, prepararBaseDeDatos,
} from '../helpers/appDePrueba.js';

const omitir = motivoParaOmitir();
const XSS = '<b>Prueba & "Comillas"</b><img src=x onerror=alert(1)>';

describe('API (integración)', { skip: omitir || false }, () => {
  let app;
  let admin;
  let lector;
  let hostId;
  let servidorId;

  before(async () => {
    await prepararBaseDeDatos();
    crearUsuarios();
    app = await iniciarApp();
    admin = clienteHttp(app.base);
    lector = clienteHttp(app.base);
  });

  after(async () => {
    if (app) {
      const codigo = await app.detener();
      assert.equal(codigo, 0, `apagado limpio con SIGTERM (código ${codigo})`);
    }
  });

  describe('autenticación', () => {
    test('sin sesión: la API responde 401 JSON y las páginas redirigen a /login', async () => {
      const anon = clienteHttp(app.base);
      const r = await anon.api('GET', '/api/servers');
      assert.equal(r.status, 401);
      assert.equal(typeof r.data, 'object');
      const sub = await anon.api('GET', '/api/monitoring/hosts');
      assert.equal(sub.status, 401);
      const pagina = await anon.api('GET', '/fisicos');
      assert.equal(pagina.status, 302);
      assert.match(pagina.headers.get('location'), /\/login/);
    });

    test('login incorrecto -> 401; correcto -> 200 con token CSRF', async () => {
      const malo = await clienteHttp(app.base).login({ username: 'admin', password: 'incorrecta-123' });
      assert.equal(malo.status, 401);
      const r = await admin.login(CREDENCIALES.admin);
      assert.equal(r.status, 200);
      assert.ok(r.data.csrfToken);
      assert.ok(admin.cookie.startsWith('connect.sid='));
      assert.equal((await lector.login(CREDENCIALES.lector)).status, 200);
    });

    test('cabeceras de seguridad: CSP activa sin unsafe-inline y x-request-id validado', async () => {
      const r = await admin.api('GET', '/api/auth/session', { headers: { 'x-request-id': 'id <script> con espacios' } });
      const csp = r.headers.get('content-security-policy');
      assert.ok(csp, 'falta Content-Security-Policy');
      assert.doesNotMatch(csp, /unsafe-inline/);
      assert.equal(r.headers.get('content-security-policy-report-only'), null);
      assert.match(r.headers.get('x-request-id'), /^[a-f0-9-]{36}$/, 'debe generarse un UUID nuevo');
      const valido = await admin.api('GET', '/api/auth/session', { headers: { 'x-request-id': 'prueba-123' } });
      assert.equal(valido.headers.get('x-request-id'), 'prueba-123');
    });

    test('la pantalla de login carga sus recursos sin sesión (CSP sin inline)', async () => {
      const anon = clienteHttp(app.base);
      for (const ruta of ['/login', '/js/paginas/login.js', '/fonts/fonts.css', '/css/estilos-sin-inline.css', '/login-styles.css']) {
        assert.equal((await anon.api('GET', ruta)).status, 200, ruta);
      }
      const html = (await anon.api('GET', '/login')).data;
      assert.doesNotMatch(html, /<script>(?!<\/script>)|<style|style="/, 'login.html no debe tener script/style inline');
      assert.doesNotMatch(html, /fonts\.googleapis/);
    });
  });

  describe('CSRF', () => {
    test('POST sin X-CSRF-Token -> 403 CSRF_INVALID', async () => {
      const r = await admin.api('POST', '/api/clusters', { body: { name: 'sin-token', key: 'sin-token' }, sinCsrf: true });
      assert.equal(r.status, 403);
      assert.equal(r.data.code, 'CSRF_INVALID');
    });

    test('POST con Origin de otro sitio -> 403 CSRF_ORIGIN', async () => {
      const r = await admin.api('POST', '/api/clusters', { body: { name: 'evil', key: 'evil' }, headers: { origin: 'https://evil.example.com' } });
      assert.equal(r.status, 403);
      assert.equal(r.data.code, 'CSRF_ORIGIN');
    });
  });

  describe('CRUD de inventario', () => {
    test('crear rack y servidor (con caracteres HTML guardados tal cual)', async () => {
      assert.equal((await admin.api('POST', '/api/racks', { body: { name: 'RACK-CI', raw_name: 'RACK-CI' } })).status, 201);
      const r = await admin.api('POST', '/api/servers', {
        body: { type: 'fisicos', nombre: XSS, rack_norm: 'RACK-CI', rack_raw: 'RACK-CI', rack_units: 2, rack_position: 10, ip: '10.50.0.1', storage: 'SAN-CI', estado: 'NO_CRITICO', activo: 'SI' },
      });
      assert.equal(r.status, 201);
      servidorId = r.data?.server?.id ?? r.data?.id ?? r.data?.data?.id;
      assert.ok(servidorId, 'la respuesta debe traer el id');
      const lista = await admin.api('GET', '/api/servers?type=fisicos');
      const creado = lista.data.find((s) => String(s.id) === String(servidorId));
      // La API devuelve el dato exacto: el escape se hace al pintarlo (seguridadHtml.js)
      assert.equal(creado.nombre ?? creado.name, XSS);
    });

    test('editar servidor conserva los campos que no se envían (storage)', async () => {
      const r = await admin.api('PUT', `/api/servers/${servidorId}`, { body: { type: 'fisicos', nombre: 'SRV-CI-EDITADO', rack_norm: 'RACK-CI', rack_raw: 'RACK-CI', ip: '10.50.0.2' } });
      assert.equal(r.status, 200);
      const lista = await admin.api('GET', '/api/servers?type=fisicos');
      const s = lista.data.find((x) => String(x.id) === String(servidorId));
      assert.equal(s.ip, '10.50.0.2');
      assert.equal(s.storage, 'SAN-CI');
    });

    test('/api/data incluye racks sin tipo con servidores físicos y los servidores sin rack', async () => {
      assert.equal((await admin.api('POST', '/api/racks', { body: { name: 'RACK-CI-SINTIPO', raw_name: 'RACK-CI-SINTIPO' } })).status, 201);
      const r = await admin.api('POST', '/api/servers', { body: { type: 'fisicos', nombre: 'SRV-CI-SINTIPO', rack_norm: 'RACK-CI-SINTIPO', rack_raw: 'RACK-CI-SINTIPO', ip: '10.50.0.9' } });
      assert.equal(r.status, 201);
      const bd = new pg.Client({ connectionString: process.env.TEST_POSTGRES_URL });
      await bd.connect();
      try {
        await bd.query("UPDATE inventory.racks SET type = NULL WHERE name = 'RACK-CI-SINTIPO'");
        await bd.query("INSERT INTO inventory.servers (type, identity_key, nombre, ip) VALUES ('fisicos', 'ci:sin-rack', 'SRV-CI-SINRACK', '10.50.0.10') ON CONFLICT DO NOTHING");
      } finally { await bd.end(); }
      const { data } = await admin.api('GET', '/api/data?type=fisicos');
      const rack = data.racks.find((x) => x.name === 'RACK-CI-SINTIPO');
      assert.ok(rack, 'el rack sin tipo aparece');
      assert.ok(rack.servers.some((s) => s.nombre === 'SRV-CI-SINTIPO'));
      const sinRack = data.servers.find((s) => s.nombre === 'SRV-CI-SINRACK');
      assert.ok(sinRack && sinRack.rackId == null, 'el servidor sin rack llega en servers con rackId nulo');
    });

    test('clúster duplicado -> 409 y el proceso sigue vivo', async () => {
      assert.ok([200, 201].includes((await admin.api('POST', '/api/clusters', { body: { name: 'Cluster CI', key: 'cluster-ci' } })).status));
      const dup = await admin.api('POST', '/api/clusters', { body: { name: 'Cluster CI', key: 'cluster-ci' } });
      assert.equal(dup.status, 409);
      assert.equal((await admin.api('GET', '/api/clusters/abc')).status, 400);
      assert.equal((await admin.api('GET', '/api/clusters')).status, 200);
      assert.equal(app.proceso.exitCode, null);
    });

    test('cuerpo JSON inválido -> 400 y cuerpo demasiado grande -> 413 (no 500)', async () => {
      const { data } = await admin.api('GET', '/api/auth/csrf');
      const inicioLog = app.salida().length;
      const enviar = (cuerpo) => fetch(`${app.base}/api/clusters`, {
        method: 'POST',
        headers: { cookie: admin.cookie, 'x-csrf-token': data.csrfToken, 'content-type': 'application/json' },
        body: cuerpo,
      });

      const malo = await enviar('{json roto');
      assert.equal(malo.status, 400);
      const cuerpoMalo = await malo.json();
      assert.equal(cuerpoMalo.code, 'VALIDATION_ERROR');
      assert.doesNotMatch(cuerpoMalo.error, /Unexpected|SyntaxError|position/);

      const grande = await enviar(JSON.stringify({ name: 'x'.repeat(300 * 1024) }));
      assert.equal(grande.status, 413);
      assert.equal((await grande.json()).code, 'PAYLOAD_TOO_LARGE');

      assert.doesNotMatch(app.salida().slice(inicioLog), /Error no manejado/, 'no se registran como errores no manejados');
      assert.equal(app.proceso.exitCode, null);
    });
  });

  describe('anti-SSRF en checks de monitoreo', () => {
    before(async () => {
      const r = await admin.api('POST', '/api/monitoring/hosts', { body: { name: 'srv-ci', ip: '10.60.0.1' } });
      assert.ok([200, 201].includes(r.status), `crear host -> ${r.status}`);
      hostId = r.data?.host?.id ?? r.data?.id;
    });

    for (const [nombre, cuerpo] of [
      ['HTTP a la propia app (127.0.0.1:3000)', { kind: 'http', config: { url: 'http://127.0.0.1:3000' } }],
      ['HTTP a metadatos de nube (169.254.169.254)', { kind: 'http', config: { url: 'http://169.254.169.254/latest/meta-data' } }],
      ['ICMP con host "-t"', { kind: 'icmp', config: { host: '-t' } }],
      ['TCP a localhost:5432', { kind: 'tcp', config: { host: 'localhost', port: 5432 } }],
      ['frecuencia 0', { kind: 'icmp', config: { host: '10.60.0.1' }, frequency_sec: 0 }],
    ]) {
      test(`rechaza ${nombre} -> 400`, async () => {
        const r = await admin.api('POST', '/api/monitoring/checks', { body: { host_id: hostId, ...cuerpo } });
        assert.equal(r.status, 400, JSON.stringify(r.data));
      });
    }

    test('acepta un check ICMP válido -> 201', async () => {
      const r = await admin.api('POST', '/api/monitoring/checks', { body: { host_id: hostId, kind: 'icmp', config: { host: '10.60.0.1' }, frequency_sec: 60 } });
      assert.equal(r.status, 201);
    });

    test('id no numérico -> 400 (no 500)', async () => {
      assert.equal((await admin.api('GET', '/api/monitoring/hosts/abc')).status, 400);
      assert.equal((await admin.api('GET', '/api/monitoring/incidents/abc')).status, 400);
    });
  });

  describe('RBAC: un viewer no puede modificar', () => {
    const prohibidos = () => [
      ['POST', '/api/servers', { nombre: 'x' }],
      ['PUT', `/api/servers/${servidorId}`, { nombre: 'x' }],
      ['DELETE', `/api/servers/${servidorId}`],
      ['POST', '/api/racks', { name: 'x' }],
      ['POST', '/api/clusters', { name: 'v', key: 'v' }],
      ['POST', '/api/monitoring/checks', { host_id: hostId, kind: 'icmp', config: { host: '10.60.0.1' } }],
      ['POST', '/api/monitoring/hosts', { name: 'x', ip: '10.1.1.1' }],
      ['DELETE', `/api/monitoring/hosts/${hostId}`],
      ['GET', '/api/monitoring/alert-recipients'],
      ['GET', '/users.html'],
      ['GET', '/users.js'],
    ];

    test('todas las operaciones de escritura y páginas de admin -> 403', async () => {
      for (const [metodo, ruta, body] of prohibidos()) {
        const r = await lector.api(metodo, ruta, { body });
        assert.equal(r.status, 403, `${metodo} ${ruta} -> ${r.status}`);
      }
    });

    test('el viewer sí puede leer', async () => {
      assert.equal((await lector.api('GET', '/api/servers?type=fisicos')).status, 200);
      assert.equal((await lector.api('GET', '/api/monitoring/hosts')).status, 200);
    });
  });

  describe('contraseñas y sesiones', () => {
    test('clave corta (< 8) -> 400', async () => {
      const r = await admin.api('POST', '/api/users', { body: { username: 'corto', password: 'abc1234', role: 'viewer' } });
      assert.equal(r.status, 400);
    });

    test('cambiar la clave de un usuario cierra sus otras sesiones', async () => {
      const usuarios = (await admin.api('GET', '/api/users')).data?.users || [];
      const id = usuarios.find((u) => u.username === 'lector')?.id;
      assert.ok(id);
      assert.equal((await admin.api('POST', `/api/users/${id}/change-password`, { body: { password: 'Nueva-Clave-CI-2026' } })).status, 200);
      assert.equal((await lector.api('GET', '/api/auth/user')).status, 401);
      assert.equal((await admin.api('GET', '/api/auth/user')).status, 200);
    });

    test('logout invalida la sesión', async () => {
      const cookieAntes = admin.cookie;
      assert.equal((await admin.api('POST', '/api/auth/logout')).status, 200);
      const r = await clienteHttp(app.base).api('GET', '/api/meta', { headers: { cookie: cookieAntes } });
      assert.equal(r.status, 401);
    });
  });
});

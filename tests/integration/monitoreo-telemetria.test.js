// Integración de la telemetría de Monitoreo: resumen en vivo por host y serie por check
// (validación de parámetros, límites, RBAC de lectura y forma de la respuesta).
// App REAL + PostgreSQL; se omite si no hay TEST_POSTGRES_URL (tests/helpers/appDePrueba.js).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {
  CREDENCIALES, URL_BD, clienteHttp, crearUsuarios, iniciarApp, motivoParaOmitir, prepararBaseDeDatos,
} from '../helpers/appDePrueba.js';

const omitir = motivoParaOmitir();

describe('Monitoreo: telemetría en tiempo real (integración)', { skip: omitir || false }, () => {
  let app;
  let admin;
  let lector;
  let anonimo;
  let bd;
  let idHost;
  let idCheckTcp;

  before(async () => {
    await prepararBaseDeDatos();
    crearUsuarios();
    bd = new pg.Client({ connectionString: URL_BD });
    await bd.connect();
    idHost = (await bd.query(`INSERT INTO monitoring.hosts (name, ip, type, rack, critical, estado_actual)
      VALUES ('srv-app-01', '10.0.0.11', 'fisico', 'RACK-A1', TRUE, 'UP') RETURNING id`)).rows[0].id;
    await bd.query(`INSERT INTO monitoring.hosts (name, ip, type, rack, estado_actual)
      VALUES ('srv-web-01', '10.0.0.21', 'virtual', 'srv-hv-01', 'DOWN')`);
    idCheckTcp = (await bd.query(`INSERT INTO monitoring.checks (host_id, kind, config, enabled)
      VALUES ($1, 'tcp', '{"host":"10.0.0.11","port":443}', FALSE) RETURNING id`, [idHost])).rows[0].id;
    const idCheckHttp = (await bd.query(`INSERT INTO monitoring.checks (host_id, kind, config, enabled)
      VALUES ($1, 'http', '{"url":"http://app.ejemplo.local/salud","expectCode":200}', FALSE) RETURNING id`, [idHost])).rows[0].id;
    // 150 ejecuciones del check TCP (una por minuto hacia atrás, la 10 falla) y 3 del HTTP
    await bd.query(`INSERT INTO monitoring.check_runs (time, check_id, host_id, status, latency_ms)
      SELECT NOW() - make_interval(mins => g), $1, $2,
             (CASE WHEN g = 10 THEN 'fail' ELSE 'ok' END)::monitoring.run_status_enum,
             CASE WHEN g = 10 THEN NULL ELSE 20 + (g % 7) END
        FROM generate_series(0, 149) g`, [idCheckTcp, idHost]);
    await bd.query(`INSERT INTO monitoring.check_runs (time, check_id, host_id, status, latency_ms)
      SELECT NOW() - make_interval(mins => g), $1, $2, 'ok', 50 FROM generate_series(0, 2) g`, [idCheckHttp, idHost]);
    const idInc = (await bd.query(`INSERT INTO monitoring.incidents (host_id, severity, state, summary)
      VALUES ($1, 'critical', 'ack', 'Sin respuesta en el puerto 443') RETURNING id`, [idHost])).rows[0].id;
    await bd.query(`INSERT INTO monitoring.incident_events (incident_id, type, payload) VALUES ($1, 'ack', '{}')`, [idInc]);

    app = await iniciarApp();
    admin = clienteHttp(app.base);
    lector = clienteHttp(app.base);
    anonimo = clienteHttp(app.base);
    assert.equal((await admin.login(CREDENCIALES.admin)).status, 200);
    assert.equal((await lector.login(CREDENCIALES.lector)).status, 200);
  });

  after(async () => {
    await bd?.end();
    if (app) await app.detener();
  });

  test('sin sesión: ambos endpoints responden 401', async () => {
    assert.equal((await anonimo.api('GET', '/api/monitoring/telemetry/overview')).status, 401);
    assert.equal((await anonimo.api('GET', `/api/monitoring/telemetry/hosts/${idHost}/series`)).status, 401);
  });

  test('overview: el lector ve cada host con su estado y una mini-serie limitada', async () => {
    const r = await lector.api('GET', '/api/monitoring/telemetry/overview?points=12');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.data.points, 12);
    assert.equal(r.data.hosts.length, 2);
    const h = r.data.hosts.find((x) => x.name === 'srv-app-01');
    assert.equal(h.rack, 'RACK-A1');
    assert.equal(h.ip, '10.0.0.11');
    assert.equal(h.estado_actual, 'UP');
    assert.equal(h.open_incidents, 1, 'cuenta incidentes abiertos y reconocidos');
    assert.equal(h.serie.length, 12);
    // Orden cronológico ascendente, puntos [epoch_ms, latencia, estado]
    for (let i = 1; i < h.serie.length; i += 1) assert.ok(h.serie[i][0] >= h.serie[i - 1][0]);
    assert.equal(typeof h.serie[0][0], 'number');
    const sinDatos = r.data.hosts.find((x) => x.name === 'srv-web-01');
    assert.deepEqual(sinDatos.serie, []);
  });

  test('overview: valida points (rango y formato)', async () => {
    for (const q of ['points=0', 'points=61', 'points=abc', 'points=-3', 'points=1.5']) {
      const r = await lector.api('GET', `/api/monitoring/telemetry/overview?${q}`);
      assert.equal(r.status, 400, q);
      assert.ok(!/select|relation|column/i.test(JSON.stringify(r.data)), 'sin detalle de SQL');
    }
  });

  test('series: por check, con ventana y límite; incidentes con fecha de ACK', async () => {
    const r = await lector.api('GET', `/api/monitoring/telemetry/hosts/${idHost}/series?minutes=120&limit=100`);
    assert.equal(r.status, 200);
    assert.equal(r.data.minutes, 120);
    assert.equal(r.data.limit, 100);
    assert.equal(r.data.host.name, 'srv-app-01');
    assert.equal(r.data.checks.length, 2);
    const tcp = r.data.checks.find((c) => c.id === String(idCheckTcp) || Number(c.id) === Number(idCheckTcp));
    assert.equal(tcp.label, 'TCP 443');
    assert.equal(tcp.points.length, 100, 'respeta el límite de puntos');
    assert.ok(tcp.points.some((p) => p[2] === 'fail' && p[1] === null));
    assert.ok(!('config' in tcp), 'no expone la configuración completa del check');
    const http = r.data.checks.find((c) => c.kind === 'http');
    assert.equal(http.label, 'HTTP /salud');
    assert.equal(http.points.length, 3);
    assert.equal(r.data.incidents.length, 1);
    assert.equal(r.data.incidents[0].state, 'ack');
    assert.ok(r.data.incidents[0].ack_at);

    const corta = await lector.api('GET', `/api/monitoring/telemetry/hosts/${idHost}/series?minutes=5`);
    assert.equal(corta.status, 200);
    const puntosTcp = corta.data.checks.find((c) => c.kind === 'tcp').points.length;
    assert.ok(puntosTcp >= 5 && puntosTcp <= 6, `ventana de 5 min: ${puntosTcp}`);
  });

  test('series: valida id, minutes y limit; host inexistente da 404', async () => {
    const casos = [
      ['abc/series', 400], ['0/series', 400], ['1e3/series', 400],
      [`${idHost}/series?minutes=4`, 400], [`${idHost}/series?minutes=1441`, 400],
      [`${idHost}/series?limit=9`, 400], [`${idHost}/series?limit=301`, 400], [`${idHost}/series?limit=x`, 400],
      ['999999/series', 404],
    ];
    for (const [ruta, esperado] of casos) {
      const r = await admin.api('GET', `/api/monitoring/telemetry/hosts/${ruta}`);
      assert.equal(r.status, esperado, ruta);
      assert.ok(!/select|relation|column|syntax/i.test(JSON.stringify(r.data)), `sin detalle de SQL en ${ruta}`);
    }
  });

  test('mantenimiento: valida la duración y el lector no puede activarlo', async () => {
    assert.equal((await lector.api('POST', `/api/monitoring/hosts/${idHost}/maintenance`, { body: { duration_hours: 1 } })).status, 403);
    for (const duration_hours of ['x', 0, -1, 500]) {
      const r = await admin.api('POST', `/api/monitoring/hosts/${idHost}/maintenance`, { body: { duration_hours } });
      assert.equal(r.status, 400, String(duration_hours));
    }
    const ok = await admin.api('POST', `/api/monitoring/hosts/${idHost}/maintenance`, { body: { duration_hours: 2, comment: 'Cambio de disco' } });
    assert.equal(ok.status, 200);
    const ov = await lector.api('GET', '/api/monitoring/telemetry/overview');
    assert.equal(ov.data.hosts.find((x) => x.name === 'srv-app-01').estado_actual, 'MAINTENANCE');
    assert.equal((await admin.api('DELETE', `/api/monitoring/hosts/${idHost}/maintenance`)).status, 200);
  });
});

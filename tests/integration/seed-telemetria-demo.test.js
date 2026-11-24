// Telemetría de demostración del seed: 24 h de ejecuciones por host demo, idempotente,
// fallos en el host DOWN, sin activar checks ni tocar datos reales, y borrado con --borrar.
// PostgreSQL real; se omite si no hay TEST_POSTGRES_URL (tests/helpers/appDePrueba.js).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { URL_BD, motivoParaOmitir, prepararBaseDeDatos } from '../helpers/appDePrueba.js';
import { completarTelemetria, puntoDemo, azar, PASO_CONTINUO_SEG } from '../../scripts/lib/telemetriaDemo.js';

const omitir = motivoParaOmitir();
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function seed(...args) {
  const r = spawnSync(process.execPath, ['scripts/seed-demo-topologia.js', ...args], {
    cwd: RAIZ, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, POSTGRES_URL: URL_BD, DATABASE_URL: URL_BD, LOG_LEVEL: 'error' },
  });
  assert.equal(r.status, 0, `seed ${args.join(' ')} falló:\n${r.stderr}\n${r.stdout}`);
  return r.stdout;
}

test('puntoDemo: determinista, fallos solo en los últimos minutos del host DOWN', () => {
  const ahora = Date.UTC(2026, 10, 24, 12, 0, 0);
  assert.equal(azar('x'), azar('x'));
  assert.deepEqual(puntoDemo('srv-app-01', 'UP', ahora - 60000, ahora), puntoDemo('srv-app-01', 'UP', ahora - 60000, ahora));
  const recientes = Array.from({ length: 30 }, (_, i) => puntoDemo('srv-db-01', 'DOWN', ahora - i * 60000, ahora));
  assert.ok(recientes.every((p) => p.status !== 'ok'), 'el host caído no responde en los últimos minutos');
  const antiguos = Array.from({ length: 200 }, (_, i) => puntoDemo('srv-db-01', 'DOWN', ahora - (3 * 3600 + i * 60) * 1000, ahora));
  assert.ok(antiguos.filter((p) => p.status === 'ok').length > 180, 'antes de la caída respondía');
  const deg = Array.from({ length: 500 }, (_, i) => puntoDemo('srv-bkp-01', 'DEGRADED', ahora - i * 60000, ahora));
  assert.ok(deg.some((p) => p.status === 'degraded') && deg.some((p) => p.status === 'ok'));
  for (const p of deg) if (p.status === 'ok') assert.ok(p.latency >= 1 && p.latency < 1000);
});

describe('Seed: telemetría de demostración (integración)', { skip: omitir || false }, () => {
  let bd;
  const q = async (sql, p = []) => (await bd.query(sql, p)).rows;

  before(async () => {
    await prepararBaseDeDatos();
    bd = new pg.Client({ connectionString: URL_BD });
    await bd.connect();
    // Un host "real" con un check y una ejecución: el seed no debe tocarlos
    const h = (await q("INSERT INTO monitoring.hosts (name, ip, type) VALUES ('srv-propio-01', '10.0.0.200', 'fisico') RETURNING id"))[0].id;
    const c = (await q("INSERT INTO monitoring.checks (host_id, kind, config, enabled) VALUES ($1, 'tcp', '{\"host\":\"10.0.0.200\",\"port\":22}', FALSE) RETURNING id", [h]))[0].id;
    await q("INSERT INTO monitoring.check_runs (time, check_id, host_id, status, latency_ms) VALUES (NOW(), $1, $2, 'ok', 5)", [c, h]);
  });

  after(async () => { await bd?.end(); });

  test('genera ~24 h por host demo sin activar checks y es idempotente', async () => {
    assert.match(seed(), /Telemetría de demostración: \d+ ejecuciones nuevas/);
    const porHost = await q(`SELECT h.name, COUNT(*)::int n, MIN(r.time) desde, BOOL_AND(r.sample->>'demo' = 'true') demo
      FROM monitoring.check_runs r JOIN monitoring.hosts h ON h.id = r.host_id
      WHERE 'demo-topologia' = ANY(h.group_tags) GROUP BY h.name`);
    assert.equal(porHost.length, 30);
    for (const f of porHost) {
      assert.ok(f.n >= 1430 && f.n <= 1442, `${f.name}: ${f.n} puntos`);
      assert.ok(f.demo);
    }
    const activos = await q("SELECT COUNT(*)::int n FROM monitoring.checks c JOIN monitoring.hosts h ON h.id = c.host_id WHERE 'demo-topologia' = ANY(h.group_tags) AND c.enabled");
    assert.equal(activos[0].n, 0, 'los checks demo siguen desactivados');
    const caido = await q(`SELECT r.status FROM monitoring.check_runs r JOIN monitoring.hosts h ON h.id = r.host_id
      WHERE h.name = 'srv-db-01' ORDER BY r.time DESC LIMIT 10`);
    assert.ok(caido.every((f) => f.status !== 'ok'));
    const estados = await q("SELECT name, estado_actual FROM monitoring.hosts WHERE name IN ('srv-db-01', 'srv-bkp-01') ORDER BY name");
    assert.deepEqual(estados.map((e) => e.estado_actual), ['DEGRADED', 'DOWN']);

    const total = async () => (await q('SELECT COUNT(*)::int n FROM monitoring.check_runs'))[0].n;
    const antes = await total();
    seed();
    assert.ok((await total()) - antes <= 30 * 3, 'una segunda ejecución solo completa los minutos transcurridos');
  });

  test('modo continuo: añade un punto por host demo en cada paso', async () => {
    const antes = (await q('SELECT COUNT(*)::int n FROM monitoring.check_runs'))[0].n;
    // Instante fijo: 60 s después de la última ejecución de cada host → exactamente 4 puntos por host
    const ultimas = await q(`SELECT DISTINCT MAX(r.time) AS t FROM monitoring.check_runs r JOIN monitoring.hosts h ON h.id = r.host_id
      WHERE 'demo-topologia' = ANY(h.group_tags) GROUP BY r.host_id`);
    assert.equal(ultimas.length, 1, 'todos los hosts demo terminan en el mismo instante');
    const n = await completarTelemetria(bd, { marca: 'demo-topologia', pasoSeg: PASO_CONTINUO_SEG, ahora: new Date(ultimas[0].t).getTime() + 60000 });
    assert.equal(n, 30 * (60 / PASO_CONTINUO_SEG), `insertadas: ${n}`);
    assert.equal((await q('SELECT COUNT(*)::int n FROM monitoring.check_runs'))[0].n, antes + n);
  });

  test('--borrar elimina la telemetría demo y conserva la real', async () => {
    seed('--borrar');
    const demo = await q("SELECT COUNT(*)::int n FROM monitoring.check_runs WHERE sample->>'demo' = 'true'");
    assert.equal(demo[0].n, 0);
    const real = await q("SELECT COUNT(*)::int n FROM monitoring.check_runs r JOIN monitoring.hosts h ON h.id = r.host_id WHERE h.name = 'srv-propio-01'");
    assert.equal(real[0].n, 1);
  });
});

// Base de datos existente (como la que se entregará): actualización con scripts/actualizar-bd.js
// sobre un esquema anterior con datos propios (sin datos de demostración), y la aplicación
// funcionando con esos datos y con la base vacía. App REAL + PostgreSQL; se omite sin
// TEST_POSTGRES_URL (tests/helpers/appDePrueba.js).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  CREDENCIALES, URL_BD, clienteHttp, crearUsuarios, iniciarApp, motivoParaOmitir,
} from '../helpers/appDePrueba.js';
import { actualizar, revisar } from '../../scripts/actualizar-bd.js';

const omitir = motivoParaOmitir();
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOM = String.fromCharCode(0xFEFF);

/** Esquema "anterior": sin tablas de impacto de servicios, sin posición en rack ni campos añadidos después */
async function crearEsquemaAnterior(bd) {
  await bd.query('DROP SCHEMA IF EXISTS inventory, monitoring, users CASCADE');
  for (const f of ['00-init.sql', '01-schema.inventory.sql', '02-schema.monitoring.sql', '03-schema.users.sql', '04-schema.clusters.sql', '07-schema.sessions.sql']) {
    await bd.query(fs.readFileSync(path.join(RAIZ, 'scripts', 'sql', f), 'utf8').replace(BOM, ''));
  }
  await bd.query('ALTER TABLE inventory.racks DROP COLUMN type');
  await bd.query('ALTER TABLE inventory.servers DROP COLUMN storage, DROP COLUMN zabbix');
  await bd.query('DROP INDEX monitoring.check_runs_check_time_idx');
  await bd.query('SET search_path TO DEFAULT');
}

/** Datos variados como los de un inventario real (formatos irregulares, huecos, sin cruces) */
async function cargarDatosPropios(bd) {
  await bd.query(`INSERT INTO inventory.racks (name, raw_name) VALUES ('Rack 1', 'Rack 1'), ('RACK ESXI-01', NULL), ('rack sin servidores', NULL)`);
  await bd.query(`
    INSERT INTO inventory.servers (type, identity_key, rack_id, rack_norm, nombre, ip, estado, hostname)
    SELECT 'fisicos', 'f-' || g, CASE WHEN g % 5 = 0 THEN NULL ELSE (SELECT id FROM inventory.racks WHERE name = 'Rack 1') END,
           CASE WHEN g % 5 = 0 THEN NULL ELSE 'Rack 1' END,
           CASE WHEN g % 7 = 0 THEN NULL ELSE 'SRV-FIS-' || g END,
           CASE g % 4 WHEN 0 THEN '10.0.0.' || g || ' / 10.0.1.' || g WHEN 1 THEN NULL WHEN 2 THEN '0.0.0.0' ELSE '10.0.0.' || g END,
           CASE g % 3 WHEN 0 THEN 'CRITICO' WHEN 1 THEN NULL ELSE 'cualquier texto' END,
           'host-' || g
      FROM generate_series(1, 400) g`);
  await bd.query(`
    INSERT INTO inventory.servers (type, identity_key, rack_norm, nombre, ip)
    SELECT 'virtuales', 'v-' || g, CASE WHEN g % 3 = 0 THEN NULL ELSE 'ESXI-0' || (g % 4) END, 'vm-' || g, '10.0.2.' || (g % 250)
      FROM generate_series(1, 600) g`);
  // Monitoreo: hosts que no cruzan con el inventario, uno sin rack y sin IP, con historial
  await bd.query(`
    INSERT INTO monitoring.hosts (name, ip, type, rack, estado_actual)
    VALUES ('equipo-externo', '10.9.9.9', 'fisico', 'Rack 1', 'UP'), ('sin-rack', NULL, 'virtual', NULL, 'UNKNOWN')`);
  await bd.query(`INSERT INTO monitoring.checks (host_id, kind, config, enabled)
    SELECT id, 'icmp', '{"host":"10.9.9.9"}', FALSE FROM monitoring.hosts WHERE name = 'equipo-externo'`);
  await bd.query(`INSERT INTO monitoring.check_runs (time, check_id, host_id, status, latency_ms)
    SELECT NOW() - make_interval(mins => g), c.id, c.host_id, 'ok', 5 + g % 9
      FROM monitoring.checks c, generate_series(0, 200) g`);
}

describe('Base de datos existente (integración)', { skip: omitir || false }, () => {
  let bd;
  let app;
  let admin;
  let lector;

  before(async () => {
    bd = new pg.Client({ connectionString: URL_BD });
    await bd.connect();
    await crearEsquemaAnterior(bd);
    await cargarDatosPropios(bd);
  });

  after(async () => {
    if (app) await app.detener();
    await bd?.end();
  });

  test('revisión sin --aplicar: informa lo que falta y no cambia nada', async () => {
    const faltan = await revisar(bd);
    for (const esperado of ['tabla inventory.services', 'tabla inventory.service_components', 'columna inventory.servers.rack_position',
      'columna inventory.racks.type', 'columna inventory.servers.zabbix', 'índice monitoring.check_runs_check_time_idx']) {
      assert.ok(faltan.includes(esperado), `debería faltar ${esperado}: ${faltan.join(', ')}`);
    }
    const r = spawnSync(process.execPath, ['scripts/actualizar-bd.js'], {
      cwd: RAIZ, encoding: 'utf8', timeout: 60000, env: { ...process.env, DATABASE_URL: URL_BD, POSTGRES_URL: URL_BD },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Faltan \d+ elementos/);
    assert.deepEqual(await revisar(bd), faltan, 'sin --aplicar no se modifica la base');
  });

  test('--aplicar completa el esquema sin perder filas y es idempotente', async () => {
    const r1 = await actualizar(bd, { aplicar: true, log: () => {} });
    assert.deepEqual(r1.faltanDespues, []);
    for (const [tabla, n] of Object.entries(r1.antes)) assert.equal(r1.despues[tabla], n, `filas de ${tabla}`);
    assert.equal(r1.despues['inventory.servers'], 1000);
    assert.equal(r1.despues['monitoring.check_runs'], 201);

    const r = spawnSync(process.execPath, ['scripts/actualizar-bd.js', '--aplicar'], {
      cwd: RAIZ, encoding: 'utf8', timeout: 60000, env: { ...process.env, DATABASE_URL: URL_BD, POSTGRES_URL: URL_BD },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Verificación correcta/);
    const r2 = await actualizar(bd, { aplicar: false });
    assert.deepEqual(r2.antes, r1.despues, 'una segunda ejecución no cambia los datos');
    assert.deepEqual(r2.faltabanAntes, []);
  });

  test('con los datos propios (sin demo) todas las páginas y APIs responden sin error', async () => {
    crearUsuarios();
    app = await iniciarApp();
    admin = clienteHttp(app.base);
    lector = clienteHttp(app.base);
    assert.equal((await admin.login(CREDENCIALES.admin)).status, 200);
    assert.equal((await lector.login(CREDENCIALES.lector)).status, 200);

    for (const ruta of ['/', '/fisicos', '/virtuales', '/impacto', '/monitoring.html', '/users']) {
      const r = await admin.api('GET', ruta);
      assert.equal(r.status, 200, ruta);
    }
    const panorama = await lector.api('GET', '/api/impacto');
    assert.equal(panorama.status, 200);
    assert.equal(panorama.data.servers.length, 1000);
    assert.ok(panorama.data.servers.every((n) => typeof n.name === 'string' && n.name.trim()), 'todo servidor tiene un nombre visible (aunque no tenga "nombre")');
    assert.ok(panorama.data.servers.find((n) => n.name === 'host-7'), 'sin nombre se usa el hostname');
    assert.deepEqual(panorama.data.services, []);
    for (const ruta of ['/api/data', '/api/racks', '/api/clusters', '/api/impacto/servidores', '/api/monitoring/dashboard', '/api/monitoring/hosts', '/api/monitoring/incidents', '/api/monitoring/checks']) {
      const r = await lector.api('GET', ruta);
      assert.equal(r.status, 200, `${ruta}: ${JSON.stringify(r.data).slice(0, 200)}`);
    }
    const ov = await lector.api('GET', '/api/monitoring/telemetry/overview');
    assert.equal(ov.status, 200);
    assert.equal(ov.data.hosts.length, 2);
    const externo = ov.data.hosts.find((h) => h.name === 'equipo-externo');
    assert.equal(externo.serie.length, 24);
    const serie = await lector.api('GET', `/api/monitoring/telemetry/hosts/${externo.id}/series?minutes=240`);
    assert.equal(serie.status, 200);
    assert.equal(serie.data.checks[0].points.length, 120);
    const unServidor = (await bd.query("SELECT id FROM inventory.servers WHERE nombre IS NULL LIMIT 1")).rows[0].id;
    assert.equal((await lector.api('GET', `/api/impacto/simular?ids=${unServidor}`)).status, 200);
  });

  test('con la base vacía (sin servidores ni monitoreo) todo responde con listas vacías', async () => {
    await bd.query('TRUNCATE inventory.servers, inventory.racks, monitoring.hosts, inventory.services CASCADE');
    const panorama = await lector.api('GET', '/api/impacto');
    assert.equal(panorama.status, 200);
    assert.deepEqual([panorama.data.servers.length, panorama.data.services.length], [0, 0]);
    const ov = await lector.api('GET', '/api/monitoring/telemetry/overview');
    assert.equal(ov.status, 200);
    assert.deepEqual(ov.data.hosts, []);
    for (const ruta of ['/api/data', '/api/racks', '/api/impacto/servidores', '/api/monitoring/dashboard', '/api/monitoring/hosts']) {
      assert.equal((await lector.api('GET', ruta)).status, 200, ruta);
    }
    for (const ruta of ['/', '/fisicos', '/virtuales', '/impacto', '/monitoring.html']) {
      assert.equal((await admin.api('GET', ruta)).status, 200, ruta);
    }
  });
});

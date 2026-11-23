// Integración del Mapa de Dependencias (Fase 3): datos de demostración (idempotencia y
// borrado selectivo), ciclo de vida de una vista (renombrar y eliminar con sus posiciones)
// y bloque "Dependencias e impacto" del detalle de servidor. App REAL + PostgreSQL;
// se omite si no hay TEST_POSTGRES_URL (tests/helpers/appDePrueba.js).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { colocarEnRack } from '../../frontend/public/js/dominios/hosts/colocacionRack.js';
import {
  CREDENCIALES, URL_BD, clienteHttp, crearUsuarios, iniciarApp, motivoParaOmitir, prepararBaseDeDatos,
} from '../helpers/appDePrueba.js';

const omitir = motivoParaOmitir();
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function seed(...args) {
  const r = spawnSync(process.execPath, ['scripts/seed-demo-topologia.js', ...args], {
    cwd: RAIZ, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, POSTGRES_URL: URL_BD, DATABASE_URL: URL_BD, LOG_LEVEL: 'error' },
  });
  assert.equal(r.status, 0, `seed ${args.join(' ')} falló:\n${r.stderr}\n${r.stdout}`);
  return r.stdout;
}

describe('Mapa de Dependencias, Fase 3 (integración)', { skip: omitir || false }, () => {
  let app;
  let admin;
  let lector;
  let bd;

  const contar = async () => {
    const q = async (sql) => Number((await bd.query(sql)).rows[0].n);
    return {
      servidores: await q("SELECT COUNT(*) n FROM inventory.servers WHERE identity_key LIKE 'demo-topologia:%'"),
      relaciones: await q("SELECT COUNT(*) n FROM inventory.server_dependencies WHERE created_by = 'demo-topologia'"),
      hosts: await q("SELECT COUNT(*) n FROM monitoring.hosts WHERE 'demo-topologia' = ANY(group_tags)"),
      checksActivos: await q("SELECT COUNT(*) n FROM monitoring.checks c JOIN monitoring.hosts h ON h.id = c.host_id WHERE 'demo-topologia' = ANY(h.group_tags) AND c.enabled"),
      racks: await q("SELECT COUNT(*) n FROM inventory.racks WHERE raw_name = 'demo-topologia'"),
      posiciones: await q('SELECT COUNT(*) n FROM inventory.topology_node_positions'),
    };
  };

  before(async () => {
    await prepararBaseDeDatos();
    crearUsuarios();
    bd = new pg.Client({ connectionString: URL_BD });
    await bd.connect();
    // Datos "reales" previos: un rack con el mismo nombre que uno del seed y un servidor propio
    await bd.query("INSERT INTO inventory.racks (name, raw_name, type) VALUES ('RACK-A1', 'RACK-A1', 'fisicos')");
    await bd.query(`INSERT INTO inventory.servers (type, identity_key, rack_id, rack_norm, nombre, ip)
      SELECT 'fisicos', '10.0.0.200', id, 'RACK-A1', 'srv-propio-01', '10.0.0.200' FROM inventory.racks WHERE name = 'RACK-A1'`);
    app = await iniciarApp();
    admin = clienteHttp(app.base);
    lector = clienteHttp(app.base);
    assert.equal((await admin.login(CREDENCIALES.admin)).status, 200);
    assert.equal((await lector.login(CREDENCIALES.lector)).status, 200);
  });

  after(async () => {
    await bd?.end();
    if (app) await app.detener();
  });

  test('seed: crea los datos marcados y una segunda ejecución no duplica nada', async () => {
    assert.match(seed(), /Datos de demostración creados/);
    const primera = await contar();
    assert.equal(primera.servidores, 30);
    assert.ok(primera.relaciones >= 20, `relaciones: ${primera.relaciones}`);
    assert.equal(primera.hosts, 30);
    assert.equal(primera.checksActivos, 0, 'los checks de los hosts demo deben quedar desactivados');
    assert.equal(primera.posiciones, 16);
    // RACK-A1 ya existía: se reutiliza y no se marca
    assert.equal(primera.racks, 7);

    assert.match(seed(), /ya estaban cargados/);
    assert.deepEqual(await contar(), primera);
  });

  test('seed: cinco racks de 42U con equipos de 1U, 2U y 4U en su unidad (como la vista de rack)', async () => {
    const { status, data } = await lector.api('GET', '/api/data?type=fisicos');
    assert.equal(status, 200);
    const racks = data.racks.filter((r) => /^RACK-A[1-5]$/.test(r.name));
    assert.deepEqual(racks.map((r) => r.name).sort(), ['RACK-A1', 'RACK-A2', 'RACK-A3', 'RACK-A4', 'RACK-A5']);
    const a3 = racks.find((r) => r.name === 'RACK-A3');
    const col = colocarEnRack(a3.servers);
    const nas = col.bloques.find((b) => b.servidor.nombre === 'srv-nas-01');
    assert.deepEqual([nas.uInferior, nas.uSuperior], [21, 24]);
    assert.equal(col.ocupadas, 14);
    // El equipo sin posición ocupa el primer hueco libre
    const a5 = colocarEnRack(racks.find((r) => r.name === 'RACK-A5').servers.filter((s) => s.nombre.startsWith('srv-')));
    const pru = a5.bloques.find((b) => b.servidor.nombre === 'srv-pru-01');
    assert.deepEqual([pru.uInferior, pru.uSuperior], [41, 42]);
    const tamanos = new Set(data.servers.filter((s) => String(s.nombre).startsWith('srv-')).map((s) => s.rackUnits));
    for (const u of [1, 2, 4]) assert.ok(tamanos.has(u), `hay equipos de ${u}U`);
    // La sala 3D pide el grafo con todos los servidores: los del rack sin relaciones también vienen
    const g = await lector.api('GET', '/api/topology/graph?includeIsolated=true');
    assert.ok(g.data.nodes.some((n) => n.name === 'srv-pru-01' && n.status === 'UP'));
  });

  test('seed: el mapa muestra el ciclo, la cadena y el impacto real de los hosts DOWN y DEGRADED', async () => {
    const { status, data } = await lector.api('GET', '/api/topology/graph');
    assert.equal(status, 200);
    const id = Object.fromEntries(data.nodes.map((n) => [n.name, String(n.id)]));
    const arista = (a, b) => data.edges.find((e) => String(e.source) === id[a] && String(e.target) === id[b]);
    // Ciclo web <-> api y cadena api -> db
    assert.equal(arista('srv-web-01', 'srv-api-01')?.isBidirectionalPair, true);
    assert.equal(arista('srv-api-01', 'srv-web-01')?.isBidirectionalPair, true);
    assert.ok(arista('srv-api-01', 'srv-db-01'));
    // Impacto real: raíces DOWN y DEGRADED
    const raices = data.impact.rootIds.map(String).sort();
    assert.deepEqual(raices, [id['srv-bkp-01'], id['srv-db-01']].sort());
    const nodo = (n) => data.nodes.find((x) => x.name === n);
    assert.equal(nodo('srv-api-01').cascadeStatus, 'DIRECT_IMPACT');
    assert.equal(nodo('srv-web-01').cascadeStatus, 'TRANSITIVE_IMPACT');
    // Cada servidor tiene posición en la vista predeterminada
    for (const n of data.nodes.filter((x) => x.name !== 'srv-propio-01')) assert.ok(n.position, `${n.name} sin posición`);
  });

  test('detalle de servidor: el análisis de impacto alimenta el bloque "Dependencias e impacto"', async () => {
    const { data: g } = await lector.api('GET', '/api/topology/graph');
    const db = g.nodes.find((n) => n.name === 'srv-db-01');
    const r = await lector.api('GET', `/api/dependencies/server/${db.id}/impact`);
    assert.equal(r.status, 200);
    assert.equal(r.data.server.status, 'DOWN');
    assert.deepEqual(r.data.dependsOnDirect.map((s) => s.name), ['srv-nas-01']);
    assert.ok(r.data.dependentsDirect.some((s) => s.name === 'srv-api-01' && s.dependencies.length === 1));
    assert.ok(r.data.dependentsTransitive.some((s) => s.name === 'srv-web-01'));
    assert.equal(r.data.totalAffected, r.data.dependentsDirect.length + r.data.dependentsTransitive.length);
  });

  test('páginas /fisicos y /virtuales cargan el bloque sin código inline', async () => {
    for (const ruta of ['/fisicos', '/virtuales']) {
      const r = await lector.api('GET', ruta);
      assert.equal(r.status, 200, ruta);
      assert.match(r.data, /href="\/css\/dependencias-detalle\.css"/);
      assert.doesNotMatch(r.data, /<style[\s>]/i);
      assert.doesNotMatch(r.data, /\sstyle="/i);
      assert.doesNotMatch(r.data, /\son[a-z]+="/i);
    }
    const js = await lector.api('GET', '/js/dominios/topologia/bloqueDependenciasServidor.js');
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);
    assert.doesNotMatch(js.data, /\.innerHTML\s*=/);
    assert.equal((await lector.api('GET', '/css/dependencias-detalle.css')).status, 200);
  });

  test('vistas: renombrar conserva el slug y eliminar borra sus posiciones; el lector no puede', async () => {
    const { data: g } = await admin.api('GET', '/api/topology/graph');
    const unId = g.nodes[0].id;
    const creada = await admin.api('POST', '/api/topology/views', { body: { name: 'Demo temporal' } });
    assert.equal(creada.status, 201);
    const vista = creada.data.view;
    assert.equal((await admin.api('PUT', `/api/topology/views/${vista.id}/positions`, { body: { positions: [{ serverId: unId, x: 10, y: 20 }] } })).status, 200);

    assert.equal((await lector.api('PUT', `/api/topology/views/${vista.id}`, { body: { name: 'X' } })).status, 403);
    const renombrada = await admin.api('PUT', `/api/topology/views/${vista.id}`, { body: { name: 'Demo renombrada', description: 'Prueba' } });
    assert.equal(renombrada.status, 200);
    assert.equal(renombrada.data.view.name, 'Demo renombrada');
    assert.equal(renombrada.data.view.slug, vista.slug);

    assert.equal((await lector.api('DELETE', `/api/topology/views/${vista.id}`)).status, 403);
    assert.equal((await admin.api('DELETE', `/api/topology/views/${vista.id}`)).status, 200);
    const quedan = Number((await bd.query('SELECT COUNT(*) n FROM inventory.topology_node_positions WHERE view_id = $1', [vista.id])).rows[0].n);
    assert.equal(quedan, 0);
    const lista = await admin.api('GET', '/api/topology/views');
    assert.ok(!lista.data.views.some((v) => String(v.id) === String(vista.id)));
  });

  test('seed --borrar elimina solo lo marcado y deja intactos los datos propios', async () => {
    assert.match(seed('--borrar'), /eliminados: 30 servidores/);
    const despues = await contar();
    assert.deepEqual(
      { s: despues.servidores, r: despues.relaciones, h: despues.hosts, k: despues.racks, p: despues.posiciones },
      { s: 0, r: 0, h: 0, k: 0, p: 0 });
    const propio = await bd.query("SELECT s.nombre, r.name FROM inventory.servers s JOIN inventory.racks r ON r.id = s.rack_id WHERE s.nombre = 'srv-propio-01'");
    assert.deepEqual(propio.rows, [{ nombre: 'srv-propio-01', name: 'RACK-A1' }]);
    // Se puede volver a sembrar después de borrar
    assert.match(seed(), /Datos de demostración creados/);
    assert.equal((await contar()).servidores, 30);
  });
});

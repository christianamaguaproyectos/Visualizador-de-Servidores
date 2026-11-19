// Integración del Mapa de Dependencias y Topología (Fase 1, sección 3.4 del plan) contra
// la app REAL + PostgreSQL. Se omite si no hay TEST_POSTGRES_URL (tests/helpers/appDePrueba.js).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {
  CREDENCIALES, URL_BD, clienteHttp, crearUsuarios, iniciarApp, motivoParaOmitir, prepararBaseDeDatos,
} from '../helpers/appDePrueba.js';

const omitir = motivoParaOmitir();

describe('Dependencias y topología (integración)', { skip: omitir || false }, () => {
  let app;
  let admin;
  let lector;
  const S = {}; // S.s1, S.s2, S.s3 = ids de servidores
  const dep = {}; // ids de dependencias
  let vistaGeneral;

  async function crearServidor(nombre, ip) {
    const r = await admin.api('POST', '/api/servers', {
      body: { type: 'fisicos', nombre, rack_norm: 'RACK-DEP', rack_raw: 'RACK-DEP', ip, estado: 'NO_CRITICO', activo: 'SI' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const id = r.data?.server?.id ?? r.data?.id ?? r.data?.data?.id;
    assert.ok(id, 'la respuesta debe traer el id');
    return String(id);
  }

  const nodo = (graph, id) => graph.nodes.find((n) => n.id === id);

  before(async () => {
    await prepararBaseDeDatos();
    crearUsuarios();
    app = await iniciarApp();
    admin = clienteHttp(app.base);
    lector = clienteHttp(app.base);
    assert.equal((await admin.login(CREDENCIALES.admin)).status, 200);
    assert.equal((await lector.login(CREDENCIALES.lector)).status, 200);
    assert.equal((await admin.api('POST', '/api/racks', { body: { name: 'RACK-DEP', raw_name: 'RACK-DEP' } })).status, 201);
    S.s1 = await crearServidor('DEP-S1 App ERP', '10.70.0.11');
    S.s2 = await crearServidor('DEP-S2 API Cache', '10.70.0.12');
    S.s3 = await crearServidor('DEP-S3 PostgreSQL', '10.70.0.13');
    S.aislado = await crearServidor('DEP-S4 Aislado', '10.70.0.14');

    // El sync crea un host de monitoreo (con check ICMP) por servidor. Se desactivan sus
    // checks para que el scheduler real no cambie el estado durante la prueba
    // (el scheduler vuelve a comprobar c.enabled antes de cada ejecución).
    const cliente = new pg.Client({ connectionString: URL_BD });
    await cliente.connect();
    try {
      await cliente.query(`UPDATE monitoring.checks SET enabled = FALSE
                           WHERE host_id IN (SELECT id FROM monitoring.hosts WHERE host(ip) LIKE '10.70.0.%')`);
      await cliente.query("UPDATE monitoring.hosts SET estado_actual = 'UNKNOWN' WHERE host(ip) LIKE '10.70.0.%'");
    } finally {
      await cliente.end();
    }
  });

  after(async () => {
    if (app) {
      const codigo = await app.detener();
      assert.equal(codigo, 0, `apagado limpio con SIGTERM (código ${codigo})`);
    }
  });

  test('sin sesión -> 401', async () => {
    const anon = clienteHttp(app.base);
    assert.equal((await anon.api('GET', '/api/topology/graph')).status, 401);
    assert.equal((await anon.api('GET', '/api/dependencies')).status, 401);
  });

  test('1) registra el ciclo S1 <-> S2 y la cadena S2 -> S3', async () => {
    const r1 = await admin.api('POST', '/api/dependencies', {
      body: { sourceServerId: S.s1, targetServerId: S.s2, dependencyType: 'API', criticality: 'CRITICAL', port: 8443, protocol: 'HTTPS', label: 'API :8443' },
    });
    assert.equal(r1.status, 201, JSON.stringify(r1.data));
    assert.equal(r1.data.dependency.source, S.s1);
    assert.equal(r1.data.dependency.target, S.s2);
    assert.equal(r1.data.dependency.port, 8443);
    assert.equal(r1.data.dependency.createdBy, CREDENCIALES.admin.username);
    dep.s1s2 = r1.data.dependency.id;

    const r2 = await admin.api('POST', '/api/dependencies', {
      body: { source_server_id: S.s2, target_server_id: S.s1, dependency_type: 'AUTH', criticality: 'MEDIUM', port: 443 },
    });
    assert.equal(r2.status, 201, JSON.stringify(r2.data));
    dep.s2s1 = r2.data.dependency.id;

    const r3 = await admin.api('POST', '/api/dependencies', {
      body: { sourceServerId: S.s2, targetServerId: S.s3, dependencyType: 'DATABASE', port: 5432, notes: 'BD principal\nreplicada' },
    });
    assert.equal(r3.status, 201, JSON.stringify(r3.data));
    assert.equal(r3.data.dependency.criticality, 'CRITICAL', 'criticidad por defecto');
    dep.s2s3 = r3.data.dependency.id;

    const lista = await admin.api('GET', '/api/dependencies');
    assert.equal(lista.status, 200);
    assert.equal(lista.data.dependencies.length, 3);
    const deS3 = await admin.api('GET', `/api/dependencies?serverId=${S.s3}`);
    assert.deepEqual(deS3.data.dependencies.map((d) => d.id), [dep.s2s3]);
  });

  test('2) auto-dependencia S1 -> S1 -> 400', async () => {
    const r = await admin.api('POST', '/api/dependencies', { body: { sourceServerId: S.s1, targetServerId: S.s1 } });
    assert.equal(r.status, 400);
    assert.equal(r.data.code, 'VALIDATION_ERROR');
  });

  test('validaciones: duplicado -> 409, servidor inexistente -> 404, enums/puerto -> 400, nunca 500', async () => {
    const dup = await admin.api('POST', '/api/dependencies', { body: { sourceServerId: S.s1, targetServerId: S.s2, dependencyType: 'API' } });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.code, 'CONFLICT');
    assert.doesNotMatch(JSON.stringify(dup.data), /uq_server_dependency|duplicate key|server_dependencies/);

    const fk = await admin.api('POST', '/api/dependencies', { body: { sourceServerId: S.s1, targetServerId: '999999' } });
    assert.equal(fk.status, 404);

    for (const body of [
      { sourceServerId: S.s1, targetServerId: S.s3, dependencyType: 'NOPE' },
      { sourceServerId: S.s1, targetServerId: S.s3, criticality: 'X' },
      { sourceServerId: S.s1, targetServerId: S.s3, port: 70000 },
      { sourceServerId: S.s1, targetServerId: S.s3, label: 'x'.repeat(121) },
      { sourceServerId: 'abc', targetServerId: S.s3 },
    ]) {
      assert.equal((await admin.api('POST', '/api/dependencies', { body })).status, 400, JSON.stringify(body));
    }
    assert.equal((await admin.api('PUT', '/api/dependencies/abc', { body: { label: 'x' } })).status, 400);
    assert.equal((await admin.api('PUT', '/api/dependencies/999999', { body: { label: 'x' } })).status, 404);
    assert.equal((await admin.api('DELETE', '/api/dependencies/999999')).status, 404);
    assert.equal((await admin.api('GET', '/api/dependencies/server/abc/impact')).status, 400);
    assert.equal((await admin.api('GET', '/api/dependencies/server/999999/impact')).status, 404);
    assert.equal(app.proceso.exitCode, null);
  });

  test('editar y eliminar una dependencia (mutua creada en una transacción)', async () => {
    const r = await admin.api('POST', '/api/dependencies', {
      body: { sourceServerId: S.s1, targetServerId: S.aislado, dependencyType: 'BACKUP', bidirectional: true },
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.dependencies.length, 2);
    const [ida, vuelta] = r.data.dependencies;
    assert.equal(vuelta.source, S.aislado);
    assert.equal(vuelta.target, S.s1);

    const upd = await admin.api('PUT', `/api/dependencies/${ida.id}`, { body: { criticality: 'low', label: 'Respaldo\u0000 nocturno', port: null } });
    assert.equal(upd.status, 200, JSON.stringify(upd.data));
    assert.equal(upd.data.dependency.criticality, 'LOW');
    assert.equal(upd.data.dependency.label, 'Respaldo  nocturno');
    assert.equal(upd.data.dependency.dependencyType, 'BACKUP', 'conserva lo no enviado');

    // Cambiarla para que choque con otra existente -> 409; convertirla en auto-dependencia -> 400
    assert.equal((await admin.api('PUT', `/api/dependencies/${ida.id}`, { body: { targetServerId: S.s2, dependencyType: 'API' } })).status, 409);
    assert.equal((await admin.api('PUT', `/api/dependencies/${ida.id}`, { body: { targetServerId: S.s1 } })).status, 400);

    for (const d of [ida, vuelta]) {
      assert.equal((await admin.api('DELETE', `/api/dependencies/${d.id}`)).status, 200);
    }
    assert.equal((await admin.api('GET', '/api/dependencies')).data.dependencies.length, 3);
  });

  test('3) impacto de S3: S2 dependiente directo, S1 en cascada; ciclo [S1, S2] sin colgarse', async () => {
    const r = await lector.api('GET', `/api/dependencies/server/${S.s3}/impact`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.server.id, S.s3);
    assert.deepEqual(r.data.dependentsDirect.map((n) => n.id), [S.s2]);
    assert.deepEqual(r.data.dependentsDirect[0].dependencies.map((d) => d.id), [dep.s2s3]);
    assert.deepEqual(r.data.dependentsTransitive.map((n) => [n.id, n.depth]), [[S.s1, 2]]);
    assert.deepEqual(r.data.dependentsTransitive[0].path, [S.s3, S.s2, S.s1]);
    assert.equal(r.data.totalAffected, 2);
    assert.deepEqual(r.data.dependsOnDirect, []);
    assert.deepEqual(r.data.cycles, []);

    const s1 = await lector.api('GET', `/api/dependencies/server/${S.s1}/impact`);
    assert.equal(s1.status, 200);
    assert.deepEqual(s1.data.cycles, [[S.s1, S.s2, S.s1]]);
    assert.deepEqual(s1.data.dependsOnDirect.map((n) => n.id), [S.s2]);
    assert.deepEqual(s1.data.dependsOnTransitive.map((n) => [n.id, n.depth]), [[S.s3, 2]]);
    assert.equal(s1.data.dependsOnDirect[0].name, 'DEP-S2 API Cache');
  });

  test('4) grafo con simulateDownIds=S3 marca S2 (directo) y S1 (cascada)', async () => {
    const r = await lector.api('GET', `/api/topology/graph?simulateDownIds=${S.s3}`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.view.slug, 'general');
    assert.equal(r.data.view.isDefault, true);
    assert.deepEqual(r.data.impact.simulatedDownIds, [S.s3]);
    assert.ok(r.data.impact.rootIds.includes(S.s3));

    const n3 = nodo(r.data, S.s3);
    assert.equal(n3.isDown, true);
    assert.equal(n3.downSource, 'SIMULATED');
    assert.equal(n3.cascadeStatus, 'NONE');
    const n2 = nodo(r.data, S.s2);
    assert.equal(n2.cascadeStatus, 'DIRECT_IMPACT');
    assert.deepEqual(n2.impactedByServers, [S.s3]);
    const n1 = nodo(r.data, S.s1);
    assert.equal(n1.cascadeStatus, 'TRANSITIVE_IMPACT');
    assert.deepEqual(n1.impactPath, [S.s3, S.s2, S.s1]);

    // Aristas: el par S1 <-> S2 es bidireccional; S2 -> S3 no
    const arista = (id) => r.data.edges.find((e) => e.id === id);
    assert.equal(arista(dep.s1s2).isBidirectionalPair, true);
    assert.equal(arista(dep.s2s1).isBidirectionalPair, true);
    assert.equal(arista(dep.s2s3).isBidirectionalPair, false);
    assert.equal(arista(dep.s2s3).carriesImpact, true);

    // El servidor aislado solo aparece con includeIsolated=true
    assert.equal(nodo(r.data, S.aislado), undefined);
    const todos = await lector.api('GET', '/api/topology/graph?includeIsolated=true');
    assert.ok(nodo(todos.data, S.aislado));
    assert.equal(nodo(todos.data, S.s1).cascadeStatus, 'NONE', 'sin simulación ni caídas no hay impacto');

    // Parámetros inválidos -> 400
    for (const q of ['simulateDownIds=1,abc', 'simulateDownIds=0', 'includeIsolated=quizas', 'view=%3Cscript%3E', 'view=general&view=otra']) {
      assert.equal((await lector.api('GET', `/api/topology/graph?${q}`)).status, 400, q);
    }
    assert.equal((await lector.api('GET', '/api/topology/graph?view=no-existe')).status, 404);
  });

  test('impacto REAL desde monitoreo: host DOWN de S3 (cruce por nombre) afecta a S2 y S1', async () => {
    const cliente = new pg.Client({ connectionString: URL_BD });
    await cliente.connect();
    try {
      // monitoringSyncService ya creó el host con el mismo nombre del servidor
      const { rowCount } = await cliente.query("UPDATE monitoring.hosts SET estado_actual = 'DOWN', enabled = TRUE WHERE name = $1", ['DEP-S3 PostgreSQL']);
      assert.equal(rowCount, 1, 'el sync debe haber creado el host de monitoreo de S3');
      const r = await lector.api('GET', '/api/topology/graph');
      assert.equal(r.status, 200);
      assert.deepEqual(r.data.impact.monitoringDownIds, [S.s3]);
      assert.equal(nodo(r.data, S.s3).status, 'DOWN');
      assert.equal(nodo(r.data, S.s3).downSource, 'MONITORING');
      assert.equal(nodo(r.data, S.s2).cascadeStatus, 'DIRECT_IMPACT');
      assert.equal(nodo(r.data, S.s1).cascadeStatus, 'TRANSITIVE_IMPACT');

      // Cruce por IP limpia cuando el nombre no coincide
      await cliente.query("UPDATE monitoring.hosts SET name = 'otro-nombre', estado_actual = 'DEGRADED' WHERE name = $1", ['DEP-S3 PostgreSQL']);
      const porIp = await lector.api('GET', '/api/topology/graph');
      assert.equal(nodo(porIp.data, S.s3).status, 'DEGRADED');
      assert.equal(nodo(porIp.data, S.s2).cascadeStatus, 'DIRECT_IMPACT');
    } finally {
      await cliente.query("UPDATE monitoring.hosts SET estado_actual = 'UNKNOWN' WHERE host(ip) = '10.70.0.13'").catch(() => { });
      await cliente.end();
    }
  });

  test('vistas: listar, crear (slug automático), duplicado -> 409, editar', async () => {
    const lista = await lector.api('GET', '/api/topology/views');
    assert.equal(lista.status, 200);
    vistaGeneral = lista.data.views.find((v) => v.slug === 'general');
    assert.ok(vistaGeneral, 'existe la vista Mapa General');
    assert.equal(vistaGeneral.name, 'Mapa General');

    const c = await admin.api('POST', '/api/topology/views', { body: { name: 'ERP Producción', description: 'Servicios del ERP' } });
    assert.equal(c.status, 201, JSON.stringify(c.data));
    assert.equal(c.data.view.slug, 'erp-produccion');
    assert.equal(c.data.view.isDefault, false);
    assert.deepEqual(c.data.view.viewport, { zoom: 1, x: 0, y: 0 });

    assert.equal((await admin.api('POST', '/api/topology/views', { body: { name: 'ERP Producción' } })).status, 409);
    assert.equal((await admin.api('POST', '/api/topology/views', { body: { name: 'Otra', slug: 'Slug Malo' } })).status, 400);

    const u = await admin.api('PUT', `/api/topology/views/${c.data.view.id}`, { body: { name: 'ERP Prod', layoutMode: 'hierarchical-lr', filterConfig: { tipo: 'virtuales' } } });
    assert.equal(u.status, 200, JSON.stringify(u.data));
    assert.equal(u.data.view.name, 'ERP Prod');
    assert.deepEqual(u.data.view.filterConfig, { tipo: 'virtuales' });

    // No se puede quitar la marca de predeterminada ni borrar la vista por defecto
    assert.equal((await admin.api('PUT', `/api/topology/views/${vistaGeneral.id}`, { body: { isDefault: false } })).status, 400);
    assert.equal((await admin.api('DELETE', `/api/topology/views/${vistaGeneral.id}`)).status, 409);
    assert.equal((await admin.api('DELETE', '/api/topology/views/999999')).status, 404);

    const borrar = await admin.api('DELETE', `/api/topology/views/${c.data.view.id}`);
    assert.equal(borrar.status, 200);
  });

  test('5) guardado y lectura de posiciones (x, y) + viewport', async () => {
    const r = await admin.api('PUT', `/api/topology/views/${vistaGeneral.id}/positions`, {
      body: {
        positions: [
          { serverId: S.s1, x: 100.5, y: 200 },
          { serverId: S.s2, x: 380, y: 200, pinned: false },
          { serverId: S.aislado, x: -50, y: 10 },
        ],
        viewport: { zoom: 1.25, x: -20, y: 15 },
      },
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.saved, 3);
    assert.deepEqual(r.data.viewport, { zoom: 1.25, x: -20, y: 15 });

    // Reescribir (ON CONFLICT DO UPDATE) y quitar uno de la vista
    const r2 = await admin.api('PUT', `/api/topology/views/${vistaGeneral.id}/positions`, {
      body: { positions: [{ serverId: S.s1, x: 110, y: 210 }], removeServerIds: [S.aislado] },
    });
    assert.equal(r2.status, 200, JSON.stringify(r2.data));
    assert.equal(r2.data.removed, 1);

    const g = await lector.api('GET', `/api/topology/graph?view=${vistaGeneral.id}`);
    assert.equal(g.status, 200);
    assert.deepEqual(nodo(g.data, S.s1).position, { x: 110, y: 210, pinned: true, collapsed: false });
    assert.deepEqual(nodo(g.data, S.s2).position, { x: 380, y: 200, pinned: false, collapsed: false });
    assert.equal(nodo(g.data, S.s3).position, null);
    assert.equal(nodo(g.data, S.aislado), undefined, 'quitado de la vista y sin relaciones');
    assert.deepEqual(g.data.view.viewport, { zoom: 1.25, x: -20, y: 15 });
    const porSlug = await lector.api('GET', '/api/topology/graph?view=general');
    assert.deepEqual(nodo(porSlug.data, S.s1).position, nodo(g.data, S.s1).position);

    // Validaciones del lote
    const ruta = `/api/topology/views/${vistaGeneral.id}/positions`;
    const muchas = Array.from({ length: 1001 }, () => ({ serverId: S.s1, x: 0, y: 0 }));
    assert.equal((await admin.api('PUT', ruta, { body: { positions: muchas } })).status, 400);
    assert.equal((await admin.api('PUT', ruta, { body: { positions: [{ serverId: S.s1, x: 'abc', y: 0 }] } })).status, 400);
    assert.equal((await admin.api('PUT', ruta, { body: { positions: [{ serverId: '999999', x: 0, y: 0 }] } })).status, 404);
    assert.equal((await admin.api('PUT', '/api/topology/views/999999/positions', { body: { positions: [{ serverId: S.s1, x: 0, y: 0 }] } })).status, 404);
  });

  test('6) RBAC: el viewer recibe 403 al escribir y 200 al leer', async () => {
    const prohibidos = [
      ['POST', '/api/dependencies', { sourceServerId: S.s1, targetServerId: S.s3 }],
      ['PUT', `/api/dependencies/${dep.s1s2}`, { label: 'x' }],
      ['DELETE', `/api/dependencies/${dep.s1s2}`],
      ['POST', '/api/topology/views', { name: 'vista-lector' }],
      ['PUT', `/api/topology/views/${vistaGeneral.id}`, { name: 'x' }],
      ['PUT', `/api/topology/views/${vistaGeneral.id}/positions`, { positions: [{ serverId: S.s1, x: 0, y: 0 }] }],
      ['DELETE', `/api/topology/views/${vistaGeneral.id}`],
    ];
    for (const [metodo, ruta, body] of prohibidos) {
      const r = await lector.api(metodo, ruta, { body });
      assert.equal(r.status, 403, `${metodo} ${ruta} -> ${r.status}`);
    }
    for (const ruta of ['/api/dependencies', '/api/topology/views', '/api/topology/graph', `/api/dependencies/server/${S.s2}/impact`]) {
      assert.equal((await lector.api('GET', ruta)).status, 200, ruta);
    }
    // Sigue existiendo (el viewer no la borró)
    assert.equal((await admin.api('GET', '/api/dependencies')).data.dependencies.length, 3);
  });

  test('CSRF: escribir sin token -> 403', async () => {
    const r = await admin.api('POST', '/api/dependencies', { body: { sourceServerId: S.s1, targetServerId: S.s3 }, sinCsrf: true });
    assert.equal(r.status, 403);
    assert.equal(r.data.code, 'CSRF_INVALID');
  });

  test('borrar un servidor elimina en cascada sus dependencias', async () => {
    assert.equal((await admin.api('DELETE', `/api/servers/${S.s3}`)).status, 200);
    const lista = await admin.api('GET', '/api/dependencies');
    assert.deepEqual(lista.data.dependencies.map((d) => d.id).sort(), [dep.s1s2, dep.s2s1].sort());
  });
});

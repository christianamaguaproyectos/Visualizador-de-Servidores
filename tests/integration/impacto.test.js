// Integración de Impacto de servicios contra la app REAL + PostgreSQL.
// Se omite si no hay TEST_POSTGRES_URL (tests/helpers/appDePrueba.js).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {
  CREDENCIALES, URL_BD, clienteHttp, crearUsuarios, iniciarApp, motivoParaOmitir, prepararBaseDeDatos,
} from '../helpers/appDePrueba.js';

const omitir = motivoParaOmitir();

describe('Impacto de servicios (integración)', { skip: omitir || false }, () => {
  let app;
  let admin;
  let lector;
  const S = {};
  let servicio;

  async function crearServidor(type, nombre, ip, rack) {
    const r = await admin.api('POST', '/api/servers', {
      body: { type, nombre, rack_norm: rack, rack_raw: rack, ip, estado: 'NO_CRITICO', activo: 'SI' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const id = r.data?.server?.id ?? r.data?.id ?? r.data?.data?.id;
    assert.ok(id, 'la respuesta debe traer el id');
    return String(id);
  }

  async function sql(texto, valores = []) {
    const cliente = new pg.Client({ connectionString: URL_BD });
    await cliente.connect();
    try {
      return await cliente.query(texto, valores);
    } finally {
      await cliente.end();
    }
  }

  before(async () => {
    await prepararBaseDeDatos();
    crearUsuarios();
    app = await iniciarApp();
    admin = clienteHttp(app.base);
    lector = clienteHttp(app.base);
    assert.equal((await admin.login(CREDENCIALES.admin)).status, 200);
    assert.equal((await lector.login(CREDENCIALES.lector)).status, 200);
    assert.equal((await admin.api('POST', '/api/racks', { body: { name: 'RACK-IMP', raw_name: 'RACK-IMP' } })).status, 201);
    S.host = await crearServidor('fisicos', 'IMP-HOST', '198.51.100.21', 'RACK-IMP');
    S.seg = await crearServidor('virtuales', 'IMP-SEG', '198.51.100.22', 'imp host');
    S.bdd = await crearServidor('virtuales', 'IMP-BDD', '198.51.100.23', 'IMP-HOST');
    S.nodo1 = await crearServidor('virtuales', 'IMP-NODO1', '198.51.100.24', 'OTRO');
    S.nodo2 = await crearServidor('virtuales', 'IMP-NODO2', '198.51.100.25', 'OTRO');
    // El sync crea un host de monitoreo por servidor: se desactivan sus checks para que el
    // scheduler real no cambie el estado durante la prueba
    await sql(`UPDATE monitoring.checks SET enabled = FALSE
               WHERE host_id IN (SELECT id FROM monitoring.hosts WHERE host(ip) LIKE '198.51.100.%')`);
    await sql("UPDATE monitoring.hosts SET estado_actual = 'UP' WHERE host(ip) LIKE '198.51.100.%'");
  });

  after(async () => {
    if (app) {
      const codigo = await app.detener();
      assert.equal(codigo, 0, `apagado limpio con SIGTERM (código ${codigo})`);
    }
  });

  test('sin sesión -> 401; el lector no puede escribir', async () => {
    const anon = clienteHttp(app.base);
    assert.equal((await anon.api('GET', '/api/impacto')).status, 401);
    assert.equal((await lector.api('POST', '/api/impacto/servicios', { body: { name: 'X' } })).status, 403);
  });

  test('registra el servicio, sus servidores y un grupo de respaldo', async () => {
    const r = await admin.api('POST', '/api/impacto/servicios', { body: { name: 'ERP Prueba', description: 'Servicio de prueba' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    servicio = r.data.service.id;
    const dup = await admin.api('POST', '/api/impacto/servicios', { body: { name: 'ERP Prueba' } });
    assert.equal(dup.status, 409);

    const comp = (body) => admin.api('POST', `/api/impacto/servicios/${servicio}/componentes`, { body });
    assert.equal((await comp({ serverId: S.seg, role: 'Seguridad', impact: 'TOTAL' })).status, 201);
    assert.equal((await comp({ serverId: S.bdd, role: 'Base de datos', impact: 'TOTAL', workaround: 'Restaurar respaldo' })).status, 201);
    assert.equal((await comp({ serverId: S.nodo1, impact: 'TOTAL', redundancyGroup: 'Nodos' })).status, 201);
    assert.equal((await comp({ serverId: S.nodo2, impact: 'TOTAL', redundancyGroup: 'Nodos' })).status, 201);
    assert.equal((await comp({ serverId: S.seg })).status, 409, 'el mismo servidor dos veces');
    assert.equal((await comp({ serverId: '999999999' })).status, 404);

    const req = await admin.api('POST', '/api/impacto/requisitos', { body: { serverId: S.nodo2, requiredServerId: S.seg } });
    assert.equal(req.status, 201, JSON.stringify(req.data));
  });

  test('panorama: estado actual con Monitoreo y VMs unidas a su host', async () => {
    const r = await lector.api('GET', '/api/impacto');
    assert.equal(r.status, 200);
    const s = r.data.services.find((x) => x.id === servicio);
    assert.equal(s.components.length, 4);
    assert.equal(r.data.hosts[S.seg], S.host, 'el Host "imp host" coincide con el físico IMP-HOST');
    assert.equal(r.data.actual.servicios.find((x) => x.serviceId === servicio).estado, 'FUNCIONA');

    // Caída real: IMP-BDD en DOWN según Monitoreo
    await sql("UPDATE monitoring.hosts SET estado_actual = 'DOWN' WHERE host(ip) = '198.51.100.23'");
    const r2 = await lector.api('GET', '/api/impacto');
    const actual = r2.data.actual.servicios.find((x) => x.serviceId === servicio);
    assert.equal(actual.estado, 'NO_FUNCIONA');
    assert.equal(actual.componentesCaidos[0].serverId, S.bdd);
    await sql("UPDATE monitoring.hosts SET estado_actual = 'UP' WHERE host(ip) = '198.51.100.23'");
  });

  test('simulación: host, requisito y grupo de respaldo', async () => {
    const uno = await lector.api('GET', `/api/impacto/simular?ids=${S.nodo1}`);
    assert.equal(uno.status, 200);
    assert.equal(uno.data.servicios.find((x) => x.serviceId === servicio).estado, 'FUNCIONA', 'el otro nodo sigue');

    // Cae el host: caen SEG y BDD (VMs) y NODO2 (necesita a SEG)
    const host = await lector.api('GET', `/api/impacto/simular?ids=${S.host}`);
    const caidos = new Map(host.data.servidoresCaidos.map((c) => [c.id, c]));
    assert.equal(caidos.get(S.seg).motivo, 'HOST');
    assert.equal(caidos.get(S.nodo2).motivo, 'REQUIERE');
    assert.equal(host.data.servicios.find((x) => x.serviceId === servicio).estado, 'NO_FUNCIONA');

    assert.equal((await lector.api('GET', '/api/impacto/simular')).status, 400);
    assert.equal((await lector.api('GET', '/api/impacto/simular?ids=abc')).status, 400);
  });

  test('editar y quitar', async () => {
    const r = await admin.api('GET', '/api/impacto');
    const c = r.data.services.find((x) => x.id === servicio).components.find((x) => x.serverId === S.bdd);
    const ed = await admin.api('PUT', `/api/impacto/componentes/${c.id}`, { body: { impact: 'PARCIAL', impactDetail: 'Solo consultas' } });
    assert.equal(ed.status, 200, JSON.stringify(ed.data));
    assert.equal(ed.data.component.impact, 'PARCIAL');
    assert.equal((await admin.api('PUT', `/api/impacto/componentes/${c.id}`, { body: { serverId: S.seg } })).status, 400);
    assert.equal((await admin.api('DELETE', `/api/impacto/componentes/${c.id}`)).status, 204);
    assert.equal((await admin.api('DELETE', `/api/impacto/servicios/${servicio}`)).status, 204);
    assert.equal((await admin.api('DELETE', `/api/impacto/servicios/${servicio}`)).status, 404);
  });

  test('estado de monitoreo por servidor (lo usan Físicos y Virtuales)', async () => {
    const r = await lector.api('GET', '/api/impacto/servidores');
    assert.equal(r.status, 200);
    const s = r.data.servers.find((x) => x.id === S.host);
    assert.equal(s.status, 'UP');
    assert.equal(s.monitoring.enabled, true);
  });
});

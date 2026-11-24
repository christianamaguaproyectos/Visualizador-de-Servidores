#!/usr/bin/env node

/**
 * Datos de demostración del Mapa de Dependencias.
 *
 * Crea servidores físicos y virtuales ficticios (srv-..., IPs 10.0.0.x): cinco racks de 42U
 * con equipos de 1U, 2U y 4U en su posición (con huecos libres y uno sin posición, que se
 * apila en el primer hueco), dos hosts con VMs y un clúster; relaciones de distintos tipos (incluido un ciclo
 * A ↔ B y una cadena B → C); hosts de monitoreo enlazados (uno DOWN y uno DEGRADED, con
 * sus checks desactivados para que el estado no cambie solo) y posiciones en la vista
 * predeterminada ("Mapa General").
 *
 * Es idempotente: ejecutarlo varias veces no duplica nada. Todo lo que crea queda marcado
 * (servidores con identity_key "demo-topologia:...", racks con raw_name "demo-topologia",
 * hosts de monitoreo con la etiqueta "demo-topologia") y --borrar elimina SOLO eso.
 *
 * Uso (Docker):
 *   docker compose run --rm tools node scripts/seed-demo-topologia.js
 *   docker compose run --rm tools node scripts/seed-demo-topologia.js --borrar
 *
 * Telemetría de demostración: además se generan 24 h de ejecuciones sintéticas por host demo
 * (scripts/lib/telemetriaDemo.js) para que la vista en tiempo real de Monitoreo muestre ondas.
 * Con --telemetria-continua el script queda en marcha y añade un punto cada 15 s (Ctrl+C para
 * salir). No hace conexiones de red ni cambia el estado de los hosts.
 *   docker compose run --rm tools node scripts/seed-demo-topologia.js --telemetria-continua
 */

import 'dotenv/config';
import { withTransaction, closePool } from '../backend/src/config/db.js';
import { completarTelemetria, PASO_CONTINUO_SEG } from './lib/telemetriaDemo.js';

export const MARCA = 'demo-topologia';
const PREFIJO_IDENTIDAD = `${MARCA}:`;

// [nombre, tipo, rack/host/clúster, ip, marca, modelo, so]
export const SERVIDORES = [
  ['srv-fw-01', 'fisicos', 'RACK-A1', '10.0.0.11', 'Genérica', 'Appliance 1U', 'Firewall'],
  ['srv-dc-01', 'fisicos', 'RACK-A1', '10.0.0.12', 'Genérica', 'Servidor 1U', 'Windows Server'],
  ['srv-hv-01', 'fisicos', 'RACK-A2', '10.0.0.13', 'Genérica', 'Servidor 2U', 'Hipervisor'],
  ['srv-hv-02', 'fisicos', 'RACK-A2', '10.0.0.14', 'Genérica', 'Servidor 2U', 'Hipervisor'],
  ['srv-nas-01', 'fisicos', 'RACK-A3', '10.0.0.15', 'Genérica', 'NAS 4U', 'Almacenamiento'],
  ['srv-bkp-01', 'fisicos', 'RACK-A3', '10.0.0.16', 'Genérica', 'Servidor 2U', 'Linux'],
  ['srv-sw-01', 'fisicos', 'RACK-A4', '10.0.0.17', 'Genérica', 'Switch 1U', 'Red'],
  ['srv-db-01', 'fisicos', 'RACK-A5', '10.0.0.18', 'Genérica', 'Servidor 2U', 'Linux'],
  ['srv-dc-02', 'fisicos', 'RACK-A1', '10.0.0.31', 'Genérica', 'Servidor 1U', 'Windows Server'],
  ['srv-mon-01', 'fisicos', 'RACK-A1', '10.0.0.32', 'Genérica', 'Servidor 1U', 'Linux'],
  ['srv-log-01', 'fisicos', 'RACK-A1', '10.0.0.33', 'Genérica', 'Servidor 2U', 'Linux'],
  ['srv-hv-03', 'fisicos', 'RACK-A2', '10.0.0.34', 'Genérica', 'Servidor 2U', 'Hipervisor'],
  ['srv-mgmt-01', 'fisicos', 'RACK-A2', '10.0.0.35', 'Genérica', 'Servidor 1U', 'Linux'],
  ['srv-nas-02', 'fisicos', 'RACK-A3', '10.0.0.36', 'Genérica', 'NAS 4U', 'Almacenamiento'],
  ['srv-cin-01', 'fisicos', 'RACK-A3', '10.0.0.37', 'Genérica', 'Librería de cintas 4U', 'Respaldo'],
  ['srv-sw-02', 'fisicos', 'RACK-A4', '10.0.0.38', 'Genérica', 'Switch 1U', 'Red'],
  ['srv-sw-03', 'fisicos', 'RACK-A4', '10.0.0.39', 'Genérica', 'Switch 1U', 'Red'],
  ['srv-rtr-01', 'fisicos', 'RACK-A4', '10.0.0.40', 'Genérica', 'Router 2U', 'Red'],
  ['srv-db-02', 'fisicos', 'RACK-A5', '10.0.0.41', 'Genérica', 'Servidor 2U', 'Linux'],
  ['srv-app-01', 'fisicos', 'RACK-A5', '10.0.0.42', 'Genérica', 'Servidor 1U', 'Linux'],
  ['srv-app-02', 'fisicos', 'RACK-A5', '10.0.0.43', 'Genérica', 'Servidor 1U', 'Linux'],
  ['srv-pru-01', 'fisicos', 'RACK-A5', '10.0.0.44', 'Genérica', 'Servidor 2U', 'Linux'],
  ['srv-web-01', 'virtuales', 'srv-hv-01', '10.0.0.21', null, null, 'Linux'],
  ['srv-api-01', 'virtuales', 'srv-hv-01', '10.0.0.22', null, null, 'Linux'],
  ['srv-portal-01', 'virtuales', 'srv-hv-01', '10.0.0.23', null, null, 'Linux'],
  ['srv-mail-01', 'virtuales', 'srv-hv-02', '10.0.0.24', null, null, 'Linux'],
  ['srv-erp-01', 'virtuales', 'srv-hv-02', '10.0.0.25', null, null, 'Windows Server'],
  ['srv-bi-01', 'virtuales', 'VCL-01', '10.0.0.26', null, null, 'Linux'],
  ['srv-crm-01', 'virtuales', 'VCL-01', '10.0.0.27', null, null, 'Linux'],
  ['srv-intranet-01', 'virtuales', 'VCL-01', '10.0.0.28', null, null, 'Linux'],
];

// Ubicación en el rack: [rack_position (U superior del equipo, 1-42 desde abajo), rack_units].
// srv-pru-01 no tiene posición: la vista de rack lo coloca en el primer hueco libre.
export const UBICACION_RACK = {
  'srv-fw-01': [42, 1], 'srv-dc-01': [40, 1], 'srv-dc-02': [39, 1], 'srv-mon-01': [30, 1], 'srv-log-01': [20, 2],
  'srv-hv-01': [38, 2], 'srv-hv-02': [35, 2], 'srv-hv-03': [32, 2], 'srv-mgmt-01': [28, 1],
  'srv-nas-01': [24, 4], 'srv-bkp-01': [18, 2], 'srv-nas-02': [12, 4], 'srv-cin-01': [6, 4],
  'srv-sw-01': [42, 1], 'srv-sw-02': [41, 1], 'srv-sw-03': [40, 1], 'srv-rtr-01': [37, 2],
  'srv-db-01': [30, 2], 'srv-db-02': [27, 2], 'srv-app-01': [24, 1], 'srv-app-02': [23, 1], 'srv-pru-01': [null, 2],
};

// [origen (depende de) → destino, tipo, criticidad, puerto, protocolo, etiqueta]
export const DEPENDENCIAS = [
  ['srv-web-01', 'srv-api-01', 'API', 'CRITICAL', 8443, 'HTTPS', 'Pedidos'],
  ['srv-api-01', 'srv-web-01', 'SERVICE', 'MEDIUM', 443, 'HTTPS', 'Notificaciones'],
  ['srv-api-01', 'srv-db-01', 'DATABASE', 'CRITICAL', 5432, 'TCP', 'Base principal'],
  ['srv-web-01', 'srv-hv-01', 'HYPERVISOR', 'CRITICAL'],
  ['srv-api-01', 'srv-hv-01', 'HYPERVISOR', 'CRITICAL'],
  ['srv-portal-01', 'srv-hv-01', 'HYPERVISOR', 'CRITICAL'],
  ['srv-portal-01', 'srv-api-01', 'API', 'HIGH', 8443, 'HTTPS'],
  ['srv-mail-01', 'srv-hv-02', 'HYPERVISOR', 'CRITICAL'],
  ['srv-erp-01', 'srv-hv-02', 'HYPERVISOR', 'CRITICAL'],
  ['srv-erp-01', 'srv-db-01', 'DATABASE', 'CRITICAL', 5432, 'TCP'],
  ['srv-hv-01', 'srv-nas-01', 'STORAGE', 'CRITICAL', 2049, 'NFS'],
  ['srv-hv-02', 'srv-nas-01', 'STORAGE', 'CRITICAL', 2049, 'NFS'],
  ['srv-db-01', 'srv-nas-01', 'STORAGE', 'HIGH', 3260, 'iSCSI'],
  ['srv-bkp-01', 'srv-nas-01', 'BACKUP', 'LOW'],
  ['srv-crm-01', 'srv-db-01', 'DATABASE', 'HIGH', 5432, 'TCP'],
  ['srv-crm-01', 'srv-dc-01', 'AUTH', 'HIGH', 636, 'LDAP'],
  ['srv-portal-01', 'srv-dc-01', 'AUTH', 'HIGH', 636, 'LDAP'],
  ['srv-mail-01', 'srv-dc-01', 'AUTH', 'MEDIUM', 636, 'LDAP'],
  ['srv-bi-01', 'srv-db-01', 'DATABASE', 'MEDIUM', 5432, 'TCP'],
  ['srv-intranet-01', 'srv-dc-01', 'DNS_INFRA', 'LOW', 53, 'DNS'],
  ['srv-intranet-01', 'srv-api-01', 'API', 'MEDIUM', 443, 'HTTPS'],
  ['srv-dc-01', 'srv-fw-01', 'NETWORK', 'HIGH'],
  ['srv-fw-01', 'srv-sw-01', 'NETWORK', 'CRITICAL'],
];

// Estado de monitoreo fijo (el resto queda UP)
export const ESTADOS_MONITOREO = { 'srv-db-01': 'DOWN', 'srv-bkp-01': 'DEGRADED' };

// Hosts virtuales de demostración por grupo de /virtuales (clave del grupo, host)
export const ASIGNACION_CLUSTERS = [['danec1', 'srv-hv-01'], ['danec1', 'srv-hv-02'], ['vsphere', 'VCL-01']];

// Criticidad de inventario (campo "estado"); el resto queda como NO_CRITICO
export const ESTADOS_INVENTARIO = {
  'srv-fw-01': 'CRITICO', 'srv-dc-01': 'CRITICO', 'srv-db-01': 'CRITICO', 'srv-db-02': 'CRITICO',
  'srv-hv-01': 'CRITICO', 'srv-pru-01': 'MANTENIMIENTO', 'srv-cin-01': 'MANTENIMIENTO',
};

// Capa de cada servidor en el Editor 2D (0 = aplicaciones, 5 = red)
const CAPAS = [
  ['srv-web-01', 'srv-portal-01', 'srv-intranet-01', 'srv-crm-01', 'srv-bi-01', 'srv-erp-01', 'srv-mail-01'],
  ['srv-api-01'],
  ['srv-db-01', 'srv-dc-01'],
  ['srv-hv-01', 'srv-hv-02', 'srv-fw-01'],
  ['srv-nas-01', 'srv-bkp-01', 'srv-sw-01'],
];

const identidad = (nombre) => `${PREFIJO_IDENTIDAD}${nombre}`;

/** Crea (si faltan) los datos de demostración. Devuelve contadores de lo creado. */
export async function sembrar(client) {
  const creados = { racks: 0, servidores: 0, dependencias: 0, hosts: 0, posiciones: 0 };

  // Racks: físicos y "racks" virtuales (host o clúster) con su tipo correcto
  const racks = new Map();
  for (const [, tipo, rack] of SERVIDORES) if (!racks.has(rack)) racks.set(rack, tipo);
  const idRack = new Map();
  for (const [nombre, tipo] of racks) {
    const r = await client.query(
      `INSERT INTO inventory.racks (name, raw_name, type) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING RETURNING id`, [nombre, MARCA, tipo]);
    if (r.rowCount) creados.racks += 1;
    const fila = r.rows[0] || (await client.query('SELECT id FROM inventory.racks WHERE name = $1', [nombre])).rows[0];
    idRack.set(nombre, fila.id);
  }

  // Hosts virtuales de demostración en los grupos de /virtuales (si esos grupos existen)
  for (const [clave, host] of ASIGNACION_CLUSTERS) {
    await client.query(
      `INSERT INTO inventory.cluster_hosts (cluster_id, rack_id)
       SELECT c.id, r.id FROM inventory.virtual_clusters c, inventory.racks r
        WHERE c.key = $1 AND r.name = $2 AND r.type = 'virtuales'
       ON CONFLICT (cluster_id, rack_id) DO NOTHING`, [clave, host]);
  }

  // Servidores (identity_key marcada: no choca con los reales y permite borrarlos)
  const idServidor = new Map();
  for (const [nombre, tipo, rack, ip, marca, modelo, so] of SERVIDORES) {
    const [posicion = null, unidades = 2] = UBICACION_RACK[nombre] || [];
    const r = await client.query(
      `INSERT INTO inventory.servers (type, identity_key, rack_id, rack_norm, rack_raw, nombre, ip, marca, modelo, so, estado, activo, rack_position, rack_units)
       VALUES ($1::inventory.server_type_enum, $2, $3, $4, $4, $5, $6, $7, $8, $9, $12, 'SI', $10, $11)
       ON CONFLICT (type, identity_key) DO NOTHING RETURNING id`,
      [tipo, identidad(nombre), idRack.get(rack), rack, nombre, ip, marca, modelo, so, posicion, unidades, ESTADOS_INVENTARIO[nombre] || 'NO_CRITICO']);
    if (r.rowCount) creados.servidores += 1;
    else if (ESTADOS_INVENTARIO[nombre]) {
      // Datos demo de una versión anterior: se asigna la criticidad solo si nunca se editaron
      await client.query(
        `UPDATE inventory.servers SET estado = $3
          WHERE type = $1::inventory.server_type_enum AND identity_key = $2 AND estado = 'NO_CRITICO' AND updated_at = created_at`,
        [tipo, identidad(nombre), ESTADOS_INVENTARIO[nombre]]);
    }
    if (!r.rowCount && posicion) {
      // Datos demo de una versión anterior sin ubicación: se completa (nunca se pisa una posición)
      await client.query(
        `UPDATE inventory.servers SET rack_position = $3, rack_units = $4
          WHERE type = $1::inventory.server_type_enum AND identity_key = $2 AND rack_position IS NULL`,
        [tipo, identidad(nombre), posicion, unidades]);
    }
    const fila = r.rows[0] || (await client.query(
      'SELECT id FROM inventory.servers WHERE type = $1::inventory.server_type_enum AND identity_key = $2', [tipo, identidad(nombre)])).rows[0];
    idServidor.set(nombre, fila.id);
  }

  for (const [origen, destino, tipo, criticidad, puerto = null, protocolo = null, etiqueta = null] of DEPENDENCIAS) {
    const r = await client.query(
      `INSERT INTO inventory.server_dependencies
         (source_server_id, target_server_id, dependency_type, criticality, port, protocol, label, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (source_server_id, target_server_id, dependency_type) DO NOTHING`,
      [idServidor.get(origen), idServidor.get(destino), tipo, criticidad, puerto, protocolo, etiqueta, 'Datos de demostración', MARCA]);
    creados.dependencias += r.rowCount;
  }

  // Hosts de monitoreo enlazados por nombre, con un check ICMP desactivado
  for (const [nombre, tipo, rack, ip] of SERVIDORES) {
    const ya = await client.query(
      'SELECT id FROM monitoring.hosts WHERE name = $1 AND $2 = ANY(group_tags)', [nombre, MARCA]);
    if (ya.rowCount) continue;
    const estado = ESTADOS_MONITOREO[nombre] || 'UP';
    const h = await client.query(
      `INSERT INTO monitoring.hosts (name, ip, type, rack, critical, group_tags, enabled, estado_actual, estado_changed_at)
       VALUES ($1, $2::inet, $3::monitoring.host_type_enum, $4, $5, $6, TRUE, $7, NOW()) RETURNING id`,
      [nombre, ip, tipo === 'fisicos' ? 'fisico' : 'virtual', rack, estado !== 'UP', [MARCA], estado]);
    await client.query(
      `INSERT INTO monitoring.checks (host_id, kind, config, frequency_sec, timeout_ms, enabled)
       VALUES ($1, 'icmp', $2, 300, 2000, FALSE)`,
      [h.rows[0].id, JSON.stringify({ ip, host: ip })]);
    creados.hosts += 1;
  }

  // Vista predeterminada ("Mapa General"); se crea solo si no hay ninguna
  let vista = (await client.query(
    `SELECT id FROM inventory.topology_views ORDER BY is_default DESC, (slug = 'general') DESC, id LIMIT 1`)).rows[0];
  if (!vista) {
    vista = (await client.query(
      `INSERT INTO inventory.topology_views (name, slug, is_default) VALUES ('Mapa General', 'general', TRUE)
       ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`)).rows[0];
  }
  // Posiciones del Editor 2D por capas; no se pisan las que el usuario ya movió
  for (const [y, capa] of CAPAS.entries()) {
    for (const [x, nombre] of capa.entries()) {
      const r = await client.query(
        `INSERT INTO inventory.topology_node_positions (view_id, server_id, x, y, pinned)
         VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (view_id, server_id) DO NOTHING`,
        [vista.id, idServidor.get(nombre), 40 + (x + (7 - capa.length) / 2) * 280, 40 + y * 150]);
      creados.posiciones += r.rowCount;
    }
  }
  return creados;
}

/** Elimina SOLO lo creado por este script (las relaciones y posiciones caen en cascada). */
export async function borrar(client) {
  const borrados = { servidores: 0, hosts: 0, racks: 0 };
  borrados.servidores = (await client.query(
    'DELETE FROM inventory.servers WHERE identity_key LIKE $1', [`${PREFIJO_IDENTIDAD}%`])).rowCount;
  borrados.hosts = (await client.query(
    'DELETE FROM monitoring.hosts WHERE $1 = ANY(group_tags)', [MARCA])).rowCount;
  // Un rack marcado solo se borra si ya no tiene servidores (p. ej. si alguien agregó uno real)
  borrados.racks = (await client.query(
    `DELETE FROM inventory.racks r WHERE r.raw_name = $1
       AND NOT EXISTS (SELECT 1 FROM inventory.servers s WHERE s.rack_id = r.id)`, [MARCA])).rowCount;
  return borrados;
}

/** Historial demo de 24 h (idempotente). Los checks demo muestran la frecuencia real de los puntos */
export async function sembrarTelemetria(client, opciones = {}) {
  await client.query(
    `UPDATE monitoring.checks c SET frequency_sec = 60
       FROM monitoring.hosts h
      WHERE h.id = c.host_id AND $1 = ANY(h.group_tags) AND NOT c.enabled AND c.frequency_sec = 300`, [MARCA]);
  return completarTelemetria(client, { marca: MARCA, ...opciones });
}

async function telemetriaContinua() {
  console.log(`Telemetría de demostración en vivo: un punto cada ${PASO_CONTINUO_SEG} s por host demo (Ctrl+C para salir).`);
  let activo = true;
  const parar = () => { activo = false; };
  process.on('SIGINT', parar);
  process.on('SIGTERM', parar);
  while (activo) {
    try {
      await withTransaction((c) => completarTelemetria(c, { marca: MARCA, pasoSeg: PASO_CONTINUO_SEG }));
    } catch (err) {
      console.error('No se pudo añadir telemetría de demostración:', err.message);
    }
    for (let i = 0; i < PASO_CONTINUO_SEG && activo; i += 1) await new Promise((r) => setTimeout(r, 1000));
  }
}

async function main() {
  const modoBorrar = process.argv.includes('--borrar');
  if (!process.env.POSTGRES_URL) {
    console.error('Falta POSTGRES_URL (ejecútalo con: docker compose run --rm tools node scripts/seed-demo-topologia.js)');
    process.exit(1);
  }
  try {
    if (modoBorrar) {
      const b = await withTransaction((c) => borrar(c));
      console.log(`Datos de demostración eliminados: ${b.servidores} servidores (con sus relaciones y posiciones), ${b.hosts} hosts de monitoreo, ${b.racks} racks.`);
    } else {
      const c = await withTransaction((cl) => sembrar(cl));
      const total = Object.values(c).reduce((a, b) => a + b, 0);
      console.log(total
        ? `Datos de demostración creados: ${c.servidores} servidores, ${c.dependencias} relaciones, ${c.hosts} hosts de monitoreo, ${c.racks} racks y ${c.posiciones} posiciones.`
        : 'Los datos de demostración ya estaban cargados: no se creó nada.');
      const puntos = await withTransaction((cl) => sembrarTelemetria(cl));
      if (puntos) console.log(`Telemetría de demostración: ${puntos} ejecuciones nuevas (últimas 24 h).`);
      console.log('Abre /dependencias para ver el mapa. Para quitarlos: node scripts/seed-demo-topologia.js --borrar');
      if (process.argv.includes('--telemetria-continua')) await telemetriaContinua();
    }
  } catch (err) {
    console.error('No se pudieron cargar los datos de demostración:', err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

// Solo se ejecuta como programa (las pruebas importan sembrar/borrar)
if (process.argv[1]?.endsWith('seed-demo-topologia.js')) {
  await main();
}

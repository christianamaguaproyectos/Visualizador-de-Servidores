#!/usr/bin/env node

/**
 * Datos de demostración del Mapa de Dependencias.
 *
 * Crea servidores físicos y virtuales ficticios (srv-..., IPs 10.0.0.x) repartidos en
 * racks, un host con VMs y un clúster; relaciones de distintos tipos (incluido un ciclo
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
 */

import 'dotenv/config';
import { withTransaction, closePool } from '../backend/src/config/db.js';

export const MARCA = 'demo-topologia';
const PREFIJO_IDENTIDAD = `${MARCA}:`;

// [nombre, tipo, rack/host/clúster, ip, marca, modelo, so]
export const SERVIDORES = [
  ['srv-fw-01', 'fisicos', 'RACK-A1', '10.0.0.11', 'Genérica', 'Appliance 1U', 'Firewall'],
  ['srv-dc-01', 'fisicos', 'RACK-A1', '10.0.0.12', 'Genérica', 'Servidor 1U', 'Windows Server'],
  ['srv-hv-01', 'fisicos', 'RACK-A2', '10.0.0.13', 'Genérica', 'Servidor 2U', 'Hipervisor'],
  ['srv-hv-02', 'fisicos', 'RACK-A2', '10.0.0.14', 'Genérica', 'Servidor 2U', 'Hipervisor'],
  ['srv-nas-01', 'fisicos', 'RACK-A3', '10.0.0.15', 'Genérica', 'NAS 2U', 'Almacenamiento'],
  ['srv-bkp-01', 'fisicos', 'RACK-A3', '10.0.0.16', 'Genérica', 'Servidor 2U', 'Linux'],
  ['srv-sw-01', 'fisicos', 'RACK-A4', '10.0.0.17', 'Genérica', 'Switch 1U', 'Red'],
  ['srv-db-01', 'fisicos', 'RACK-B1', '10.0.0.18', 'Genérica', 'Servidor 2U', 'Linux'],
  ['srv-web-01', 'virtuales', 'srv-hv-01', '10.0.0.21', null, null, 'Linux'],
  ['srv-api-01', 'virtuales', 'srv-hv-01', '10.0.0.22', null, null, 'Linux'],
  ['srv-portal-01', 'virtuales', 'srv-hv-01', '10.0.0.23', null, null, 'Linux'],
  ['srv-mail-01', 'virtuales', 'srv-hv-02', '10.0.0.24', null, null, 'Linux'],
  ['srv-erp-01', 'virtuales', 'srv-hv-02', '10.0.0.25', null, null, 'Windows Server'],
  ['srv-bi-01', 'virtuales', 'VCL-01', '10.0.0.26', null, null, 'Linux'],
  ['srv-crm-01', 'virtuales', 'VCL-01', '10.0.0.27', null, null, 'Linux'],
  ['srv-intranet-01', 'virtuales', 'VCL-01', '10.0.0.28', null, null, 'Linux'],
];

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

  // Servidores (identity_key marcada: no choca con los reales y permite borrarlos)
  const idServidor = new Map();
  for (const [nombre, tipo, rack, ip, marca, modelo, so] of SERVIDORES) {
    const r = await client.query(
      `INSERT INTO inventory.servers (type, identity_key, rack_id, rack_norm, rack_raw, nombre, ip, marca, modelo, so, estado, activo)
       VALUES ($1::inventory.server_type_enum, $2, $3, $4, $4, $5, $6, $7, $8, $9, 'NO_CRITICO', 'SI')
       ON CONFLICT (type, identity_key) DO NOTHING RETURNING id`,
      [tipo, identidad(nombre), idRack.get(rack), rack, nombre, ip, marca, modelo, so]);
    if (r.rowCount) creados.servidores += 1;
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
      console.log('Abre /dependencias para ver el mapa. Para quitarlos: node scripts/seed-demo-topologia.js --borrar');
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

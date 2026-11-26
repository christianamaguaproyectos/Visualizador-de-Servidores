#!/usr/bin/env node

/**
 * Actualiza una base de datos EXISTENTE al esquema actual de la aplicación, sin borrar datos.
 *
 * Aplica en orden los scripts de scripts/sql (los mismos que usa Docker al crear una base
 * nueva). Todos son idempotentes: CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
 * ON CONFLICT DO NOTHING. Cada script va en su propia transacción: si uno falla, se deshace
 * solo ese script y el proceso se detiene. Al final verifica que existan todas las tablas,
 * columnas e índices que usa la aplicación.
 *
 * Uso (haga antes un respaldo con pg_dump; ver docs/GUIA-BASE-DATOS-REAL.md):
 *   node scripts/actualizar-bd.js              solo revisa y muestra lo que falta (no cambia nada)
 *   node scripts/actualizar-bd.js --aplicar    aplica los scripts y verifica
 * Con Docker:
 *   docker compose run --rm tools node scripts/actualizar-bd.js --aplicar
 *
 * Lee la conexión de DATABASE_URL o POSTGRES_URL (.env).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { requireDatabaseUrl } from './lib/requireDatabaseUrl.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARPETA_SQL = path.join(RAIZ, 'scripts', 'sql');
const BOM = String.fromCharCode(0xFEFF);

/** Objetos que la aplicación necesita: [esquema, tabla, columnas] */
export const TABLAS_REQUERIDAS = [
  ['inventory', 'racks', ['id', 'name', 'type']],
  ['inventory', 'servers', ['id', 'type', 'identity_key', 'rack_id', 'nombre', 'ip', 'estado', 'rack_position', 'rack_units', 'storage', 'zabbix']],
  ['inventory', 'virtual_clusters', ['id', 'key', 'name']],
  ['inventory', 'services', ['id', 'name']],
  ['inventory', 'service_components', ['id', 'service_id', 'server_id', 'role', 'impact', 'impact_detail', 'workaround', 'redundancy_group']],
  ['inventory', 'server_requirements', ['id', 'server_id', 'required_server_id']],
  ['monitoring', 'hosts', ['id', 'name', 'ip', 'rack', 'estado_actual']],
  ['monitoring', 'checks', ['id', 'host_id', 'kind', 'enabled']],
  ['monitoring', 'check_runs', ['time', 'check_id', 'host_id', 'status', 'latency_ms']],
  ['monitoring', 'incidents', ['id', 'host_id', 'state']],
  ['monitoring', 'incident_events', ['id', 'incident_id', 'type']],
  ['monitoring', 'maintenance_windows', ['id', 'target_ids']],
  ['monitoring', 'alert_recipients', ['id', 'email', 'enabled']],
  ['users', 'users', ['id', 'username', 'password_hash', 'role']],
  ['users', 'sessions', ['sid', 'sess', 'expire']],
];

/** Índices de los que dependen las consultas en vivo (telemetría, impacto) */
export const INDICES_REQUERIDOS = [
  ['monitoring', 'check_runs_host_time_idx'],
  ['monitoring', 'check_runs_check_time_idx'],
  ['inventory', 'idx_service_components_server'],
  ['inventory', 'idx_server_requirements_required'],
];

export function scriptsEnOrden() {
  return fs.readdirSync(CARPETA_SQL).filter((f) => f.endsWith('.sql')).sort();
}

/** Lista lo que falta (tablas, columnas e índices) en la base conectada */
export async function revisar(client) {
  const faltan = [];
  const { rows: columnas } = await client.query(`
    SELECT table_schema, table_name, column_name FROM information_schema.columns
     WHERE table_schema IN ('inventory', 'monitoring', 'users')`);
  const existe = new Set(columnas.map((c) => `${c.table_schema}.${c.table_name}.${c.column_name}`));
  const tablas = new Set(columnas.map((c) => `${c.table_schema}.${c.table_name}`));
  for (const [esquema, tabla, cols] of TABLAS_REQUERIDAS) {
    if (!tablas.has(`${esquema}.${tabla}`)) { faltan.push(`tabla ${esquema}.${tabla}`); continue; }
    for (const c of cols) if (!existe.has(`${esquema}.${tabla}.${c}`)) faltan.push(`columna ${esquema}.${tabla}.${c}`);
  }
  const { rows: indices } = await client.query(
    "SELECT schemaname, indexname FROM pg_indexes WHERE schemaname IN ('inventory', 'monitoring')");
  const idx = new Set(indices.map((i) => `${i.schemaname}.${i.indexname}`));
  for (const [esquema, nombre] of INDICES_REQUERIDOS) if (!idx.has(`${esquema}.${nombre}`)) faltan.push(`índice ${esquema}.${nombre}`);
  return faltan;
}

/** Cantidad de filas de las tablas principales (para comprobar que no se pierde nada) */
export async function contarFilas(client) {
  const conteo = {};
  for (const [esquema, tabla] of TABLAS_REQUERIDAS) {
    const r = await client.query('SELECT to_regclass($1) AS t', [`${esquema}.${tabla}`]);
    if (!r.rows[0].t) continue;
    conteo[`${esquema}.${tabla}`] = Number((await client.query(`SELECT COUNT(*) AS n FROM ${esquema}.${tabla}`)).rows[0].n);
  }
  return conteo;
}

/**
 * Aplica un script en su propia transacción. 00-init.sql da permisos y fija el search_path de
 * la base: si el usuario no es dueño de la base, esas órdenes se omiten con un aviso.
 */
async function aplicarScript(client, archivo, log) {
  const sql = fs.readFileSync(path.join(CARPETA_SQL, archivo), 'utf8').replace(BOM, '');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (archivo === '00-init.sql' && err.code === '42501') {
      await client.query('CREATE SCHEMA IF NOT EXISTS inventory; CREATE SCHEMA IF NOT EXISTS monitoring;');
      log(`  aviso: ${archivo}: sin permiso para cambiar permisos o el search_path de la base; se crearon solo los esquemas.`);
      return true;
    }
    err.archivo = archivo;
    throw err;
  } finally {
    await client.query('SET search_path TO DEFAULT').catch(() => {});
  }
}

/**
 * @param {pg.Client} client
 * @param {{aplicar?: boolean, log?: (m: string) => void}} opciones
 * @returns {Promise<{faltabanAntes: string[], faltanDespues: string[], antes: object, despues: object, aplicados: string[]}>}
 */
export async function actualizar(client, { aplicar = false, log = console.log } = {}) {
  const faltabanAntes = await revisar(client);
  const antes = await contarFilas(client);
  if (!aplicar) return { faltabanAntes, faltanDespues: faltabanAntes, antes, despues: antes, aplicados: [] };

  const aplicados = [];
  for (const archivo of scriptsEnOrden()) {
    log(`  aplicando ${archivo}`);
    await aplicarScript(client, archivo, log);
    aplicados.push(archivo);
  }
  const faltanDespues = await revisar(client);
  const despues = await contarFilas(client);
  return { faltabanAntes, faltanDespues, antes, despues, aplicados };
}

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const client = new pg.Client({ connectionString: requireDatabaseUrl() });
  await client.connect();
  try {
    const base = (await client.query('SELECT current_database() AS db, current_user AS usuario')).rows[0];
    console.log(`Base de datos: ${base.db} (usuario ${base.usuario})`);
    const r = await actualizar(client, { aplicar });
    if (!aplicar) {
      if (r.faltabanAntes.length) {
        console.log(`Faltan ${r.faltabanAntes.length} elementos:\n${r.faltabanAntes.map((f) => `  - ${f}`).join('\n')}`);
        console.log('Haga un respaldo (pg_dump) y ejecute de nuevo con --aplicar.');
      } else {
        console.log('El esquema está al día: no falta nada.');
      }
      console.log('Filas actuales:', r.antes);
      return;
    }
    const perdidas = Object.entries(r.antes).filter(([t, n]) => (r.despues[t] ?? 0) < n);
    console.log(`Scripts aplicados: ${r.aplicados.length}.`);
    if (r.faltanDespues.length) {
      console.error(`Verificación: todavía faltan ${r.faltanDespues.length} elementos:\n${r.faltanDespues.map((f) => `  - ${f}`).join('\n')}`);
      process.exitCode = 1;
    } else if (perdidas.length) {
      console.error('Verificación: alguna tabla tiene menos filas que antes:', perdidas);
      process.exitCode = 1;
    } else {
      console.log('Verificación correcta: el esquema está completo y no se perdió ninguna fila.');
      console.log('Filas:', r.despues);
    }
  } catch (err) {
    console.error(`No se pudo actualizar la base${err.archivo ? ` (script ${err.archivo}, deshecho)` : ''}: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith('actualizar-bd.js')) {
  await main();
}

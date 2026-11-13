/**
 * Acceso a PostgreSQL para el módulo de monitoreo.
 *
 * Usa el MISMO pool que el resto de la app (config/db.js). Antes había un pool
 * propio de monitoreo, otro en db.js, el de Prisma y uno nuevo por cada llamada
 * en monitoringSyncService: demasiadas conexiones abiertas a la vez.
 */
import { getPool, withClient, closePool } from '../../config/db.js';

/**
 * Devuelve el pool compartido
 * @returns {import('pg').Pool}
 */
export function getMonitoringPool() {
  return getPool();
}

/**
 * Ejecuta una función con una conexión del pool compartido
 * (con search_path inventory, monitoring, public)
 * @param {Function} fn - Función que recibe el cliente como parámetro
 * @returns {Promise<any>} Resultado de la función
 */
export async function withMonitoringClient(fn) {
  return withClient(fn);
}

/**
 * Ejecuta fn dentro de una TRANSACCIÓN (BEGIN / COMMIT / ROLLBACK).
 * Para operaciones de varios pasos: si uno falla, no queda nada a medias.
 * @param {Function} fn - Función que recibe el cliente
 * @returns {Promise<any>}
 */
export async function withMonitoringTransaction(fn) {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const resultado = await fn(client);
      await client.query('COMMIT');
      return resultado;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => { });
      throw err;
    }
  });
}

/**
 * Cierra el pool compartido (para shutdown graceful)
 */
export async function closeMonitoringPool() {
  await closePool();
}

export default { getMonitoringPool, withMonitoringClient, withMonitoringTransaction, closeMonitoringPool };

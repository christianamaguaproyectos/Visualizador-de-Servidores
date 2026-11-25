import { Pool, Client } from 'pg';
import { Logger } from '../utils/logger.js';

// Pool de conexiones compartido - SINGLETON
let pool = null;

/**
 * Obtiene o crea el pool de conexiones
 * @returns {Pool} Pool de conexiones PostgreSQL
 */
export function getPool() {
  if (!pool) {
    const url = process.env.POSTGRES_URL;
    if (!url) throw new Error('POSTGRES_URL no definido');

    pool = new Pool({
      connectionString: url,
      max: 20,                    // Máximo de conexiones (pool ÚNICO compartido con monitoreo)
      min: 2,                     // Mínimo de conexiones mantenidas
      idleTimeoutMillis: 30000,   // Cerrar conexiones inactivas después de 30s
      connectionTimeoutMillis: 5000, // Timeout para obtener conexión
    });

    // Manejadores de eventos del pool
    pool.on('error', (err) => {
      Logger.error('❌ Error inesperado en pool de PostgreSQL:', err.message);
    });

    pool.on('connect', () => {
      Logger.debug('📊 Nueva conexión establecida en el pool');
    });

    Logger.info('🐘 Pool de conexiones PostgreSQL inicializado (max: 20)');
  }
  return pool;
}

/**
 * Crea un cliente individual (para casos especiales)
 * @deprecated Usar withClient() en su lugar
 */
export function createClient() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error('POSTGRES_URL no definido');
  return new Client({ connectionString: url });
}

/**
 * Ejecuta una función con una conexión del pool
 * @param {Function} fn - Función que recibe el cliente como parámetro
 * @returns {Promise<any>} Resultado de la función
 */
export async function withClient(fn) {
  const client = await getPool().connect();
  try {
    // Ajustar search_path para tener ambos esquemas
    await client.query('SET search_path TO inventory, monitoring, public');
    return await fn(client);
  } finally {
    // Liberar la conexión de vuelta al pool (NO cerrarla)
    client.release();
  }
}

const NIVELES_AISLAMIENTO = new Set(['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']);

/**
 * Ejecuta fn(client) dentro de una transacción (BEGIN/COMMIT/ROLLBACK) con una
 * conexión del pool compartido.
 *
 * - Si fn lanza (o falla el COMMIT) se hace ROLLBACK y se relanza el error original.
 * - Si el propio ROLLBACK falla (conexión rota), la conexión se DESCARTA del pool
 *   con client.release(err) en lugar de devolverla en un estado desconocido.
 *
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 * @param {{ isolationLevel?: 'READ COMMITTED'|'REPEATABLE READ'|'SERIALIZABLE', readOnly?: boolean }} [opciones]
 *   p. ej. { isolationLevel: 'REPEATABLE READ', readOnly: true } para leer varias
 *   tablas en una misma instantánea consistente.
 * @returns {Promise<any>} Resultado de fn
 */
export async function withTransaction(fn, { isolationLevel = null, readOnly = false } = {}) {
  if (isolationLevel !== null && !NIVELES_AISLAMIENTO.has(isolationLevel)) {
    throw new Error(`Nivel de aislamiento no soportado: ${isolationLevel}`);
  }
  const begin = ['BEGIN', isolationLevel ? `ISOLATION LEVEL ${isolationLevel}` : '', readOnly ? 'READ ONLY' : '']
    .filter(Boolean).join(' ');

  const client = await getPool().connect();
  let errorConexion;
  try {
    await client.query('SET search_path TO inventory, monitoring, public');
    await client.query(begin);
    try {
      const resultado = await fn(client);
      await client.query('COMMIT');
      return resultado;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (errRollback) {
        errorConexion = errRollback;
      }
      throw err;
    }
  } finally {
    client.release(errorConexion);
  }
}

/**
 * Cierra el pool de conexiones (para shutdown graceful)
 */
export async function closePool() {
  if (pool) {
    Logger.info('🔌 Cerrando pool de conexiones PostgreSQL...');
    await pool.end();
    pool = null;
    Logger.info('✅ Pool cerrado correctamente');
  }
}

export default { createClient, withClient, withTransaction, closePool, getPool };
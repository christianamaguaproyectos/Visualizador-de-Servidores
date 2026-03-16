import { Pool, Client } from 'pg';
import { Logger } from '../utils/logger.js';

// Pool de conexiones compartido - SINGLETON
let pool = null;

/**
 * Obtiene o crea el pool de conexiones
 * @returns {Pool} Pool de conexiones PostgreSQL
 */
function getPool() {
  if (!pool) {
    const url = process.env.POSTGRES_URL;
    if (!url) throw new Error('POSTGRES_URL no definido');

    pool = new Pool({
      connectionString: url,
      max: 10,                    // Máximo de conexiones en el pool
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

    Logger.info('🐘 Pool de conexiones PostgreSQL inicializado (max: 10)');
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

export default { createClient, withClient, closePool, getPool };
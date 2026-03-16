/**
 * Pool de conexiones centralizado para el módulo de monitoreo
 * Evita el error "too many clients already" reutilizando conexiones
 */
import { Pool, Client } from 'pg';
import monitoringConfig from './monitoringConfig.js';

// Pool de conexiones compartido - SINGLETON
let pool = null;

/**
 * Obtiene o crea el pool de conexiones para monitoreo
 * @returns {Pool} Pool de conexiones PostgreSQL
 */
export function getMonitoringPool() {
    if (!pool) {
        const url = monitoringConfig.postgresUrl;
        if (!url) throw new Error('POSTGRES_URL no configurado para monitoreo');

        pool = new Pool({
            connectionString: url,
            max: 15,                    // Máximo de conexiones en el pool
            min: 2,                     // Mínimo de conexiones mantenidas
            idleTimeoutMillis: 30000,   // Cerrar conexiones inactivas después de 30s
            connectionTimeoutMillis: 5000, // Timeout para obtener conexión
        });

        // Manejadores de eventos del pool
        pool.on('error', (err) => {
            console.error('❌ Error inesperado en pool de monitoreo:', err.message);
        });

        pool.on('connect', () => {
            // Log silencioso para no saturar
        });

        console.log('🐘 Pool de conexiones de MONITOREO inicializado (max: 15)');
    }
    return pool;
}

/**
 * Ejecuta una función con una conexión del pool de monitoreo
 * @param {Function} fn - Función que recibe el cliente como parámetro
 * @returns {Promise<any>} Resultado de la función
 */
export async function withMonitoringClient(fn) {
    const client = await getMonitoringPool().connect();
    try {
        return await fn(client);
    } finally {
        // Liberar la conexión de vuelta al pool (NO cerrarla)
        client.release();
    }
}

/**
 * Crea un cliente individual (para casos especiales como scheduler que mantiene conexión)
 * @deprecated Preferir withMonitoringClient() para queries normales
 */
export function createMonitoringClient() {
    const url = monitoringConfig.postgresUrl;
    if (!url) throw new Error('POSTGRES_URL no configurado para monitoreo');
    return new Client({ connectionString: url });
}

/**
 * Cierra el pool de conexiones de monitoreo (para shutdown graceful)
 */
export async function closeMonitoringPool() {
    if (pool) {
        console.log('🔌 Cerrando pool de conexiones de monitoreo...');
        await pool.end();
        pool = null;
        console.log('✅ Pool de monitoreo cerrado correctamente');
    }
}

export default { getMonitoringPool, withMonitoringClient, createMonitoringClient, closeMonitoringPool };

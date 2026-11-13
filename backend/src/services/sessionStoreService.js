/**
 * Sesiones guardadas en PostgreSQL (tabla users.sessions) con connect-pg-simple.
 *
 * Antes las sesiones vivían en la memoria del proceso (MemoryStore): cada reinicio
 * de PM2 (había uno programado cada hora) cerraba la sesión de todos los usuarios,
 * y no había forma de invalidar las sesiones de un usuario al cambiar su contraseña.
 */
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { getPool, withClient } from '../config/db.js';
import Logger from '../utils/logger.js';

const PgSession = connectPgSimple(session);

export const SESSION_SCHEMA = 'users';
export const SESSION_TABLE = 'sessions';

/**
 * Crea el store de sesiones sobre el pool compartido
 * @returns {session.Store}
 */
export function crearSessionStore() {
  const store = new PgSession({
    pool: getPool(),
    schemaName: SESSION_SCHEMA,
    tableName: SESSION_TABLE,
    // La tabla la crea scripts/sql/07-schema.sessions.sql; si falta, se intenta crear
    createTableIfMissing: true,
    // Borrar sesiones vencidas cada 15 minutos
    pruneSessionInterval: 15 * 60,
    errorLog: (...args) => Logger.error('Error en store de sesiones:', ...args),
  });
  return store;
}

/**
 * Cierra todas las sesiones activas de un usuario (por ejemplo, al cambiar o
 * restablecer su contraseña), opcionalmente conservando la sesión actual.
 * @param {number|string} userId
 * @param {string} [exceptoSid] - ID de sesión que NO se debe cerrar (la del propio usuario)
 * @returns {Promise<number>} cantidad de sesiones cerradas
 */
export async function invalidarSesionesDeUsuario(userId, exceptoSid = null) {
  if (!userId) return 0;
  try {
    return await withClient(async (client) => {
      const { rowCount } = await client.query(
        `DELETE FROM ${SESSION_SCHEMA}.${SESSION_TABLE}
         WHERE (sess -> 'user' ->> 'id') = $1::text
           AND ($2::text IS NULL OR sid <> $2::text)`,
        [String(userId), exceptoSid]
      );
      if (rowCount > 0) {
        Logger.info(`🔐 ${rowCount} sesión(es) cerrada(s) del usuario ${userId} por cambio de contraseña`);
      }
      return rowCount;
    });
  } catch (err) {
    Logger.error('No se pudieron invalidar las sesiones del usuario:', err.message);
    return 0;
  }
}

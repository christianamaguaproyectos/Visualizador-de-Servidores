/**
 * checkWorker.js - Stub sin Redis
 * El worker de BullMQ ha sido eliminado.
 * Los checks se ejecutan directamente desde el scheduler.
 */
import Logger from '../../utils/logger.js';

export function startCheckWorker() {
  // Sin Redis/BullMQ, no hay worker separado
  // El scheduler ejecuta los checks directamente
  Logger.info('Worker de checks: modo directo (sin Redis)');
  return null;
}

export default { startCheckWorker };
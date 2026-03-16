/**
 * queues/index.js - Stub sin Redis
 * Las colas de Redis han sido eliminadas. 
 * El scheduler ejecuta los checks directamente.
 */

export function getCheckRunQueue() {
  // Sin Redis, retornamos null para que el scheduler ejecute directamente
  return null;
}

export default {
  getCheckRunQueue
};
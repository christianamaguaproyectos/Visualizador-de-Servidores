/**
 * Prisma Client Singleton
 * Garantiza una única instancia del cliente Prisma en toda la aplicación.
 * En desarrollo, se reutiliza entre recargas de nodemon (hot-reload).
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import Logger from '../utils/logger.js';

/** @type {PrismaClient} */
let prisma;

const datasourceUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!datasourceUrl) {
  throw new Error('DATABASE_URL environment variable is not defined');
}

/**
 * Crea una instancia de PrismaClient.
 * Prisma 7 usa el motor "client", por lo que la conexión se provee mediante
 * un driver adapter (pg) en lugar de la propiedad `datasources`.
 * Se aplica una extensión que serializa BigInt a String en todos los
 * resultados (reemplaza al middleware `$use`, removido en Prisma 7).
 */
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: datasourceUrl });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['query', 'error', 'warn'],
  }).$extends({
    query: {
      async $allOperations({ args, query }) {
        const result = await query(args);
        return serializeBigInts(result);
      },
    },
  });
}

if (process.env.NODE_ENV === 'production') {
  prisma = createPrismaClient();
} else {
  // In development, avoid creating multiple instances during hot-reload
  if (!globalThis.__prisma) {
    globalThis.__prisma = createPrismaClient();
  }
  prisma = globalThis.__prisma;
}

/**
 * Convierte recursivamente BigInt a String en un objeto
 * @param {any} obj - Objeto a procesar
 * @returns {any} Objeto con BigInts convertidos
 */
function serializeBigInts(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInts);
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInts(value);
    }
    return result;
  }
  return obj;
}

Logger.info('🔗 Prisma Client inicializado');

export default prisma;

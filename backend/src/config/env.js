// Debe ser el PRIMER import: carga el archivo .env antes de leer process.env
import 'dotenv/config';

/**
 * Validación centralizada de variables de entorno
 * Si alguna variable requerida falta, la aplicación NO arranca.
 * Elimina la necesidad de fallbacks hardcodeados en el código.
 */

import Logger from '../utils/logger.js';

/** Longitud mínima aceptada para SESSION_SECRET */
const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * @typedef {Object} EnvConfig
 * @property {string} DATABASE_URL - URL de conexión PostgreSQL
 * @property {number} PORT - Puerto del servidor
 * @property {string} NODE_ENV - Entorno de ejecución
 * @property {string} SESSION_SECRET - Secreto para express-session
 * @property {boolean} MONITORING_ENABLED - Si el monitoreo está habilitado
 * @property {string} APP_URL - URL pública de la aplicación
 */

/** Variables requeridas: sin ellas la app no puede funcionar */
const REQUIRED_VARS = [
  'SESSION_SECRET',
];

/** Variables con valores por defecto seguros */
const DEFAULTS = {
  PORT: '3000',
  NODE_ENV: 'development',
  MONITORING_ENABLED: '0',
  APP_URL: 'http://localhost:3000',
  DEFAULT_PING_TIMEOUT_MS: '2000',
  DEFAULT_TCP_TIMEOUT_MS: '2000',
  DEFAULT_HTTP_TIMEOUT_MS: '3000',
};

/**
 * Indica si un texto es una URL http/https válida
 * @param {string} value
 * @returns {boolean}
 */
function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Valida que las variables requeridas estén presentes y resuelve defaults.
 * Construye DATABASE_URL a partir de POSTGRES_URL o variables individuales.
 * @returns {EnvConfig} Configuración validada
 */
function validateEnv() {
  const errors = [];

  // Construir DATABASE_URL para Prisma a partir de POSTGRES_URL existente
  if (!process.env.DATABASE_URL) {
    if (process.env.POSTGRES_URL) {
      process.env.DATABASE_URL = process.env.POSTGRES_URL;
    } else {
      // Intentar construir desde variables individuales (Docker Compose)
      const user = process.env.POSTGRES_USER;
      const pass = process.env.POSTGRES_PASSWORD;
      const db = process.env.POSTGRES_DB;
      const host = process.env.POSTGRES_HOST || 'postgres';
      const port = process.env.POSTGRES_PORT || '5432';

      if (user && pass && db) {
        process.env.DATABASE_URL = `postgresql://${user}:${pass}@${host}:${port}/${db}`;
        process.env.POSTGRES_URL = process.env.DATABASE_URL;
      }
    }
  } else if (!process.env.POSTGRES_URL) {
    // Si DATABASE_URL existe pero POSTGRES_URL no, copiar
    process.env.POSTGRES_URL = process.env.DATABASE_URL;
  }

  // Verificar que al menos DATABASE_URL esté disponible ahora
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    errors.push('DATABASE_URL o POSTGRES_URL: al menos una debe estar definida');
  }

  // Validar variables requeridas
  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      errors.push(`${varName} no está definida`);
    }
  }

  // SESSION_SECRET debe ser largo para que no se pueda adivinar
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < MIN_SESSION_SECRET_LENGTH) {
    errors.push(`SESSION_SECRET debe tener al menos ${MIN_SESSION_SECRET_LENGTH} caracteres`);
  }

  // Aplicar defaults
  for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
    if (!process.env[key]) {
      process.env[key] = defaultValue;
    }
  }

  // APP_URL se usa para construir enlaces de correo: debe ser una URL http(s) válida
  if (!isValidHttpUrl(process.env.APP_URL)) {
    errors.push('APP_URL debe ser una URL válida que empiece con http:// o https://');
  }

  // Reportar errores
  if (errors.length > 0) {
    Logger.error('❌ Variables de entorno faltantes o inválidas:');
    errors.forEach(e => Logger.error(`   - ${e}`));

    // En producción, fallar rápido. En desarrollo, advertir.
    if (process.env.NODE_ENV === 'production') {
      Logger.error('💀 La aplicación no puede arrancar en producción sin las variables requeridas.');
      process.exit(1);
    } else {
      Logger.warn('⚠️  Continuando en modo desarrollo con valores por defecto inseguros...');
      // Aplicar fallbacks inseguros solo en dev
      if (!process.env.SESSION_SECRET) {
        process.env.SESSION_SECRET = 'dev-only-insecure-secret-change-me';
      }
    }
  }

  const config = {
    DATABASE_URL: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    PORT: parseInt(process.env.PORT, 10),
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
    MONITORING_ENABLED: process.env.MONITORING_ENABLED === '1',
    APP_URL: process.env.APP_URL,
  };

  Logger.info(`✅ Entorno validado: ${config.NODE_ENV} | Puerto: ${config.PORT} | Monitoreo: ${config.MONITORING_ENABLED}`);

  return config;
}

/** Configuración validada (singleton) */
const env = validateEnv();

export default env;

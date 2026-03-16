/**
 * Utilidades para logging con colores y formato consistente
 */

export class Logger {
  /**
   * Log de información general
   * @param {string} message - Mensaje a mostrar
   * @param {...any} args - Argumentos adicionales
   */
  static info(message, ...args) {
    console.log(`ℹ️  ${message}`, ...args);
  }

  /**
   * Log de éxito
   * @param {string} message - Mensaje a mostrar
   * @param {...any} args - Argumentos adicionales
   */
  static success(message, ...args) {
    console.log(`✅ ${message}`, ...args);
  }

  /**
   * Log de advertencia
   * @param {string} message - Mensaje a mostrar
   * @param {...any} args - Argumentos adicionales
   */
  static warn(message, ...args) {
    console.warn(`⚠️  ${message}`, ...args);
  }

  /**
   * Log de error
   * @param {string} message - Mensaje a mostrar
   * @param {...any} args - Argumentos adicionales
   */
  static error(message, ...args) {
    console.error(`❌ ${message}`, ...args);
  }

  /**
   * Log de debug (solo en desarrollo)
   * @param {string} message - Mensaje a mostrar
   * @param {...any} args - Argumentos adicionales
   */
  static debug(message, ...args) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔍 ${message}`, ...args);
    }
  }
}

export default Logger;
import { APP_CONFIG } from '../config/constants.js';
import Logger from '../utils/logger.js';

/**
 * Servicio para gestionar el caché de datos de servidores en memoria
 * Almacena datos parseados de físicos y virtuales por separado
 */
class CacheService {
  constructor() {
    this.cache = {
      [APP_CONFIG.SERVER_TYPES.FISICOS]: this._createEmptyData(APP_CONFIG.SERVER_TYPES.FISICOS),
      [APP_CONFIG.SERVER_TYPES.VIRTUALES]: this._createEmptyData(APP_CONFIG.SERVER_TYPES.VIRTUALES)
    };
  }

  /**
   * Crea una estructura de datos vacía
   * @param {string} type - Tipo de servidor
   * @returns {Object} Estructura vacía
   */
  _createEmptyData(type) {
    return {
      racks: [],
      servers: [],
      meta: {
        type,
        updatedAt: null
      }
    };
  }

  /**
   * Obtiene los datos del caché para un tipo específico
   * @param {string} type - Tipo de servidor
   * @returns {Object} Datos cacheados
   */
  get(type) {
    return this.cache[type] || this._createEmptyData(type);
  }

  /**
   * Actualiza el caché para un tipo específico
   * @param {string} type - Tipo de servidor
   * @param {Object} data - Nuevos datos
   */
  set(type, data) {
    this.cache[type] = data;
    Logger.debug(`Caché actualizado (${type}): ${data.servers?.length || 0} servidores`);
  }

  /**
   * Obtiene metadata resumida del caché
   * @returns {Object} Metadata de ambos tipos
   */
  getMetadata() {
    return {
      [APP_CONFIG.SERVER_TYPES.FISICOS]: {
        racks: this.cache[APP_CONFIG.SERVER_TYPES.FISICOS].racks?.length || 0,
        servers: this.cache[APP_CONFIG.SERVER_TYPES.FISICOS].servers?.length || 0,
        updatedAt: this.cache[APP_CONFIG.SERVER_TYPES.FISICOS].meta?.updatedAt || null
      },
      [APP_CONFIG.SERVER_TYPES.VIRTUALES]: {
        racks: this.cache[APP_CONFIG.SERVER_TYPES.VIRTUALES].racks?.length || 0,
        servers: this.cache[APP_CONFIG.SERVER_TYPES.VIRTUALES].servers?.length || 0,
        updatedAt: this.cache[APP_CONFIG.SERVER_TYPES.VIRTUALES].meta?.updatedAt || null
      }
    };
  }

  /**
   * Limpia el caché para un tipo específico
   * @param {string} type - Tipo de servidor
   */
  clear(type) {
    this.cache[type] = this._createEmptyData(type);
    Logger.info(`Caché limpiado (${type})`);
  }

  /**
   * Limpia todo el caché
   */
  clearAll() {
    Object.keys(this.cache).forEach(type => {
      this.clear(type);
    });
  }
}

// Exportar instancia única (Singleton)
export default new CacheService();

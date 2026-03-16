import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { APP_CONFIG } from '../config/constants.js';
import Logger from '../utils/logger.js';
import excelParserService from './excelParserService.js';

/**
 * Servicio para observar cambios en archivos Excel y recargar datos automáticamente
 * Implementa debouncing y retry logic para manejar archivos bloqueados
 */
class FileWatcherService {
  constructor() {
    // Watchers activos para cada tipo
    this.watchers = {
      [APP_CONFIG.SERVER_TYPES.FISICOS]: null,
      [APP_CONFIG.SERVER_TYPES.VIRTUALES]: null
    };

    // Timers de recarga pendientes
    this.reloadTimers = {
      [APP_CONFIG.SERVER_TYPES.FISICOS]: null,
      [APP_CONFIG.SERVER_TYPES.VIRTUALES]: null
    };

    // Callback que se ejecutará al recargar datos
    this.onReloadCallback = null;
  }

  /**
   * Establece el callback que se ejecutará cuando se recarguen datos
   * @param {Function} callback - Función callback (type, data) => void
   */
  setReloadCallback(callback) {
    this.onReloadCallback = callback;
  }

  /**
   * Programa una recarga de datos con debouncing
   * @param {string} type - Tipo de servidor
   * @param {string} reason - Razón de la recarga (para logging)
   */
  scheduleReload(type, reason = '') {
    // Limpiar timer anterior si existe
    if (this.reloadTimers[type]) {
      clearTimeout(this.reloadTimers[type]);
    }

    // Programar nueva recarga con delay
    this.reloadTimers[type] = setTimeout(() => {
      this._executeReload(type, reason);
    }, APP_CONFIG.TIMEOUTS.FILE_WATCH_DEBOUNCE);
  }

  /**
   * Ejecuta la recarga de datos con retry logic
   * @param {string} type - Tipo de servidor
   * @param {string} reason - Razón de la recarga
   */
  _executeReload(type, reason) {
    try {
      const data = excelParserService.parseExcelByType(type);
      
      // Ejecutar callback si está definido
      if (this.onReloadCallback) {
        this.onReloadCallback(type, data);
      }

      Logger.success(
        `Excel (${type}) recargado${reason ? ' por ' + reason : ''}. ` +
        `Racks=${data.racks.length}, Servers=${data.servers.length}`
      );

    } catch (error) {
      // Retry una vez después de 1s por si el archivo está bloqueado
      Logger.warn(
        `Error recargando Excel (${type}), reintentando en ${APP_CONFIG.TIMEOUTS.RETRY_DELAY}ms...`,
        error.message
      );

      setTimeout(() => {
        this._retryReload(type, reason);
      }, APP_CONFIG.TIMEOUTS.RETRY_DELAY);
    }
  }

  /**
   * Reintenta la recarga después de un error
   * @param {string} type - Tipo de servidor
   * @param {string} reason - Razón de la recarga
   */
  _retryReload(type, reason) {
    try {
      const data = excelParserService.parseExcelByType(type);
      
      if (this.onReloadCallback) {
        this.onReloadCallback(type, data);
      }

      Logger.success(
        `Excel (${type}) recargado tras reintento. ` +
        `Racks=${data.racks.length}, Servers=${data.servers.length}`
      );

    } catch (error) {
      Logger.error(`Fallo recargando Excel (${type}) en reintento:`, error.message);
    }
  }

  /**
   * Configura un watcher para observar cambios en un archivo
   * @param {string} type - Tipo de servidor
   * @param {string} filePath - Ruta del archivo a observar
   * @returns {boolean} true si se configuró exitosamente
   */
  setWatcher(type, filePath) {
    try {
      // Cerrar watcher anterior si existe
      this.closeWatcher(type);

      const watchPath = path.resolve(filePath);
      
      // Validar que el archivo existe
      if (!fs.existsSync(watchPath)) {
        Logger.warn(`No se puede observar archivo inexistente: ${watchPath}`);
        return false;
      }

      // Crear nuevo watcher
      const watcher = chokidar.watch(watchPath, {
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: APP_CONFIG.TIMEOUTS.WRITE_FINISH_STABILITY,
          pollInterval: APP_CONFIG.TIMEOUTS.WRITE_FINISH_POLL
        }
      });

      // Escuchar todos los eventos
      watcher.on('all', (eventName) => {
        Logger.debug(`Archivo (${type}) evento: ${eventName}`);
        this.scheduleReload(type, `evento ${eventName}`);
      });

      this.watchers[type] = watcher;
      Logger.success(`Watcher configurado para ${type}: ${watchPath}`);
      return true;

    } catch (error) {
      Logger.error('No se pudo configurar el watcher:', error.message);
      return false;
    }
  }

  /**
   * Cierra el watcher para un tipo específico
   * @param {string} type - Tipo de servidor
   */
  closeWatcher(type) {
    if (this.watchers[type]) {
      try {
        this.watchers[type].close();
        Logger.info(`Watcher cerrado para ${type}`);
      } catch (error) {
        Logger.error(`Error al cerrar watcher (${type}):`, error.message);
      }
      this.watchers[type] = null;
    }
  }

  /**
   * Cierra todos los watchers activos
   */
  closeAllWatchers() {
    Object.keys(this.watchers).forEach(type => {
      this.closeWatcher(type);
    });
  }
}

// Exportar instancia única (Singleton)
export default new FileWatcherService();

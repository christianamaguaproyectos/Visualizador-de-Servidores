import fs from 'fs';
import path from 'path';
import { APP_CONFIG } from './constants.js';

/**
 * Gestor de configuración de la aplicación
 * Carga y administra el archivo config.json con fallback a config.example.json
 */
class ConfigManager {
  constructor() {
    this.config = null;
    this.configPath = path.resolve(APP_CONFIG.PATHS.CONFIG_FILE);
    this.examplePath = path.resolve(APP_CONFIG.PATHS.CONFIG_EXAMPLE);
  }

  /**
   * Carga la configuración desde el archivo
   * @returns {Object} Objeto de configuración
   */
  load() {
    // Intentar cargar desde config.json, si no existe usar config.example.json
    let config = this._loadFromFile(this.examplePath);
    
    if (fs.existsSync(this.configPath)) {
      try {
        config = this._loadFromFile(this.configPath);
      } catch (error) {
        console.warn('⚠️ Error al cargar config.json, usando config.example.json:', error.message);
      }
    }

    // Normalizar estructura de excelPaths
    this._normalizeExcelPaths(config);
    
    // Establecer valor por defecto de lockOnFirstUpload
    if (typeof config.lockOnFirstUpload === 'undefined') {
      config.lockOnFirstUpload = true;
    }

    this.config = config;
    return config;
  }

  /**
   * Lee y parsea un archivo JSON
   * @param {string} filePath - Ruta del archivo
   * @returns {Object} Contenido parseado
   */
  _loadFromFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Normaliza la estructura de excelPaths para mantener compatibilidad
   * con versiones anteriores del config
   * @param {Object} config - Configuración a normalizar
   */
  _normalizeExcelPaths(config) {
    if (!config.excelPaths) {
      config.excelPaths = {
        [APP_CONFIG.SERVER_TYPES.FISICOS]: config.excelPath || './data/ServidoresFisicos.xlsx',
        [APP_CONFIG.SERVER_TYPES.VIRTUALES]: config.virtualExcelPath || './data/ServidoresVirtuales.xlsx'
      };
    }
  }

  /**
   * Guarda la configuración actual en el archivo config.json
   * @returns {boolean} true si se guardó exitosamente
   */
  save() {
    try {
      fs.writeFileSync(
        this.configPath, 
        JSON.stringify(this.config, null, 2), 
        'utf8'
      );
      return true;
    } catch (error) {
      console.error('❌ Error al guardar configuración:', error.message);
      return false;
    }
  }

  /**
   * Obtiene la ruta del archivo Excel para un tipo específico
   * @param {string} type - Tipo de servidor (fisicos|virtuales)
   * @returns {string} Ruta absoluta del archivo Excel
   */
  getExcelPath(type = APP_CONFIG.SERVER_TYPES.FISICOS) {
    let relativePath = null;

    if (this.config.excelPaths && this.config.excelPaths[type]) {
      relativePath = this.config.excelPaths[type];
    } else if (type === APP_CONFIG.SERVER_TYPES.VIRTUALES) {
      relativePath = this.config.virtualExcelPath || null;
    } else {
      relativePath = this.config.excelPath || null;
    }

    if (!relativePath) {
      // Retorna un path que probablemente no existe; el parser manejará el error
      return path.resolve('.');
    }

    return path.resolve(relativePath);
  }

  /**
   * Actualiza la ruta del Excel para un tipo específico
   * @param {string} type - Tipo de servidor
   * @param {string} newPath - Nueva ruta
   * @returns {boolean} true si se actualizó exitosamente
   */
  setExcelPath(type, newPath) {
    if (!this.config.excelPaths) {
      this.config.excelPaths = {};
    }
    
    this.config.excelPaths[type] = newPath;
    return this.save();
  }

  /**
   * Elimina la ruta del Excel para un tipo específico
   * @param {string} type - Tipo de servidor
   * @returns {boolean} true si se eliminó exitosamente
   */
  removeExcelPath(type) {
    if (this.config.excelPaths && this.config.excelPaths[type]) {
      delete this.config.excelPaths[type];
      return this.save();
    }
    return false;
  }

  /**
   * Obtiene el nombre de la hoja Excel para un tipo específico
   * @param {string} type - Tipo de servidor
   * @returns {string|null} Nombre de la hoja o null
   */
  getSheetName(type) {
    if (type === APP_CONFIG.SERVER_TYPES.VIRTUALES) {
      return this.config.sheetNameVirtuales || this.config.sheetName || null;
    }
    return this.config.sheetName || null;
  }

  /**
   * Obtiene el mapeo de columnas para un tipo específico
   * @param {string} type - Tipo de servidor
   * @returns {Object} Mapeo de columnas
   */
  getColumnsMap(type) {
    if (type === APP_CONFIG.SERVER_TYPES.VIRTUALES && this.config.columnsVirtuales) {
      return this.config.columnsVirtuales;
    }
    return this.config.columns || {};
  }

  /**
   * Obtiene toda la configuración actual
   * @returns {Object} Configuración completa
   */
  getConfig() {
    return this.config;
  }
}

// Exportar instancia única (Singleton)
export default new ConfigManager();

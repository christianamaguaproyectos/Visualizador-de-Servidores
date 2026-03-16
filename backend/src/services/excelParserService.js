import fs from 'fs';
import xlsx from 'xlsx';
import configManager from '../config/configManager.js';
import { APP_CONFIG } from '../config/constants.js';
import Logger from '../utils/logger.js';
import {
  forwardFillRack,
  normalizeRackName,
  isVirtualServer,
  isServerActive
} from '../utils/dataHelpers.js';

/**
 * Servicio para parsear archivos Excel y convertirlos a estructuras de datos
 * Responsable de toda la lógica de lectura y transformación de Excel
 */
class ExcelParserService {
  /**
   * Parsea un archivo Excel según el tipo especificado
   * @param {string} type - Tipo de servidor (fisicos|virtuales)
   * @returns {Object} Estructura { racks, servers, meta }
   */
  parseExcelByType(type = APP_CONFIG.SERVER_TYPES.FISICOS) {
    const excelPath = configManager.getExcelPath(type);

    // Validar existencia del archivo
    if (!fs.existsSync(excelPath)) {
      return this._createErrorResponse(
        type,
        `No se encuentra el archivo Excel (${type}) en ${excelPath}`
      );
    }

    try {
      // Leer workbook
      const workbook = xlsx.readFile(excelPath, { cellDates: true });
      
      // Seleccionar hoja apropiada
      const sheet = this._selectSheet(workbook, type);
      if (!sheet) {
        return this._createErrorResponse(
          type,
          'No se encontró ninguna hoja válida en el Excel'
        );
      }

      // Convertir hoja a JSON
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

      // Procesar datos
      return this._processRows(rows, type);

    } catch (error) {
      Logger.error(`Error parseando Excel (${type}):`, error.message);
      return this._createErrorResponse(type, `Error al leer Excel: ${error.message}`);
    }
  }

  /**
   * Selecciona la hoja apropiada del workbook según el tipo
   * @param {Object} workbook - Workbook de xlsx
   * @param {string} type - Tipo de servidor
   * @returns {Object|null} Sheet seleccionada o null
   */
  _selectSheet(workbook, type) {
    const forcedSheetName = configManager.getSheetName(type);

    // Si hay nombre de hoja forzado y existe, usarla
    if (forcedSheetName && workbook.Sheets[forcedSheetName]) {
      Logger.info(`📊 Usando hoja configurada: ${forcedSheetName}`);
      return workbook.Sheets[forcedSheetName];
    }

    // Autodetección de hoja apropiada
    for (const sheetName of workbook.SheetNames) {
      const testSheet = workbook.Sheets[sheetName];
      const testRows = xlsx.utils.sheet_to_json(testSheet, { defval: '' });
      
      Logger.debug(`Analizando hoja: ${sheetName}, filas: ${testRows.length}`);

      const hasVirtualServers = testRows.some(row => isVirtualServer(row));

      // Para virtuales, buscar hojas con servidores virtuales
      if (type === APP_CONFIG.SERVER_TYPES.VIRTUALES && hasVirtualServers) {
        Logger.success(`Hoja de VIRTUALES detectada: ${sheetName}`);
        return testSheet;
      }

      // Para físicos, usar cualquier hoja con datos (que no sea solo virtuales)
      if (type === APP_CONFIG.SERVER_TYPES.FISICOS && testRows.length > 0 && !hasVirtualServers) {
        Logger.success(`Hoja de FÍSICOS detectada: ${sheetName}`);
        return testSheet;
      }

      // Fallback: primera hoja con datos
      if (!forcedSheetName && testRows.length > 0) {
        return testSheet;
      }
    }

    return null;
  }

  /**
   * Procesa las filas del Excel y las convierte en estructura de datos
   * @param {Array} rows - Filas del Excel
   * @param {string} type - Tipo de servidor
   * @returns {Object} Estructura { racks, servers, meta }
   */
  _processRows(rows, type) {
    const columnsMap = configManager.getColumnsMap(type);
    const rackColumn = configManager.getConfig().columns['rack'];

    // Aplicar forward-fill al campo RACK
    forwardFillRack(rows, rackColumn);

    // Mapear filas a objetos de servidor
    const servers = rows
      .map((row, idx) => this._mapRowToServer(row, idx, columnsMap, rackColumn))
      .filter(server => this._isValidServer(server));

    // Filtrar según tipo
    const filteredServers = this._filterServersByType(servers, type);

    // Normalizar nombres de rack
    filteredServers.forEach(server => {
      server.rackNorm = normalizeRackName(server, type);
    });

    // Remover servidores sin rack válido
    const validServers = filteredServers.filter(s => s.rackNorm !== null);

    // Agrupar por rack
    const racks = this._groupServersByRack(validServers);

    Logger.success(
      `Excel (${type}) procesado: ${racks.length} racks, ${validServers.length} servidores`
    );

    return {
      racks,
      servers: validServers,
      meta: {
        updatedAt: new Date().toISOString(),
        type
      }
    };
  }

  /**
   * Mapea una fila del Excel a un objeto servidor
   * @param {Object} row - Fila del Excel
   * @param {number} idx - Índice de la fila
   * @param {Object} columnsMap - Mapeo de columnas
   * @param {string} rackColumn - Nombre de la columna de rack
   * @returns {Object} Objeto servidor
   */
  _mapRowToServer(row, idx, columnsMap, rackColumn) {
    const mapField = (key) => row[columnsMap?.[key]] ?? '';

    return {
      id: row.id || `${idx + 1}`,
      rack: (row[rackColumn] || row.__rackFilled || '').toString().trim(),
      serverLabel: (mapField('serverLabel') || '').toString().trim(),
      nombre: (mapField('nombre') || '').toString().trim(),
      ip: (mapField('ip') || '').toString().trim(),
      hostname: (mapField('hostname') || '').toString().trim(),
      usuario: mapField('usuario'),
      marca: mapField('marca'),
      modelo: mapField('modelo'),
      tipo: mapField('tipo'),
      HARDWARE: row['HARDWARE'] || '',
      TIPO: row['TIPO'] || '',
      serie: mapField('serie'),
      socket: mapField('socket'),
      noPorSocket: mapField('noPorSocket'),
      procesadoresLogicos: mapField('procesadoresLogicos'),
      ramGb: mapField('ramGb'),
      discos: mapField('discos'),
      datastore: mapField('datastore'),
      conexion: mapField('conexion'),
      software: mapField('software'),
      so: mapField('so'),
      fechaInstalacion: mapField('fechaInstalacion'),
      fechaMantenimiento: mapField('fechaMantenimiento'),
      estado: mapField('estado'),
      backup: mapField('backup'),
      fechaBackup: mapField('fechaBackup'),
      activo: (mapField('activo') || '').toString().trim()
    };
  }

  /**
   * Valida si un servidor tiene datos mínimos requeridos
   * @param {Object} server - Objeto servidor
   * @returns {boolean} true si es válido
   */
  _isValidServer(server) {
    return (
      (server.ip || server.hostname || server.nombre || 
       server.serverLabel || server.marca || server.modelo) &&
      server.rack && 
      server.rack !== ''
    );
  }

  /**
   * Filtra servidores según el tipo (físicos o virtuales)
   * @param {Array} servers - Array de servidores
   * @param {string} type - Tipo de servidor
   * @returns {Array} Servidores filtrados
   */
  _filterServersByType(servers, type) {
    if (type === APP_CONFIG.SERVER_TYPES.VIRTUALES) {
      // Solo servidores virtuales activos
      return servers
        .filter(server => isVirtualServer(server))
        .filter(server => isServerActive(server));
    }

    // Solo servidores físicos (no virtuales)
    return servers.filter(server => !isVirtualServer(server));
  }

  /**
   * Agrupa servidores por rack
   * @param {Array} servers - Array de servidores
   * @returns {Array} Array de racks con sus servidores
   */
  _groupServersByRack(servers) {
    // Obtener nombres únicos de rack, ordenados
    const rackNames = Array.from(new Set(servers.map(s => s.rackNorm)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    // Crear estructura de racks
    return rackNames
      .map(rackName => ({
        name: rackName,
        servers: servers.filter(s => s.rackNorm === rackName)
      }))
      .filter(rack => rack.servers && rack.servers.length > 0);
  }

  /**
   * Crea una respuesta de error estructurada
   * @param {string} type - Tipo de servidor
   * @param {string} errorMessage - Mensaje de error
   * @returns {Object} Estructura de error
   */
  _createErrorResponse(type, errorMessage) {
    return {
      racks: [],
      servers: [],
      meta: {
        error: errorMessage,
        type
      }
    };
  }
}

// Exportar instancia única (Singleton)
export default new ExcelParserService();

import { APP_CONFIG } from '../config/constants.js';

/**
 * Utilidades para normalización y validación de datos
 */

/**
 * Formatea un valor para mostrar, retornando '—' si está vacío
 * @param {any} val - Valor a formatear
 * @returns {string} Valor formateado
 */
export function formatValue(val) {
  return (val ?? '').toString().trim() || '—';
}

/**
 * Normaliza el nombre de un rack basándose en el servidor y tipo
 * @param {Object} server - Objeto servidor
 * @param {string} type - Tipo de servidor (fisicos|virtuales)
 * @returns {string|null} Nombre normalizado del rack o null si inválido
 */
export function normalizeRackName(server, type) {
  const rackValue = (server.rack || '').toString().trim();

  // Para servidores virtuales, agrupar por host ESXi
  if (type === APP_CONFIG.SERVER_TYPES.VIRTUALES) {
    if (rackValue) return rackValue.toUpperCase();
    
    // Fallback: intentar extraer desde serverLabel (formato "X.Y")
    const match = /^(\w+)/.exec(server.serverLabel || '');
    return match ? match[1].toUpperCase() : null;
  }

  // Para servidores físicos, aceptar números de rack
  if (/^\d+$/.test(rackValue)) {
    return `Rack ${rackValue}`;
  }

  // Formato "1.X" -> "Rack 1"
  const dotMatch = /^(\d+)\./.exec(rackValue);
  if (dotMatch) {
    return `Rack ${dotMatch[1]}`;
  }

  // Formato "Rack 1" (case insensitive)
  const rackMatch = /^rack\s*(\d+)$/i.exec(rackValue);
  if (rackMatch) {
    return `Rack ${rackMatch[1]}`;
  }

  // Si no hay rack pero hay serverLabel con formato "1.X"
  if (!rackValue || rackValue === '') {
    const labelMatch = /^(\d+)\./.exec(server.serverLabel || '');
    if (labelMatch) {
      return `Rack ${labelMatch[1]}`;
    }
  }

  return null;
}

/**
 * Determina si un servidor es virtual según sus campos
 * @param {Object} server - Objeto servidor
 * @returns {boolean} true si es virtual
 */
export function isVirtualServer(server) {
  const tipo = (server.TIPO || server.tipo || '').toString().toUpperCase();
  const hardware = (server.HARDWARE || '').toString().toUpperCase();
  return tipo === APP_CONFIG.FILTER_VALUES.VIRTUAL_TYPE || 
         hardware === APP_CONFIG.FILTER_VALUES.VIRTUAL_TYPE;
}

/**
 * Determina si un servidor está activo
 * @param {Object} server - Objeto servidor
 * @returns {boolean} true si está activo (no explícitamente desactivado)
 */
export function isServerActive(server) {
  const activo = (server.activo || '').toString().trim().toUpperCase();
  return !APP_CONFIG.FILTER_VALUES.INACTIVE_VALUES.includes(activo);
}

/**
 * Valida si un archivo tiene una extensión permitida
 * @param {string} filePath - Ruta del archivo
 * @returns {boolean} true si la extensión es válida
 */
export function hasValidExcelExtension(filePath) {
  return APP_CONFIG.ALLOWED_EXTENSIONS.some(ext => 
    filePath.toLowerCase().endsWith(ext)
  );
}

/**
 * Aplica forward-fill al campo RACK para que las filas de servidores
 * hereden el rack del encabezado anterior
 * @param {Array} rows - Array de filas del Excel
 * @param {string} rackColumnName - Nombre de la columna de rack
 * @returns {Array} Filas con el campo __rackFilled agregado
 */
export function forwardFillRack(rows, rackColumnName) {
  let lastRack = '';
  
  rows.forEach(row => {
    const rawRack = (row[rackColumnName] || '').toString().trim();
    if (rawRack) {
      lastRack = rawRack;
    }
    row.__rackFilled = lastRack;
  });

  return rows;
}

export default {
  formatValue,
  normalizeRackName,
  isVirtualServer,
  isServerActive,
  hasValidExcelExtension,
  forwardFillRack
};

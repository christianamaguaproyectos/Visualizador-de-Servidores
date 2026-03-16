/**
 * Constantes globales de la aplicación
 * Centraliza todos los valores mágicos y configuraciones fijas
 */

export const APP_CONFIG = {
  // Configuración del servidor
  DEFAULT_PORT: 3050,
  HOST: '0.0.0.0',
  
  // Tipos de servidores
  SERVER_TYPES: {
    FISICOS: 'fisicos',
    VIRTUALES: 'virtuales'
  },
  
  // Configuración de racks físicos
  RACK: {
    TOTAL_UNITS: 42,
    UNITS_PER_SERVER: 2,
    MAX_SERVERS: 21 // 42 / 2
  },
  
  // Timeouts y delays
  TIMEOUTS: {
    FILE_WATCH_DEBOUNCE: 600, // ms para debounce en file watching
    RETRY_DELAY: 1000, // ms para reintentar lectura de archivo
    WRITE_FINISH_STABILITY: 1000, // ms para chokidar awaitWriteFinish
    WRITE_FINISH_POLL: 200 // ms para chokidar poll interval
  },
  
  // SSE (Server-Sent Events)
  SSE: {
    RETRY_TIME: 2000, // ms que el cliente debe esperar antes de reconectar
    EVENTS: {
      INIT: 'init',
      UPDATE: 'update'
    }
  },
  
  // Paths
  PATHS: {
    CONFIG_FILE: './config.json',
    CONFIG_EXAMPLE: './config.example.json',
    UPLOAD_DIR: './backend/uploads',
    PUBLIC_DIR: './frontend/public'
  },
  
  // Archivos HTML
  HTML_FILES: {
    HOME: './frontend/public/home.html',
    FISICOS: './frontend/public/index.html',
    VIRTUALES: './frontend/public/virtual.html'
  },
  
  // Extensiones permitidas
  ALLOWED_EXTENSIONS: ['.xlsx', '.xls'],
  
  // Valores para filtrado
  FILTER_VALUES: {
    VIRTUAL_TYPE: 'VIRTUAL',
    INACTIVE_VALUES: ['NO', 'N', '0', 'FALSE', 'F']
  }
};

export default APP_CONFIG;

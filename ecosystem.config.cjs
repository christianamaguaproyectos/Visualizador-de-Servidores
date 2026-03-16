/**
 * Configuración PM2 para DiagramaServers
 * Gestiona el servidor con auto-restart, logs y monitoreo
 * 
 * IMPORTANTE: Este archivo usa CommonJS (module.exports) 
 * aunque el proyecto usa ES modules
 */

const path = require('path');

// Ruta absoluta del proyecto
const projectPath = path.resolve(__dirname);

module.exports = {
  apps: [{
    // Configuración de la aplicación
    name: 'diagrama-servidores',
    script: path.join(projectPath, 'backend', 'server.js'),
    
    // Directorio de trabajo
    cwd: projectPath,
    
    // Variables de entorno
    env: {
      NODE_ENV: 'production',
      PORT: 3050,
      SERVICE_NAME: 'diagrama-servidores',
      LOG_FORMAT: 'json'
    },
    
    // Configuración de auto-restart
    watch: false, // No vigilar cambios (solo para desarrollo)
    autorestart: true, // Reiniciar si falla
    max_restarts: 10, // Máximo 10 reinicios en 1 minuto
    min_uptime: '10s', // Considerar "iniciado" después de 10s
    
    // Reiniciar cada hora para detectar cambios de red
    // Si cambias de red Wi-Fi, el servidor se adaptará automáticamente
    cron_restart: '0 * * * *', // Cada hora en punto (00:00, 01:00, etc.)
    
    // Gestión de errores
    error_file: path.join(projectPath, 'logs', 'pm2-error.log'),
    out_file: path.join(projectPath, 'logs', 'pm2-out.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    
    // Configuración de recursos
    max_memory_restart: '200M', // Reiniciar si usa más de 200MB
    
    // Configuración de tiempo
    restart_delay: 4000, // Esperar 4s antes de reiniciar
    
    // Información adicional
    instance_var: 'INSTANCE_ID',
    instances: 1, // Solo 1 instancia (no cluster mode)
    exec_mode: 'fork' // Modo fork (no cluster)
  }]
};

import { APP_CONFIG } from '../config/constants.js';
import Logger from '../utils/logger.js';

/**
 * Servicio para gestionar conexiones SSE (Server-Sent Events)
 * Permite enviar actualizaciones en tiempo real a clientes conectados
 */
class SSEService {
  constructor() {
    // Set de respuestas de clientes conectados
    this.clients = new Set();
  }

  /**
   * Registra un nuevo cliente SSE
   * @param {Object} req - Request de Express
   * @param {Object} res - Response de Express
   */
  addClient(req, res) {
    // Configurar headers SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Flush headers inmediatamente
    if (res.flushHeaders) {
      res.flushHeaders();
    }

    // Enviar tiempo de retry al cliente
    res.write(`retry: ${APP_CONFIG.SSE.RETRY_TIME}\n\n`);

    // Agregar cliente al set
    this.clients.add(res);
    Logger.debug(`Cliente SSE conectado. Total: ${this.clients.size}`);

    // Enviar evento inicial
    this._sendEvent(res, APP_CONFIG.SSE.EVENTS.INIT, { event: 'init' });

    // Remover cliente cuando se desconecte
    req.on('close', () => {
      this.clients.delete(res);
      Logger.debug(`Cliente SSE desconectado. Total: ${this.clients.size}`);
    });
  }

  /**
   * Envía un evento a un cliente específico
   * @param {Object} res - Response de Express
   * @param {string} eventName - Nombre del evento
   * @param {Object} data - Datos a enviar
   */
  _sendEvent(res, eventName, data) {
    try {
      const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
      res.write(payload);
    } catch (error) {
      Logger.error('Error enviando evento SSE:', error.message);
    }
  }

  /**
   * Difunde un evento a todos los clientes conectados
   * @param {string} eventName - Nombre del evento
   * @param {Object} data - Datos a enviar
   */
  broadcast(eventName, data) {
    Logger.debug(`Broadcasting evento "${eventName}" a ${this.clients.size} clientes`);
    
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    
    // Iterar sobre copia del set para evitar problemas si un cliente se desconecta
    const clientsArray = Array.from(this.clients);
    
    clientsArray.forEach(res => {
      try {
        res.write(payload);
      } catch (error) {
        // Si falla, remover el cliente
        Logger.warn('Error enviando a cliente, removiendo de la lista');
        this.clients.delete(res);
      }
    });
  }

  /**
   * Notifica a todos los clientes que los datos se actualizaron
   */
  notifyDataUpdate() {
    this.broadcast(APP_CONFIG.SSE.EVENTS.UPDATE, { event: 'update' });
  }

  /**
   * Obtiene el número de clientes conectados
   * @returns {number} Cantidad de clientes
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Desconecta todos los clientes
   */
  disconnectAll() {
    this.clients.forEach(res => {
      try {
        res.end();
      } catch (error) {
        // Ignorar errores al cerrar
      }
    });
    this.clients.clear();
    Logger.info('Todos los clientes SSE desconectados');
  }
}

// Exportar instancia única (Singleton)
export default new SSEService();

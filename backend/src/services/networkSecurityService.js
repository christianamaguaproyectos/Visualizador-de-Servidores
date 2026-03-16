/**
 * Servicio de Seguridad de Red
 * Detecta el tipo de red y aplica políticas de seguridad
 */

import os from 'os';
import { Logger } from '../utils/logger.js';

/**
 * Servicio para gestionar seguridad basada en el contexto de red
 */
class NetworkSecurityService {
  constructor() {
    // Redes corporativas confiables (Grupo Danec)
    this.trustedNetworks = [
      '192.168.100.', // Red corporativa principal
      '10.0.',        // VPN corporativa
      // Agrega aquí otras redes corporativas de Grupo Danec
    ];

    // IPs locales siempre permitidas
    this.localhostIPs = ['127.0.0.1', '::1', 'localhost'];
  }

  /**
   * Obtiene todas las interfaces de red activas
   * @returns {Array} Lista de interfaces con sus IPs
   */
  getNetworkInterfaces() {
    const interfaces = os.networkInterfaces();
    const result = [];

    for (const [name, addresses] of Object.entries(interfaces)) {
      for (const addr of addresses) {
        if (addr.family === 'IPv4' && !addr.internal) {
          result.push({
            interface: name,
            ip: addr.address,
            netmask: addr.netmask,
            mac: addr.mac
          });
        }
      }
    }

    return result;
  }

  /**
   * Detecta si estamos en una red corporativa confiable
   * @returns {Object} {isTrusted: boolean, currentIP: string, network: string}
   */
  detectNetworkType() {
    const interfaces = this.getNetworkInterfaces();
    
    // Filtrar interfaces virtuales (VMware, VirtualBox, etc.)
    const realInterfaces = interfaces.filter(iface => 
      !iface.interface.toLowerCase().includes('vmware') &&
      !iface.interface.toLowerCase().includes('virtualbox') &&
      !iface.interface.toLowerCase().includes('loopback')
    );

    if (realInterfaces.length === 0) {
      Logger.warn('No se encontraron interfaces de red reales');
      return {
        isTrusted: false,
        currentIP: null,
        network: 'unknown',
        reason: 'Sin conexión a red'
      };
    }

    // Verificar si alguna IP está en redes confiables
    for (const iface of realInterfaces) {
      const ip = iface.ip;
      
      for (const trustedPrefix of this.trustedNetworks) {
        if (ip.startsWith(trustedPrefix)) {
          Logger.success(`Red corporativa detectada: ${ip} (${iface.interface})`);
          return {
            isTrusted: true,
            currentIP: ip,
            network: 'corporate',
            interface: iface.interface,
            reason: `IP en red confiable (${trustedPrefix}x)`
          };
        }
      }
    }

    // Si llegamos aquí, estamos en una red diferente a las corporativas
    const currentIP = realInterfaces[0].ip;
    // Solo log debug en lugar de warning para no saturar logs en producción
    Logger.debug(`Red detectada: ${currentIP} (no configurada como corporativa)`);
    
    return {
      isTrusted: false,
      currentIP: currentIP,
      network: 'public',
      interface: realInterfaces[0].interface,
      reason: 'IP no está en redes corporativas configuradas'
    };
  }

  /**
   * Determina la dirección de binding según el tipo de red
   * @returns {Object} {bindAddress: string, reason: string}
   */
  getSecureBindAddress() {
    const networkInfo = this.detectNetworkType();

    // Forzar binding a todas las interfaces (útil para Docker/contenedores)
    if (process.env.BIND_ALL_INTERFACES === 'true') {
      return {
        bindAddress: '0.0.0.0',
        networkInfo,
        mode: 'forced-all-interfaces',
        message: '🐳 Modo DOCKER/CONTENEDOR: Binding forzado a todas las interfaces'
      };
    }

    if (networkInfo.isTrusted) {
      // Red corporativa: permitir acceso en red local
      return {
        bindAddress: '0.0.0.0', // Todas las interfaces
        networkInfo,
        mode: 'network-access',
        message: '🌐 Modo RED CORPORATIVA: Acceso permitido en red local'
      };
    } else {
      // Red pública/no confiable: solo localhost
      return {
        bindAddress: 'localhost', // Solo local
        networkInfo,
        mode: 'localhost-only',
        message: '🔒 Modo SEGURO: Solo acceso local (red pública detectada)'
      };
    }
  }

  /**
   * Valida si una IP de cliente está permitida
   * @param {string} clientIP - IP del cliente
   * @returns {boolean} true si está permitido
   */
  isIPAllowed(clientIP) {
    // Localhost siempre permitido
    if (this.localhostIPs.includes(clientIP) || clientIP.startsWith('127.')) {
      return true;
    }

    const networkInfo = this.detectNetworkType();
    
    // Si estamos en red corporativa, permitir IPs de esa red
    if (networkInfo.isTrusted) {
      const clientPrefix = clientIP.substring(0, clientIP.lastIndexOf('.') + 1);
      const serverPrefix = networkInfo.currentIP.substring(0, networkInfo.currentIP.lastIndexOf('.') + 1);
      
      return clientPrefix === serverPrefix;
    }

    // En red pública, solo localhost
    return false;
  }

  /**
   * Middleware Express para validar acceso según red
   * @returns {Function} Middleware de Express
   */
  createSecurityMiddleware() {
    return (req, res, next) => {
      const clientIP = req.ip || req.connection.remoteAddress;
      const networkInfo = this.detectNetworkType();

      // Si está en modo Docker/contenedor, permitir todo
      if (process.env.BIND_ALL_INTERFACES === 'true') {
        return next();
      }

      // Siempre permitir localhost
      if (this.localhostIPs.some(ip => clientIP.includes(ip))) {
        return next();
      }

      // Si estamos en red pública, bloquear acceso remoto
      if (!networkInfo.isTrusted) {
        Logger.warn(`🚫 Acceso bloqueado desde ${clientIP} (red pública)`);
        return res.status(403).json({
          error: 'Acceso denegado',
          message: 'El servidor está en modo seguro (red pública). Solo se permite acceso local.',
          hint: 'Conéctate a la red corporativa para acceder remotamente.'
        });
      }

      // Red corporativa - permitir acceso
      next();
    };
  }

  /**
   * Muestra información de seguridad al iniciar
   */
  logSecurityStatus() {
    const secureBinding = this.getSecureBindAddress();
    const networkInfo = secureBinding.networkInfo;

    Logger.info('═══════════════════════════════════════════════════════');
    Logger.info('🔒 ESTADO DE SEGURIDAD DE RED');
    Logger.info('═══════════════════════════════════════════════════════');
    
    if (networkInfo.isTrusted) {
      Logger.success(`✅ Red Corporativa Detectada`);
      Logger.info(`   IP: ${networkInfo.currentIP}`);
      Logger.info(`   Interfaz: ${networkInfo.interface}`);
      Logger.info(`   Modo: Acceso en red local HABILITADO`);
    } else {
      // En producción no mostrar warnings de red - es normal en Docker/contenedores
      Logger.debug(`Red: ${networkInfo.currentIP || 'N/A'} (${networkInfo.interface || 'N/A'})`);
    }
    
    Logger.info(`   Razón: ${networkInfo.reason}`);
    Logger.info('═══════════════════════════════════════════════════════');

    // Mostrar redes confiables configuradas
    Logger.info('🏢 Redes Corporativas Configuradas:');
    this.trustedNetworks.forEach(network => {
      Logger.info(`   - ${network}x`);
    });
    Logger.info('═══════════════════════════════════════════════════════');
  }
}

// Singleton
const networkSecurityService = new NetworkSecurityService();

export default networkSecurityService;

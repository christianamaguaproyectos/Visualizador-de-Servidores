import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validación de entorno (debe ejecutarse primero)
import env from './src/config/env.js';

// Configuración y constantes
import { APP_CONFIG } from './src/config/constants.js';

// Servicios
import sseService from './src/services/sseService.js';
import networkSecurityService from './src/services/networkSecurityService.js';
import authService from './src/services/authService.js';

// Controladores
import dataController from './src/controllers/dataController.js';
import rackController from './src/controllers/rackController.js';
import metaController from './src/controllers/metaController.js';
import authController from './src/controllers/authController.js';
import userController from './src/controllers/userController.js';
import clusterRoutes from './src/routes/clusterRoutes.js';

// Middleware
import { requireAuth, requireAdmin, requireSuperAdmin, injectUser } from './src/middleware/authMiddleware.js';
import { createRateLimiter } from './src/middleware/rateLimitMiddleware.js';
import { attachRequestContext, structuredApiRequestLogger } from './src/middleware/requestContextMiddleware.js';
import { securityHeadersMiddleware } from './src/middleware/securityHeadersMiddleware.js';
import { errorHandler } from './src/middleware/errorHandler.js';

// Utilidades
import Logger from './src/utils/logger.js';
// Monitoreo (carga condicional)
import monitoringConfig from './src/monitoring/config/monitoringConfig.js';

/**
 * Aplicación principal
 * Inicializa el servidor Express y configura todos los servicios
 */
class Application {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || APP_CONFIG.DEFAULT_PORT;
    this.authRateLimiter = createRateLimiter({
      windowMs: 15 * 60 * 1000,
      maxRequests: 10,
      message: 'Demasiados intentos de autenticacion. Espere 15 minutos e intente nuevamente.'
    });
  }

  /**
   * Inicializa la configuración y servicios
   */
  async initialize() {
    Logger.success('Modo PostgreSQL: Sistema completamente basado en BD');

    // Configurar middleware
    this._setupMiddleware();

    // Configurar rutas
    this._setupRoutes();

    // Iniciar monitoreo si está habilitado
    if (monitoringConfig.enabled) {
      Logger.info('Monitoreo habilitado, iniciando scheduler y worker...');
      try {
        const { default: scheduler } = await import('./src/monitoring/scheduler/scheduler.js');
        scheduler.start();
      } catch (e) { Logger.error('Error iniciando scheduler:', e.message); }
      try {
        const { startCheckWorker } = await import('./src/monitoring/workers/checkWorker.js');
        startCheckWorker();
      } catch (e) { Logger.error('Error iniciando worker de checks:', e.message); }
    } else {
      Logger.info('Monitoreo deshabilitado (establece MONITORING_ENABLED=1 para activarlo).');
    }
  }

  /**
   * Configura el middleware de Express
   */
  _setupMiddleware() {
    this.app.use(cors());
    this.app.use(securityHeadersMiddleware);
    this.app.use(express.json());
    this.app.use(attachRequestContext);
    
    // Middleware de sesiones
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'GrupoDanec-DiagramaServidores-2025-SecretKey',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        httpOnly: true,
        // En produccion usa deteccion automatica (https => secure, http => no secure)
        // para no romper sesiones en despliegues on-prem sin TLS terminado en la app.
        secure: process.env.NODE_ENV === 'production' ? 'auto' : false,
        sameSite: 'lax'
      }
    }));
    
    // Inyectar información de usuario en todas las vistas
    this.app.use(injectUser);
    this.app.use(structuredApiRequestLogger);
    
    // Middleware de seguridad de red
    // Solo aplica restricciones si estamos en red pública
    this.app.use(networkSecurityService.createSecurityMiddleware());
  }

  /**
   * Configura todas las rutas de la aplicación
   */
  _setupRoutes() {
    // ========================================
    // RUTAS PÚBLICAS (Sin autenticación)
    // ========================================
    
    // Página de login
    this.app.get('/login', (req, res) => {
      // Si ya está autenticado, redirigir a home
      if (req.session && req.session.user) {
        return res.redirect('/');
      }
      res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'login.html'));
    });

    // API de autenticación
    this.app.post('/api/auth/login', this.authRateLimiter, (req, res, next) => authController.login(req, res, next));
    this.app.post('/api/auth/forgot-password', this.authRateLimiter, (req, res, next) => authController.forgotPassword(req, res, next));
    this.app.post('/api/auth/reset-password', this.authRateLimiter, (req, res, next) => authController.resetPassword(req, res, next));
    this.app.post('/api/auth/logout', (req, res, next) => authController.logout(req, res, next));
    this.app.get('/api/auth/session', (req, res, next) => authController.checkSession(req, res, next));

    // Archivos estáticos públicos (CSS, JS, imágenes)
    // Permitir acceso a archivos de login sin autenticación
    this.app.use('/login-styles.css', express.static(path.join(__dirname, '..', 'frontend', 'public', 'login-styles.css')));
    
    // ========================================
    // MIDDLEWARE DE AUTENTICACIÓN
    // Todas las rutas después requieren login
    // ========================================
    this.app.use(requireAuth);

    // ========================================
    // RUTAS PROTEGIDAS (Requieren autenticación)
    // ========================================

    // Rutas de páginas HTML principales
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'home.html'));
    });

    this.app.get('/fisicos', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'index.html'));
    });

    this.app.get('/virtuales', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'virtual.html'));
    });

    this.app.get('/users', requireSuperAdmin, (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'users.html'));
    });

    // Página de monitoreo (cualquier usuario autenticado)
    this.app.get('/monitoring.html', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'monitoring.html'));
    });

    // Middleware estático (archivos protegidos)
    this.app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

    // API de datos (cualquier usuario autenticado)
    this.app.get('/api/data', (req, res, next) => dataController.getData(req, res, next));
    this.app.get('/api/racks', (req, res, next) => dataController.getRacks(req, res, next));
    this.app.get('/api/servers', (req, res, next) => dataController.getServers(req, res, next));
    
    // API de metadata (cualquier usuario autenticado)
    this.app.get('/api/meta', (req, res, next) => metaController.getMeta(req, res, next));
    
    // API de usuario actual
    this.app.get('/api/auth/user', (req, res, next) => authController.getCurrentUser(req, res, next));

    // API de clusters virtuales
    this.app.use('/api/clusters', clusterRoutes);

    // API de exportación (cualquier usuario autenticado)
    import('./src/routes/exportRoutes.js').then(({ default: exportRoutes }) => {
      this.app.use('/api/export', exportRoutes);
    }).catch(err => {
      console.error('❌ Error cargando rutas de exportación:', err);
    });

    // ========================================
    // RUTAS DE ADMINISTRADOR (Solo admin)
    // ========================================

    // CRUD de Servidores (solo admin)
    this.app.post('/api/servers', requireAdmin, (req, res, next) => dataController.createServer(req, res, next));
    this.app.put('/api/servers/:id', requireAdmin, (req, res, next) => dataController.updateServer(req, res, next));
    this.app.delete('/api/servers/:id', requireAdmin, (req, res, next) => dataController.deleteServer(req, res, next));
    this.app.put('/api/servers/:id/move', requireAdmin, (req, res, next) => dataController.moveServer(req, res, next));
    this.app.put('/api/servers/:id/reposition', requireAdmin, (req, res, next) => dataController.repositionServer(req, res, next));
    this.app.post('/api/servers/swap', requireAdmin, (req, res, next) => dataController.swapServers(req, res, next));

    // CRUD de Racks (solo admin)
    this.app.post('/api/racks', requireAdmin, (req, res, next) => rackController.createRack(req, res, next));
    this.app.get('/api/racks/:id', (req, res, next) => rackController.getRackDetails(req, res, next));
    this.app.put('/api/racks/:id', requireAdmin, (req, res, next) => rackController.updateRack(req, res, next));
    this.app.delete('/api/racks/:id', requireAdmin, (req, res, next) => rackController.deleteRack(req, res, next));
    this.app.delete('/api/racks/by-name/:name', requireAdmin, (req, res, next) => rackController.deleteRackByName(req, res, next));

    // CRUD de Usuarios (solo admin)
    this.app.get('/api/users', (req, res, next) => userController.getAllUsers(req, res, next));
    this.app.get('/api/users/me', (req, res, next) => userController.getMyProfile(req, res, next));
    this.app.post('/api/users', (req, res, next) => userController.createUser(req, res, next));
    this.app.put('/api/users/:id', (req, res, next) => userController.updateUser(req, res, next));
    this.app.post('/api/users/:id/change-password', (req, res, next) => userController.changePassword(req, res, next));
    this.app.delete('/api/users/:id', (req, res, next) => userController.deleteUser(req, res, next));
    this.app.delete('/api/users/:id/permanent', (req, res, next) => userController.permanentlyDeleteUser(req, res, next));

    // SSE (Server-Sent Events) - todos los usuarios autenticados
    this.app.get('/events', (req, res, next) => sseService.addClient(req, res, next));

    // ========================================
    // RUTAS DE MONITOREO (opt-in)
    // ========================================
    if (monitoringConfig.enabled) {
      import('./src/monitoring/routes/index.js').then(({ default: monitoringRouter }) => {
        this.app.use('/api/monitoring', monitoringRouter);
      }).catch(() => {});
    }

    // ========================================
    // ERROR HANDLER CENTRALIZADO (debe ir AL FINAL)
    // ========================================
    this.app.use(errorHandler);
  }

  /**
   * Inicia el servidor HTTP
   */
  start() {
    // Obtener binding seguro según tipo de red
    const secureBinding = networkSecurityService.getSecureBindAddress();
    const bindAddress = secureBinding.bindAddress;
    const networkInfo = secureBinding.networkInfo;

    // Mostrar información de seguridad
    networkSecurityService.logSecurityStatus();

    this.app.listen(this.port, bindAddress, () => {
      Logger.success(`✅ Servidor iniciado en http://localhost:${this.port}`);
      
      if (bindAddress === '0.0.0.0') {
        if (secureBinding.mode === 'forced-all-interfaces') {
          Logger.success(`🐳 Modo Docker/Contenedor: Accesible en todas las interfaces`);
          Logger.info(`   Acceso habilitado desde: http://<host-ip>:${this.port}`);
        } else if (networkInfo.isTrusted) {
          Logger.success(`🌐 Accesible en red local: http://${networkInfo.currentIP}:${this.port}`);
          Logger.info(`   Otros dispositivos pueden acceder desde http://${networkInfo.currentIP}:${this.port}`);
        }
      } else {
        Logger.warn(`🔒 Modo seguro activado: Solo acceso local`);
        Logger.warn(`   Conéctate a la red corporativa (192.168.100.x) para acceso en red`);
      }
    });
  }

  /**
   * Manejo de cierre graceful
   */
  setupGracefulShutdown() {
    const shutdown = () => {
      Logger.info('Cerrando aplicación...');
      
      // Desconectar clientes SSE
      sseService.disconnectAll();
      
      Logger.success('Aplicación cerrada correctamente');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}

// Punto de entrada de la aplicación
(async () => {
  try {
    const app = new Application();
    await app.initialize();
    app.setupGracefulShutdown();
    app.start();
  } catch (error) {
    Logger.error('Error fatal al iniciar aplicación:', error);
    process.exit(1);
  }
})();

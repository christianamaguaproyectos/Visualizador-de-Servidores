/**
 * Middleware de Autenticación
*/

import { Logger } from '../utils/logger.js';

/**
 * Middleware que verifica si el usuario está autenticado
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 * @param {Function} next - Siguiente middleware
 */
export function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    // Usuario autenticado
    return next();
  }

  // No autenticado - redirigir a login
  if (req.path.startsWith('/api/')) {
    // Para peticiones API, devolver 401
    return res.status(401).json({
      error: 'No autorizado',
        message: 'Debes iniciar sesión para acceder a este recurso',
        requestId: req.requestId || null
    });
  } else {
    // Para páginas HTML, redirigir a login
    return res.redirect('/login');
  }
}

/**
 * Middleware que verifica si el usuario es admin
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 * @param {Function} next - Siguiente middleware
 */
export function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    Logger.warn('⚠️  Intento de acceso sin autenticación');
    
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({
        error: 'No autorizado',
        message: 'Debes iniciar sesión',
        requestId: req.requestId || null
      });
    } else {
      return res.redirect('/login');
    }
  }

  if (req.session.user.role !== 'admin') {
    Logger.warn(`⚠️  Usuario '${req.session.user.username}' intentó acceso de admin`);
    
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tienes permisos de administrador',
        requestId: req.requestId || null
      });
    } else {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Acceso Denegado</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 10px;
              box-shadow: 0 10px 25px rgba(0,0,0,0.2);
              text-align: center;
              max-width: 400px;
            }
            h1 {
              color: #e74c3c;
              margin-bottom: 10px;
            }
            p {
              color: #555;
              margin-bottom: 20px;
            }
            a {
              display: inline-block;
              padding: 10px 20px;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              transition: background 0.3s;
            }
            a:hover {
              background: #764ba2;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚫 Acceso Denegado</h1>
            <p>No tienes permisos de administrador para acceder a este recurso.</p>
            <p>Solo usuarios con rol 'admin' pueden realizar esta acción.</p>
            <a href="/">Volver al inicio</a>
          </div>
        </body>
        </html>
      `);
    }
  }

  // Usuario es admin
  next();
}

/**
 * Middleware que inyecta información del usuario en todas las vistas
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 * @param {Function} next - Siguiente middleware
 */
export function injectUser(req, res, next) {
  // Hacer disponible el usuario en todas las rutas
  res.locals.user = req.session?.user || null;
  res.locals.isAuthenticated = !!req.session?.user;
  res.locals.isAdmin = req.session?.user?.role === 'admin';
  
  next();
}

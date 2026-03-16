/**
 * Controlador de Autenticación
 * Maneja login, logout y verificación de sesión
 */

import authService from '../services/authService.js';
import { Logger } from '../utils/logger.js';

/**
 * Controlador de autenticación
 */
class AuthController {
  sanitizeForLog(value) {
    return (value ?? '')
      .toString()
      .replace(/[\r\n\t]/g, ' ')
      .slice(0, 120);
  }

  /**
   * Procesa el login
   * @param {Object} req - Request de Express
   * @param {Object} res - Response de Express
   */
  async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Usuario y contraseña son requeridos'
        });
      }

      const usuario = String(username).trim();
      const clave = String(password);
      if (usuario.length < 3 || usuario.length > 80) {
        return res.status(400).json({
          success: false,
          message: 'Usuario invalido'
        });
      }
      if (clave.length < 8 || clave.length > 256) {
        return res.status(400).json({
          success: false,
          message: 'Credenciales invalidas'
        });
      }

      // Validar credenciales
      const user = await authService.validateUser(usuario, clave);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Usuario o contraseña incorrectos'
        });
      }

      // Crear sesión
      req.session.user = user;

      Logger.success(`✅ Sesión creada para ${this.sanitizeForLog(user.username)}`);

      res.json({
        success: true,
        message: 'Login exitoso',
        user: {
          username: user.username,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      Logger.error('❌ Error en login:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }

  /**
   * Procesa el logout
   * @param {Object} req - Request de Express
   * @param {Object} res - Response de Express
   */
  logout(req, res) {
    const username = req.session?.user?.username || 'Desconocido';

    req.session.destroy((err) => {
      if (err) {
        Logger.error('❌ Error al cerrar sesión:', err);
        return res.status(500).json({
          success: false,
          message: 'Error al cerrar sesión'
        });
      }

      Logger.info(`ℹ️  Sesión cerrada: ${username}`);
      
      res.json({
        success: true,
        message: 'Sesión cerrada correctamente'
      });
    });
  }

  /**
   * Verifica el estado de la sesión
   * @param {Object} req - Request de Express
   * @param {Object} res - Response de Express
   */
  checkSession(req, res) {
    if (req.session && req.session.user) {
      res.json({
        authenticated: true,
        user: {
          username: req.session.user.username,
          name: req.session.user.name,
          role: req.session.user.role
        }
      });
    } else {
      res.json({
        authenticated: false
      });
    }
  }

  /**
   * Obtiene información del usuario actual
   * @param {Object} req - Request de Express
   * @param {Object} res - Response de Express
   */
  getCurrentUser(req, res) {
    if (req.session && req.session.user) {
      res.json({
        success: true,
        user: {
          username: req.session.user.username,
          name: req.session.user.name,
          role: req.session.user.role
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'No autenticado'
      });
    }
  }
}

// Singleton
const authController = new AuthController();

export default authController;

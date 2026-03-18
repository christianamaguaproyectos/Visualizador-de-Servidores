/**
 * Controlador de Autenticación
 * Maneja login, logout y verificación de sesión
 */

import authService from '../services/authService.js';
import passwordRecoveryService from '../services/passwordRecoveryService.js';
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
          role: user.role,
          isSuperAdmin: authService.isSuperAdmin(user)
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
   * Procesa el login de invitado sin contraseña
   * @param {Object} req - Request de Express
   * @param {Object} res - Response de Express
   */
  loginGuest(req, res) {
    try {
      const guestUser = {
        id: 0,
        username: 'invitado',
        name: 'Invitado',
        role: 'viewer',
        email: null,
        isGuest: true
      };

      req.session.user = guestUser;

      Logger.info('ℹ️  Sesión de invitado creada');

      res.json({
        success: true,
        message: 'Login de invitado exitoso',
        user: {
          username: guestUser.username,
          name: guestUser.name,
          role: guestUser.role,
          isSuperAdmin: false
        }
      });
    } catch (error) {
      Logger.error('❌ Error en login de invitado:', error);
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
          role: req.session.user.role,
          isSuperAdmin: authService.isSuperAdmin(req.session.user)
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
          role: req.session.user.role,
          email: req.session.user.email || null,
          id: req.session.user.id || null,
          isSuperAdmin: authService.isSuperAdmin(req.session.user)
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'No autenticado'
      });
    }
  }

  /**
   * Inicia flujo de recuperación de contraseña
   * @param {Object} req
   * @param {Object} res
   */
  async forgotPassword(req, res) {
    try {
      const { identifier } = req.body || {};
      const value = String(identifier || '').trim();

      if (!value || value.length < 3) {
        return res.status(200).json({
          success: true,
          message: 'Si la cuenta existe, enviaremos instrucciones al correo registrado.'
        });
      }

      const result = await authService.createPasswordResetToken(value);
      if (!result.found) {
        return res.status(200).json({
          success: true,
          message: 'Si la cuenta existe, enviaremos instrucciones al correo registrado.'
        });
      }

      const resetLink = `${req.protocol}://${req.get('host')}/login?resetToken=${encodeURIComponent(result.token)}`;
      const mail = await passwordRecoveryService.sendResetEmail({
        to: result.user.email,
        name: result.user.name || result.user.username,
        resetLink
      });

      const response = {
        success: true,
        message: 'Si la cuenta existe, enviaremos instrucciones al correo registrado.'
      };

      if (!mail.sent && process.env.NODE_ENV !== 'production') {
        response.debugToken = result.token;
      }

      res.status(200).json(response);
    } catch (error) {
      Logger.error('❌ Error en forgotPassword:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }

  /**
   * Restablece contraseña usando token
   * @param {Object} req
   * @param {Object} res
   */
  async resetPassword(req, res) {
    try {
      const { token, password } = req.body || {};
      const newPassword = String(password || '');

      if (!token || newPassword.length < 8 || newPassword.length > 256) {
        return res.status(400).json({
          success: false,
          message: 'Token o contraseña inválidos'
        });
      }

      const success = await authService.resetPasswordWithToken(token, newPassword);
      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'El enlace de recuperación no es válido o expiró'
        });
      }

      res.json({
        success: true,
        message: 'Contraseña restablecida correctamente'
      });
    } catch (error) {
      Logger.error('❌ Error en resetPassword:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
}

// Singleton
const authController = new AuthController();

export default authController;

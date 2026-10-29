import authService from '../services/authService.js';
import passwordRecoveryService from '../services/passwordRecoveryService.js';
import Logger from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Controlador para gestión de usuarios
 */
class UserController {
  _isSuperAdmin(req) {
    return authService.isSuperAdmin(req.session?.user);
  }

  _currentUserId(req) {
    return Number(req.session?.user?.id || 0);
  }

  /**
   * Obtiene todos los usuarios
   * GET /api/users
   */
  async getAllUsers(req, res) {
    try {
      if (!req.session?.user) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      if (!this._isSuperAdmin(req)) {
        const user = await authService.getUserById(this._currentUserId(req));
        return res.json({ users: user ? [user] : [] });
      }

      const users = await authService.getAllUsers();
      res.json({ users });
    } catch (error) {
      Logger.error('Error obteniendo usuarios:', error);
      res.status(500).json({ error: 'Error obteniendo usuarios' });
    }
  }

  /**
   * Crea un nuevo usuario
   * POST /api/users
   * - Si se envía password: se crea con esa contraseña directamente
   * - Si NO se envía password: se genera una temporal, se crea un token de invitación
   *   y se envía un email para que el usuario establezca su propia contraseña
   */
  async createUser(req, res) {
    try {
      if (!this._isSuperAdmin(req)) {
        return res.status(403).json({ error: 'Solo superadmin puede crear usuarios' });
      }

      const { username, password, role, name, email } = req.body;

      if (!username) {
        return res.status(400).json({ error: 'Username es requerido' });
      }

      if (role && role !== 'admin' && role !== 'viewer') {
        return res.status(400).json({ error: 'Rol debe ser admin o viewer' });
      }

      // Si no se provee password, generar uno aleatorio temporal
      const finalPassword = password || crypto.randomBytes(16).toString('hex');

      const success = await authService.addUser(
        username,
        finalPassword,
        role || 'viewer',
        name || username,
        email || null
      );

      if (!success) {
        return res.status(400).json({ error: 'No se pudo crear el usuario (posiblemente ya existe)' });
      }

      // Si no se envió contraseña, generar token de invitación y enviar email
      if (!password) {
        const tokenResult = await authService.createPasswordResetToken(username);

        if (tokenResult.found && tokenResult.token) {
          const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
          const inviteLink = `${appUrl}/login?resetToken=${tokenResult.token}`;

          let emailResult = { sent: false, reason: 'no_email' };

          if (email) {
            emailResult = await passwordRecoveryService.sendInvitationEmail({
              to: email,
              name: name || username,
              inviteLink
            });
          }

          if (emailResult.sent) {
            return res.json({
              ok: true,
              message: `Usuario creado. Se envió un email de invitación a ${email}.`
            });
          } else {
            // Fallback: devolver el enlace en la respuesta
            return res.json({
              ok: true,
              message: 'Usuario creado. Comparte el enlace de invitación manualmente.',
              inviteLink
            });
          }
        }
      }

      res.json({ ok: true, message: 'Usuario creado exitosamente' });
    } catch (error) {
      Logger.error('Error creando usuario:', error);
      res.status(500).json({ error: 'Error creando usuario' });
    }
  }

  /**
   * Actualiza un usuario
   * PUT /api/users/:id
   */
  async updateUser(req, res) {
    try {
      const targetId = parseInt(req.params.id, 10);
      const requesterId = this._currentUserId(req);
      const isSuperAdmin = this._isSuperAdmin(req);
      const updates = { ...(req.body || {}) };

      if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ error: 'ID inválido' });
      }

      if (!isSuperAdmin && targetId !== requesterId) {
        return res.status(403).json({ error: 'Solo puedes editar tu propio perfil' });
      }

      if (!isSuperAdmin) {
        delete updates.role;
        delete updates.active;
      }

      if (updates.role && !['viewer', 'admin'].includes(updates.role)) {
        return res.status(400).json({ error: 'Rol inválido' });
      }

      const success = await authService.updateUser(targetId, updates);

      if (success) {
        res.json({ ok: true, message: 'Usuario actualizado exitosamente' });
      } else {
        res.status(404).json({ error: 'Usuario no encontrado' });
      }
    } catch (error) {
      Logger.error('Error actualizando usuario:', error);
      res.status(500).json({ error: 'Error actualizando usuario' });
    }
  }

  /**
   * Cambia la contraseña de un usuario
   * POST /api/users/:id/change-password
   */
  async changePassword(req, res) {
    try {
      const targetId = parseInt(req.params.id, 10);
      const requesterId = this._currentUserId(req);
      const isSuperAdmin = this._isSuperAdmin(req);
      const { password, currentPassword } = req.body || {};

      if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ error: 'ID inválido' });
      }

      if (!password) {
        return res.status(400).json({ error: 'Password es requerido' });
      }

      if (!isSuperAdmin && targetId !== requesterId) {
        return res.status(403).json({ error: 'Solo puedes cambiar tu propia contraseña' });
      }

      if (!isSuperAdmin) {
        if (!currentPassword) {
          return res.status(400).json({ error: 'Debes enviar tu contraseña actual' });
        }

        const validCurrent = await authService.validateCurrentPassword(targetId, currentPassword);
        if (!validCurrent) {
          return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }
      }

      const success = await authService.changePassword(targetId, password);

      if (success) {
        res.json({ ok: true, message: 'Contraseña actualizada exitosamente' });
      } else {
        res.status(404).json({ error: 'Usuario no encontrado' });
      }
    } catch (error) {
      Logger.error('Error cambiando contraseña:', error);
      res.status(500).json({ error: 'Error cambiando contraseña' });
    }
  }

  /**
   * Elimina (desactiva) un usuario
   * DELETE /api/users/:id
   */
  async deleteUser(req, res) {
    try {
      if (!this._isSuperAdmin(req)) {
        return res.status(403).json({ error: 'Solo superadmin puede desactivar usuarios' });
      }

      const { id } = req.params;

      const success = await authService.removeUser(parseInt(id));

      if (success) {
        res.json({ ok: true, message: 'Usuario desactivado exitosamente' });
      } else {
        res.status(404).json({ error: 'Usuario no encontrado' });
      }
    } catch (error) {
      Logger.error('Error eliminando usuario:', error);
      res.status(500).json({ error: 'Error eliminando usuario' });
    }
  }

  /**
   * Elimina permanentemente un usuario de la BD
   * DELETE /api/users/:id/permanent
   */
  async permanentlyDeleteUser(req, res) {
    try {
      if (!this._isSuperAdmin(req)) {
        return res.status(403).json({ error: 'Solo superadmin puede eliminar usuarios permanentemente' });
      }

      const { id } = req.params;
      const targetId = parseInt(id);

      // Proteger contra eliminar al propio usuario
      if (targetId === this._currentUserId(req)) {
        return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
      }

      const success = await authService.permanentlyDeleteUser(targetId);

      if (success) {
        res.json({ ok: true, message: 'Usuario eliminado permanentemente' });
      } else {
        res.status(404).json({ error: 'Usuario no encontrado' });
      }
    } catch (error) {
      Logger.error('Error eliminando usuario permanentemente:', error);
      res.status(500).json({ error: 'Error eliminando usuario' });
    }
  }

  /**
   * Obtiene perfil del usuario autenticado
   * GET /api/users/me
   */
  async getMyProfile(req, res) {
    try {
      const userId = this._currentUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      const user = await authService.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json({ user, isSuperAdmin: this._isSuperAdmin(req) });
    } catch (error) {
      Logger.error('Error obteniendo perfil:', error);
      res.status(500).json({ error: 'Error obteniendo perfil' });
    }
  }
}

export default new UserController();

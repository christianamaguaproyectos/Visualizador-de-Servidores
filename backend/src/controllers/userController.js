import authService from '../services/authService.js';
import Logger from '../utils/logger.js';

/**
 * Controlador para gestión de usuarios
 */
class UserController {
  /**
   * Obtiene todos los usuarios
   * GET /api/users
   */
  async getAllUsers(req, res) {
    try {
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
   */
  async createUser(req, res) {
    try {
      const { username, password, role, name, email } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username y password son requeridos' });
      }

      if (role && role !== 'admin' && role !== 'viewer') {
        return res.status(400).json({ error: 'Rol debe ser admin o viewer' });
      }

      const success = await authService.addUser(
        username,
        password,
        role || 'viewer',
        name || username,
        email || null
      );

      if (success) {
        res.json({ ok: true, message: 'Usuario creado exitosamente' });
      } else {
        res.status(400).json({ error: 'No se pudo crear el usuario (posiblemente ya existe)' });
      }
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
      const { id } = req.params;
      const updates = req.body;

      const success = await authService.updateUser(parseInt(id), updates);

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
      const { id } = req.params;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ error: 'Password es requerido' });
      }

      const success = await authService.changePassword(parseInt(id), password);

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
}

export default new UserController();

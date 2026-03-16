/**
 * Servicio de Autenticación
 * Gestiona validación de usuarios, contraseñas y roles usando PostgreSQL
 */

import bcrypt from 'bcrypt';
import { withClient } from '../config/db.js';
import { Logger } from '../utils/logger.js';

/**
 * Servicio de autenticación con bcrypt y PostgreSQL
 */
class AuthService {
  constructor() {
    Logger.info('🔐 AuthService inicializado con PostgreSQL');
  }

  /**
   * Valida credenciales de usuario
   * @param {string} username - Nombre de usuario
   * @param {string} password - Contraseña en texto plano
   * @returns {Promise<Object|null>} Usuario si es válido, null si no
   */
  async validateUser(username, password) {
    try {
      return await withClient(async (client) => {
        const { rows } = await client.query(
          'SELECT id, username, password_hash, role, name, email, active FROM users.users WHERE username = $1',
          [username]
        );

        if (rows.length === 0) {
          Logger.warn(`⚠️  Intento de login fallido: usuario '${username}' no encontrado`);
          return null;
        }

        const user = rows[0];

        if (!user.active) {
          Logger.warn(`⚠️  Intento de login fallido: usuario '${username}' está inactivo`);
          return null;
        }

        const isValid = await bcrypt.compare(password, user.password_hash);

        if (isValid) {
          Logger.success(`✅ Login exitoso: ${username} (${user.role})`);

          // Actualizar último login
          await client.query(
            'UPDATE users.users SET last_login = NOW() WHERE id = $1',
            [user.id]
          );

          // Retornar usuario sin la contraseña
          return {
            id: user.id,
            username: user.username,
            role: user.role,
            name: user.name,
            email: user.email
          };
        } else {
          Logger.warn(`⚠️  Intento de login fallido: contraseña incorrecta para '${username}'`);
          return null;
        }
      });
    } catch (error) {
      Logger.error('❌ Error al validar usuario:', error.message);
      return null;
    }
  }

  /**
   * Verifica si un usuario tiene un rol específico
   * @param {Object} user - Usuario a verificar
   * @param {string} role - Rol requerido
   * @returns {boolean} true si tiene el rol
   */
  hasRole(user, role) {
    return user && user.role === role;
  }

  /**
   * Verifica si un usuario es admin
   * @param {Object} user - Usuario a verificar
   * @returns {boolean} true si es admin
   */
  isAdmin(user) {
    return this.hasRole(user, 'admin');
  }

  /**
   * Verifica si un usuario puede modificar datos
   * @param {Object} user - Usuario a verificar
   * @returns {boolean} true si puede modificar
   */
  canModify(user) {
    return this.isAdmin(user);
  }

  /**
   * Obtiene todos los usuarios (sin contraseñas)
   * @returns {Promise<Array>} Lista de usuarios
   */
  async getAllUsers() {
    try {
      return await withClient(async (client) => {
        const { rows } = await client.query(
          `SELECT id, username, role, name, email, active, last_login, created_at 
           FROM users.users 
           ORDER BY created_at DESC`
        );
        return rows;
      });
    } catch (error) {
      Logger.error('❌ Error al obtener usuarios:', error.message);
      return [];
    }
  }

  /**
   * Agrega un nuevo usuario
   * @param {string} username - Nombre de usuario
   * @param {string} password - Contraseña en texto plano
   * @param {string} role - Rol del usuario
   * @param {string} name - Nombre completo
   * @param {string} email - Email (opcional)
   * @returns {Promise<boolean>} true si se agregó correctamente
   */
  async addUser(username, password, role = 'viewer', name = '', email = null) {
    try {
      return await withClient(async (client) => {
        // Verificar si ya existe
        const existing = await client.query(
          'SELECT id FROM users.users WHERE username = $1',
          [username]
        );

        if (existing.rows.length > 0) {
          Logger.error(`❌ Usuario '${username}' ya existe`);
          return false;
        }

        // Hash de contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Agregar usuario
        await client.query(
          `INSERT INTO users.users (username, password_hash, role, name, email, active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [username, hashedPassword, role, name || username, email]
        );

        Logger.success(`✅ Usuario '${username}' agregado exitosamente`);
        return true;
      });
    } catch (error) {
      Logger.error('❌ Error al agregar usuario:', error.message);
      return false;
    }
  }

  /**
   * Elimina un usuario (lo marca como inactivo)
   * @param {number} userId - ID del usuario a eliminar
   * @returns {Promise<boolean>} true si se eliminó correctamente
   */
  async removeUser(userId) {
    try {
      return await withClient(async (client) => {
        const result = await client.query(
          'UPDATE users.users SET active = false, updated_at = NOW() WHERE id = $1 RETURNING username',
          [userId]
        );

        if (result.rows.length > 0) {
          Logger.success(`✅ Usuario '${result.rows[0].username}' desactivado`);
          return true;
        } else {
          Logger.warn(`⚠️  Usuario con ID ${userId} no encontrado`);
          return false;
        }
      });
    } catch (error) {
      Logger.error('❌ Error al eliminar usuario:', error.message);
      return false;
    }
  }

  /**
   * Cambia la contraseña de un usuario
   * @param {number} userId - ID del usuario
   * @param {string} newPassword - Nueva contraseña en texto plano
   * @returns {Promise<boolean>} true si se cambió correctamente
   */
  async changePassword(userId, newPassword) {
    try {
      return await withClient(async (client) => {
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const result = await client.query(
          'UPDATE users.users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING username',
          [hashedPassword, userId]
        );

        if (result.rows.length > 0) {
          Logger.success(`✅ Contraseña de '${result.rows[0].username}' actualizada`);
          return true;
        } else {
          Logger.error(`❌ Usuario con ID ${userId} no encontrado`);
          return false;
        }
      });
    } catch (error) {
      Logger.error('❌ Error al cambiar contraseña:', error.message);
      return false;
    }
  }

  /**
   * Actualiza datos de un usuario
   * @param {number} userId - ID del usuario
   * @param {Object} updates - Datos a actualizar
   * @returns {Promise<boolean>} true si se actualizó correctamente
   */
  async updateUser(userId, updates) {
    try {
      return await withClient(async (client) => {
        const fields = [];
        const values = [];
        let paramCount = 1;

        if (updates.name !== undefined) {
          fields.push(`name = $${paramCount++}`);
          values.push(updates.name);
        }
        if (updates.email !== undefined) {
          fields.push(`email = $${paramCount++}`);
          values.push(updates.email);
        }
        if (updates.role !== undefined) {
          fields.push(`role = $${paramCount++}`);
          values.push(updates.role);
        }
        if (updates.active !== undefined) {
          fields.push(`active = $${paramCount++}`);
          values.push(updates.active);
        }

        if (fields.length === 0) {
          Logger.warn('⚠️  No hay campos para actualizar');
          return false;
        }

        fields.push(`updated_at = NOW()`);
        values.push(userId);

        const result = await client.query(
          `UPDATE users.users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING username`,
          values
        );

        if (result.rows.length > 0) {
          Logger.success(`✅ Usuario '${result.rows[0].username}' actualizado`);
          return true;
        } else {
          Logger.error(`❌ Usuario con ID ${userId} no encontrado`);
          return false;
        }
      });
    } catch (error) {
      Logger.error('❌ Error al actualizar usuario:', error.message);
      return false;
    }
  }
}

export default new AuthService();


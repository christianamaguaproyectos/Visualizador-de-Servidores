/**
 * Servicio de Autenticación
 * Gestiona validación de usuarios, contraseñas y roles usando PostgreSQL
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
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
   * Verifica si un usuario es superadmin
   * @param {Object} user - Usuario a verificar
   * @returns {boolean} true si es superadmin
   */
  isSuperAdmin(user) {
    if (!user) return false;
    if (user.role === 'superadmin') return true;

    const configured = this.getConfiguredSuperAdmins();
    const username = (user.username || '').toLowerCase();
    return configured.has(username);
  }

  /**
   * Obtiene usernames configurados como superadmin
   * @returns {Set<string>} set de usernames
   */
  getConfiguredSuperAdmins() {
    const usernames = [
      process.env.SUPERADMIN_USERNAME || '',
      process.env.SUPERADMIN_USERNAMES || '',
      'admin'
    ]
      .join(',')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    return new Set(usernames);
  }

  /**
   * Verifica si un usuario puede modificar datos
   * @param {Object} user - Usuario a verificar
   * @returns {boolean} true si puede modificar
   */
  canModify(user) {
    return this.isAdmin(user) || this.isSuperAdmin(user);
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

  /**
   * Obtiene un usuario por ID (sin contraseña)
   * @param {number} userId - ID del usuario
   * @returns {Promise<Object|null>} Usuario o null
   */
  async getUserById(userId) {
    try {
      return await withClient(async (client) => {
        const { rows } = await client.query(
          `SELECT id, username, role, name, email, active, last_login, created_at
           FROM users.users
           WHERE id = $1`,
          [userId]
        );
        return rows[0] || null;
      });
    } catch (error) {
      Logger.error('❌ Error al obtener usuario por ID:', error.message);
      return null;
    }
  }

  /**
   * Valida contraseña actual de un usuario
   * @param {number} userId - ID del usuario
   * @param {string} plainPassword - Contraseña en texto plano
   * @returns {Promise<boolean>} true si coincide
   */
  async validateCurrentPassword(userId, plainPassword) {
    try {
      return await withClient(async (client) => {
        const { rows } = await client.query(
          'SELECT password_hash FROM users.users WHERE id = $1 AND active = true',
          [userId]
        );

        if (rows.length === 0) return false;
        return bcrypt.compare(String(plainPassword || ''), rows[0].password_hash);
      });
    } catch (error) {
      Logger.error('❌ Error validando contraseña actual:', error.message);
      return false;
    }
  }

  /**
   * Garantiza existencia de tabla para recuperación de contraseña
   * @returns {Promise<void>}
   */
  async ensurePasswordResetTable() {
    try {
      await withClient(async (client) => {
        await client.query(`
          CREATE TABLE IF NOT EXISTS users.password_reset_tokens (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
            token_hash VARCHAR(128) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);

        await client.query('CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON users.password_reset_tokens(token_hash)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON users.password_reset_tokens(user_id)');
      });
    } catch (error) {
      Logger.error('❌ Error asegurando tabla de recuperación de contraseña:', error.message);
    }
  }

  /**
   * Genera token de recuperación para usuario por username o email
   * @param {string} identifier - Username o email
   * @returns {Promise<{found:boolean, token?:string, user?:Object}>}
   */
  async createPasswordResetToken(identifier) {
    try {
      await this.ensurePasswordResetTable();
      return await withClient(async (client) => {
        const value = String(identifier || '').trim().toLowerCase();
        const { rows } = await client.query(
          `SELECT id, username, name, email
           FROM users.users
           WHERE active = true AND (LOWER(username) = $1 OR LOWER(email) = $1)
           LIMIT 1`,
          [value]
        );

        if (rows.length === 0) {
          return { found: false };
        }

        const user = rows[0];
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        await client.query('UPDATE users.password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
        await client.query(
          `INSERT INTO users.password_reset_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
          [user.id, tokenHash]
        );

        return { found: true, token, user };
      });
    } catch (error) {
      Logger.error('❌ Error creando token de recuperación:', error.message);
      return { found: false };
    }
  }

  /**
   * Aplica un reset de contraseña mediante token
   * @param {string} token - Token de recuperación
   * @param {string} newPassword - Nueva contraseña
   * @returns {Promise<boolean>} true si fue aplicado
   */
  async resetPasswordWithToken(token, newPassword) {
    try {
      await this.ensurePasswordResetTable();
      return await withClient(async (client) => {
        const tokenHash = crypto.createHash('sha256').update(String(token || '')).digest('hex');

        const { rows } = await client.query(
          `SELECT prt.id, prt.user_id
           FROM users.password_reset_tokens prt
           JOIN users.users u ON u.id = prt.user_id
           WHERE prt.token_hash = $1
             AND prt.used_at IS NULL
             AND prt.expires_at > NOW()
             AND u.active = true
           LIMIT 1`,
          [tokenHash]
        );

        if (rows.length === 0) {
          return false;
        }

        const reset = rows[0];
        const hashedPassword = await bcrypt.hash(String(newPassword || ''), 10);

        await client.query(
          'UPDATE users.users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
          [hashedPassword, reset.user_id]
        );

        await client.query('UPDATE users.password_reset_tokens SET used_at = NOW() WHERE id = $1', [reset.id]);

        Logger.success(`✅ Contraseña restablecida con token para user_id=${reset.user_id}`);
        return true;
      });
    } catch (error) {
      Logger.error('❌ Error aplicando reset de contraseña:', error.message);
      return false;
    }
  }
}

export default new AuthService();


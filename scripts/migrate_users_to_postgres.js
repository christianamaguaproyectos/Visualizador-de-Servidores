import { config } from 'dotenv';
config();

import { withClient, closePool } from '../backend/src/config/db.js';
import Logger from '../backend/src/utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrateUsersToPostgres() {
  try {
    Logger.info('🔄 Iniciando migración de usuarios a PostgreSQL...\n');

    // 0. Verificar que exista el archivo a migrar
    const usersJsonPath = path.join(__dirname, '..', 'backend', 'config', 'users.json');
    if (!fs.existsSync(usersJsonPath)) {
      Logger.error(`❌ No existe ${usersJsonPath}: no hay usuarios para migrar`);
      process.exit(1);
    }

    await withClient(async (client) => {
      // 1. Crear schema de usuarios (el archivo real es 03-schema.users.sql;
      //    antes se buscaba "schema.users.sql", que no existe)
      Logger.info('📋 Creando schema de usuarios...');
      const schemaSQL = fs.readFileSync(
        path.join(__dirname, 'sql', '03-schema.users.sql'),
        'utf8'
      );
      await client.query(schemaSQL);
      Logger.success('✅ Schema de usuarios creado\n');

      // 2. Leer usuarios actuales del JSON
      const usersData = JSON.parse(fs.readFileSync(usersJsonPath, 'utf8'));

      // Toda la migración en una transacción: si un usuario falla, no queda a medias
      await client.query('BEGIN');
      
      Logger.info(`📥 Encontrados ${usersData.users.length} usuarios en users.json`);
      
      // 3. Migrar cada usuario
      for (const user of usersData.users) {
        // Verificar si el usuario ya existe
        const existing = await client.query(
          'SELECT id FROM users.users WHERE username = $1',
          [user.username]
        );

        if (existing.rows.length > 0) {
          Logger.info(`  ℹ️  Usuario "${user.username}" ya existe en BD, actualizando...`);
          await client.query(
            `UPDATE users.users 
             SET password_hash = $1, role = $2, name = $3, updated_at = NOW()
             WHERE username = $4`,
            [user.password, user.role, user.name, user.username]
          );
        } else {
          Logger.info(`  ➕ Insertando usuario "${user.username}"...`);
          await client.query(
            `INSERT INTO users.users (username, password_hash, role, name)
             VALUES ($1, $2, $3, $4)`,
            [user.username, user.password, user.role, user.name]
          );
        }
        Logger.success(`  ✅ ${user.username} (${user.role}) - ${user.name}`);
      }

      await client.query('COMMIT');

      // 4. Verificar migración
      const { rows: allUsers } = await client.query(
        'SELECT username, role, name, created_at FROM users.users ORDER BY id'
      );

      Logger.info('\n📊 Usuarios en PostgreSQL:');
      allUsers.forEach(u => {
        Logger.info(`  • ${u.username} (${u.role}) - ${u.name}`);
      });

      Logger.success(`\n✅ Migración completada: ${allUsers.length} usuarios en PostgreSQL`);
      Logger.info('\n💡 Ahora puedes eliminar backend/config/users.json si lo deseas');
    });

  } catch (error) {
    Logger.error('❌ Error en migración:', error);
    process.exit(1);
  }
}

// Si algo falla después de BEGIN, process.exit cierra la conexión y PostgreSQL
// descarta la transacción (ROLLBACK automático). Al terminar se cierra el pool.
migrateUsersToPostgres().then(() => closePool());

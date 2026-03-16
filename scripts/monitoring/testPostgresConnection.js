import { Client } from 'pg';
import monitoringConfig from '../../backend/src/monitoring/config/monitoringConfig.js';

async function main() {
  const url = process.env.POSTGRES_URL || monitoringConfig.postgresUrl;
  let client;
  if (url) {
    client = new Client({ connectionString: url });
  } else {
    // Fallback: usa variables PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE si están definidas en .env
    client = new Client();
  }
  try {
    await client.connect();
    const { rows } = await client.query('SELECT NOW() as now, current_database() as db, session_user as user');
    console.log('Conexión OK:', rows[0]);
    // Probar acceso al schema
    await client.query('SET search_path TO monitoring, public');
    await client.query('SELECT 1');
    console.log('Schema OK.');
  } catch (e) {
    console.error('Fallo al conectar o consultar:', e.message);
    console.error('Tips: verifica usuario/contraseña, o si tu contraseña tiene caracteres especiales usa URL encoding, o define PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE en .env');
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

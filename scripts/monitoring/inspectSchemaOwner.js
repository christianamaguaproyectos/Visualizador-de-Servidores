import { Client } from 'pg';
import monitoringConfig from '../../backend/src/monitoring/config/monitoringConfig.js';

async function main() {
  const url = process.env.POSTGRES_URL || monitoringConfig.postgresUrl;
  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query("SELECT n.nspname AS schema, pg_get_userbyid(n.nspowner) AS owner FROM pg_namespace n WHERE n.nspname = 'monitoring'");
  console.log(rows[0] || 'Schema monitoring no existe');
  await client.end();
}

main().catch(e => { console.error('Error inspeccionando esquema:', e.message); process.exit(1); });

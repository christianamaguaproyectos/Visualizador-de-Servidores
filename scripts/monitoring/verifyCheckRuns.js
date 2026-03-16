import { Client } from 'pg';
import monitoringConfig from '../../backend/src/monitoring/config/monitoringConfig.js';

async function main() {
  const url = process.env.POSTGRES_URL || monitoringConfig.postgresUrl;
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('SET search_path TO monitoring, public');
  const { rows: cnt } = await client.query('SELECT COUNT(*)::int AS count FROM check_runs');
  console.log('check_runs total:', cnt[0].count);
  const { rows } = await client.query(
    `SELECT time, check_id, host_id, status, latency_ms, code, error
     FROM check_runs
     ORDER BY time DESC
     LIMIT 5`
  );
  console.log('Últimos 5:', rows);
  await client.end();
}

main().catch(e => { console.error('Error verificando check_runs:', e.message); process.exit(1); });

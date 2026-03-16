import { Client } from 'pg';
import monitoringConfig from '../../backend/src/monitoring/config/monitoringConfig.js';

async function main() {
  const url = process.env.POSTGRES_URL || monitoringConfig.postgresUrl;
  const client = new Client({ connectionString: url });
  await client.connect();
  // Usar nombre calificado para evitar problemas si el search_path no aplica
  await client.query('SET search_path TO monitoring, public');
  const { rows: cnt } = await client.query('SELECT COUNT(*)::int AS count FROM monitoring.hosts');
  console.log('Hosts en monitoring.hosts:', cnt[0].count);
  const { rows: sample } = await client.query('SELECT id, name, ip, type, estado_actual FROM monitoring.hosts ORDER BY id ASC LIMIT 5');
  console.log('Muestra:', sample);
  await client.end();
}

main().catch(e => { console.error('Error verificando hosts:', e.message); process.exit(1); });

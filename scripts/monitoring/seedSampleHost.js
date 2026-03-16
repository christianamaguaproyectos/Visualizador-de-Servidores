import { Client } from 'pg';
import monitoringConfig from '../../backend/src/monitoring/config/monitoringConfig.js';

async function main() {
  const url = process.env.POSTGRES_URL || monitoringConfig.postgresUrl;
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('SET search_path TO monitoring, public');
  const { rows } = await client.query(
    `INSERT INTO monitoring.hosts(name, ip, type, rack, critical)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT DO NOTHING
     RETURNING id, name, ip, type`,
    ['sample-localhost','127.0.0.1','virtual',null,false]
  );
  if (rows.length) {
    console.log('Host de ejemplo insertado:', rows[0]);
  } else {
    console.log('Host de ejemplo ya existía (sin cambios).');
  }
  await client.end();
}

main().catch(e => { console.error('Error al insertar host de ejemplo:', e.message); process.exit(1); });

import { Client } from 'pg';
import monitoringConfig from '../../backend/src/monitoring/config/monitoringConfig.js';
import { APP_CONFIG } from '../../backend/src/config/constants.js';

async function main() {
  const url = process.env.POSTGRES_URL || monitoringConfig.postgresUrl;
  if (!url) {
    console.error('POSTGRES_URL no configurado');
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('SET search_path TO monitoring, public');

  // Asegurar host de ejemplo
  const hostRes = await client.query(
    `INSERT INTO monitoring.hosts(name, ip, type, critical)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    ['sample-localhost','127.0.0.1','virtual',false]
  );
  let hostId;
  if (hostRes.rows.length) {
    hostId = hostRes.rows[0].id;
    console.log('Host insertado sample-localhost id=', hostId);
  } else {
    const existing = await client.query('SELECT id FROM monitoring.hosts WHERE name=$1 LIMIT 1', ['sample-localhost']);
    hostId = existing.rows[0].id;
    console.log('Host ya existía sample-localhost id=', hostId);
  }

  // Checks a crear (tcp y http)
  const desired = [
    { kind: 'tcp', config: { host: '127.0.0.1', port: APP_CONFIG.DEFAULT_PORT }, frequency_sec: 30, timeout_ms: 2000 },
    { kind: 'http', config: { url: `http://127.0.0.1:${APP_CONFIG.DEFAULT_PORT}/`, expect_code: 200 }, frequency_sec: 45, timeout_ms: 3000 }
  ];

  for (const d of desired) {
    // Verificar si ya existe un check igual (por kind y parte principal del config)
    const exists = await client.query(
      `SELECT id FROM monitoring.checks WHERE host_id=$1 AND kind=$2 AND config @> $3::jsonb LIMIT 1`,
      [hostId, d.kind, JSON.stringify(d.config)]
    );
    if (exists.rows.length) {
      console.log(`Check ${d.kind} ya existe id=${exists.rows[0].id}`);
      continue;
    }
    const ins = await client.query(
      `INSERT INTO monitoring.checks(host_id, kind, config, frequency_sec, timeout_ms, enabled)
       VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
      [hostId, d.kind, d.config, d.frequency_sec, d.timeout_ms]
    );
    console.log(`Check ${d.kind} creado id=${ins.rows[0].id}`);
  }

  await client.end();
  console.log('Seed de checks completado');
}

main().catch(e => { console.error('Error seed checks:', e.message); process.exit(1); });

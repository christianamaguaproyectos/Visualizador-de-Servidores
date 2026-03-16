import { Client } from 'pg';
import monitoringConfig from '../../backend/src/monitoring/config/monitoringConfig.js';
import checkExecutorService from '../../backend/src/monitoring/services/checkExecutorService.js';

async function main() {
  const url = process.env.POSTGRES_URL || monitoringConfig.postgresUrl;
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('SET search_path TO monitoring, public');

  const { rows: checks } = await client.query('SELECT id, host_id, kind, config, timeout_ms FROM checks WHERE enabled=true ORDER BY id LIMIT 10');
  console.log(`Ejecutando ${checks.length} checks...`);

  for (const c of checks) {
    try {
      const result = await checkExecutorService.execute({ kind: c.kind, config: c.config, timeoutMs: c.timeout_ms });
      const time = new Date();
      const status = result.status || 'fail';
      const latency = result.latency || null;
      const code = result.code || null;
      const error = result.error || null;
      const sample = result.sample ? JSON.stringify(result.sample) : null;
      await client.query(
        'INSERT INTO check_runs(time, check_id, host_id, status, latency_ms, code, error, sample) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [time, c.id, c.host_id, status, latency, code, error, sample]
      );
      console.log(`Check ${c.id} (${c.kind}) -> ${status} ${latency ?? '-'}ms`);
    } catch (e) {
      console.error('Error ejecutando check', c.id, e.message);
    }
  }

  await client.end();
  console.log('Ejecución única finalizada');
}

main().catch(e => { console.error('Error runChecksOnce:', e.message); process.exit(1); });

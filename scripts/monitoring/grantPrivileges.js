#!/usr/bin/env node
import { Client } from 'pg';
import monitoringConfig from '../../backend/src/monitoring/config/monitoringConfig.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i=0;i<args.length;i++) {
    if (args[i] === '--url') out.url = args[++i];
    else if (args[i] === '--user') out.user = args[++i];
    else if (args[i] === '--schema') out.schema = args[++i];
  }
  return out;
}

async function main() {
  const { url, user, schema } = parseArgs();
  const connectionString = url || process.env.POSTGRES_URL || monitoringConfig.postgresUrl;
  if (!connectionString) { console.error('POSTGRES_URL no definido'); process.exit(1); }
  if (!user) { console.error('Debe especificar --user para otorgar privilegios'); process.exit(1); }
  const targetSchema = schema || 'monitoring';

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const grants = [
      `GRANT USAGE ON SCHEMA ${targetSchema} TO "${user}";`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${targetSchema} TO "${user}";`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${targetSchema} TO "${user}";`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${targetSchema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${user}";`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${targetSchema} GRANT USAGE, SELECT ON SEQUENCES TO "${user}";`
    ];
    for (const g of grants) {
      try {
        await client.query(g);
        console.log('OK:', g);
      } catch (e) {
        console.warn('WARN:', g, e.message);
      }
    }
    console.log('Privilegios procesados');
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('Error otorgando privilegios:', e.message); process.exit(1); });

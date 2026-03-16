#!/usr/bin/env node
import { readFileSync } from 'fs';
import { Client } from 'pg';
import monitoringConfig from '../../backend/src/monitoring/config/monitoringConfig.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i=0;i<args.length;i++) {
    if (args[i] === '--url') out.url = args[++i];
    else if (args[i] === '--file') out.file = args[++i];
  }
  return out;
}

async function main() {
  const { url, file } = parseArgs();
  const connectionString = url || process.env.POSTGRES_URL || monitoringConfig.postgresUrl;
  if (!connectionString) {
    console.error('POSTGRES_URL no definido');
    process.exit(1);
  }
  if (!file) {
    console.error('Ruta de schema no especificada');
    process.exit(1);
  }
  const sql = readFileSync(file, 'utf8');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Schema aplicado via Node');
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('Error aplicando schema:', e.message); process.exit(1); });

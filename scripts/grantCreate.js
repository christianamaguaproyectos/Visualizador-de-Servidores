import { Client } from 'pg';

async function main() {
  const url = process.env.POSTGRES_URL;
  const client = new Client({ connectionString: url });
  await client.connect();
  
  // Otorgar permiso CREATE en el esquema inventory
  await client.query('GRANT CREATE ON SCHEMA inventory TO mon_user');
  console.log('Permiso CREATE otorgado');
  
  await client.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

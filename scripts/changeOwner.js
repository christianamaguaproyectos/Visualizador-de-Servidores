import { Client } from 'pg';

async function main() {
  const client = new Client({ connectionString: process.env.POSTGRES_URL });
  await client.connect();
  
  // Intentar cambiar el dueño del esquema (probablemente falle)
  try {
    await client.query('ALTER SCHEMA inventory OWNER TO mon_user');
    console.log(' Dueño cambiado');
  } catch (e) {
    console.log(' No se pudo cambiar dueño:', e.message);
  }
  
  await client.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

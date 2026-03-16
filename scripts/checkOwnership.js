import { Client } from 'pg';

async function main() {
  const url = process.env.POSTGRES_URL;
  const client = new Client({ connectionString: url });
  await client.connect();
  
  const { rows } = await client.query(`
    SELECT schema_name, schema_owner 
    FROM information_schema.schemata 
    WHERE schema_name IN ('inventory', 'monitoring', 'users')
  `);
  
  console.log('Esquemas y sus dueños:');
  rows.forEach(r => console.log(`  ${r.schema_name}: ${r.schema_owner}`));
  
  const { rows: tables } = await client.query(`
    SELECT schemaname, tablename, tableowner
    FROM pg_tables
    WHERE schemaname = 'inventory'
  `);
  
  console.log('\nTablas en inventory:');
  tables.forEach(t => console.log(`  ${t.tablename}: ${t.tableowner}`));
  
  await client.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

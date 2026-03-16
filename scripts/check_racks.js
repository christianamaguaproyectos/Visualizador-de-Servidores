import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function checkRacks() {
  const client = new Client({ connectionString: process.env.POSTGRES_URL });
  try {
    await client.connect();
    await client.query('SET search_path TO inventory, monitoring, public');
      console.log('\n=== RACKS EN inventory.racks ===');
      const inventoryRacks = await client.query('SELECT * FROM inventory.racks ORDER BY created_at DESC');
      console.log(`Total: ${inventoryRacks.rows.length}`);
      inventoryRacks.rows.forEach(r => {
        console.log(`  ID: ${r.id}, Name: ${r.name}, Created: ${r.created_at}`);
      });

      console.log('\n=== SERVIDORES POR RACK ===');
      const serversByRack = await client.query(`
        SELECT rack_norm, COUNT(*) as count 
        FROM inventory.servers 
        WHERE type = 'fisicos' 
        GROUP BY rack_norm 
        ORDER BY rack_norm
      `);
      serversByRack.rows.forEach(r => {
        console.log(`  ${r.rack_norm}: ${r.count} servidores`);
      });

      console.log('\n=== RACKS SIN SERVIDORES ===');
      const emptyRacks = await client.query(`
        SELECT r.* 
        FROM inventory.racks r 
        LEFT JOIN inventory.servers s ON s.rack_id = r.id 
        WHERE s.id IS NULL
      `);
      if (emptyRacks.rows.length > 0) {
        emptyRacks.rows.forEach(r => {
          console.log(`  ID: ${r.id}, Name: ${r.name}`);
        });
      } else {
        console.log('  (ninguno)');
      }

      // Verificar si hay racks creados recientemente
      console.log('\n=== ÚLTIMOS 5 RACKS CREADOS ===');
      const recentRacks = await client.query('SELECT * FROM inventory.racks ORDER BY created_at DESC LIMIT 5');
      recentRacks.rows.forEach(r => {
        console.log(`  ${r.name} - Creado: ${new Date(r.created_at).toLocaleString()}`);
      });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkRacks();

import { config } from 'dotenv';
config();

import { withClient } from '../backend/src/config/db.js';

await withClient(async (client) => {
  const { rows } = await client.query(`
    SELECT nombre, rack_norm, rack_position, rack_units 
    FROM inventory.servers 
    WHERE rack_norm = 'Rack 6' 
    ORDER BY rack_position DESC
  `);
  
  console.log('\nServidores en Rack 6:');
  rows.forEach(r => console.log(`  ${r.nombre}: posición ${r.rack_position}, ${r.rack_units}U`));
  console.log(`\nTotal: ${rows.length} servidores\n`);
  process.exit(0);
});

import { config } from 'dotenv';
config();

import { withClient } from '../backend/src/config/db.js';

await withClient(async (client) => {
  await client.query(`
    UPDATE inventory.servers 
    SET rack_position = 14 
    WHERE nombre = 'Power5' AND rack_norm = 'Rack 6'
  `);
  
  console.log('✅ Power5 movido a posición 14');
  
  const { rows } = await client.query(`
    SELECT nombre, rack_position, rack_units 
    FROM inventory.servers 
    WHERE rack_norm = 'Rack 6' 
    ORDER BY rack_position DESC
  `);
  
  console.log('\nServidores en Rack 6:');
  rows.forEach(r => console.log(`  ${r.nombre}: posición ${r.rack_position}, ${r.rack_units}U`));
  
  process.exit(0);
});

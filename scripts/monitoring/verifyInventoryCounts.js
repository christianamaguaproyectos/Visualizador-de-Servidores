import { withClient } from '../../backend/src/config/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { racks, servers } = await withClient(async (client) => {
    const r = await client.query('SELECT COUNT(*)::int AS count FROM racks');
    const s = await client.query('SELECT COUNT(*)::int AS count FROM servers');
    return { racks: r.rows[0].count, servers: s.rows[0].count };
  });
  console.log('Inventario -> racks:', racks, 'servers:', servers);
}

main().catch(e => { console.error('Error verificando inventario:', e.message); process.exit(1); });

import { Client } from 'pg';

async function main() {
  const client = new Client({ connectionString: 'postgres://postgres:admin@localhost:5432/monitoring' });
  await client.connect();
  
  await client.query('SET search_path TO inventory, monitoring, public');
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS virtual_clusters (
      id BIGSERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      key TEXT UNIQUE NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'cluster',
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS cluster_hosts (
      id BIGSERIAL PRIMARY KEY,
      cluster_id BIGINT NOT NULL REFERENCES virtual_clusters(id) ON DELETE CASCADE,
      rack_id BIGINT NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(cluster_id, rack_id)
    )
  `);
  
  console.log(' Tablas creadas');
  
  const { rows } = await client.query(`
    INSERT INTO virtual_clusters (name, key, description, type, display_order) VALUES
      ('Danec Cluster 1', 'danec1', 'Primer cluster Danec', 'cluster', 1),
      ('Danec Cluster 2', 'danec2', 'Segundo cluster Danec', 'cluster', 2),
      ('Danec Cluster 3', 'danec3', 'Tercer cluster Danec', 'cluster', 3),
      ('VMware vSphere', 'vsphere', 'Hosts dedicados a VMware vSphere', 'vsphere', 4)
    ON CONFLICT (key) DO NOTHING
    RETURNING id, name, key
  `);
  
  console.log(` ${rows.length} clusters insertados:`);
  rows.forEach(r => console.log(`   - ${r.name} (${r.key})`));
  
  await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON inventory.virtual_clusters TO mon_user');
  await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON inventory.cluster_hosts TO mon_user');
  await client.query('GRANT USAGE, SELECT ON SEQUENCE inventory.virtual_clusters_id_seq TO mon_user');
  await client.query('GRANT USAGE, SELECT ON SEQUENCE inventory.cluster_hosts_id_seq TO mon_user');
  
  console.log(' Permisos otorgados a mon_user');
  
  await client.end();
}

main().catch(e => { console.error(' Error:', e.message); process.exit(1); });

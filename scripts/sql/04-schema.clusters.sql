CREATE TABLE IF NOT EXISTS inventory.virtual_clusters (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  key TEXT UNIQUE NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'cluster',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory.cluster_hosts (
  id BIGSERIAL PRIMARY KEY,
  cluster_id BIGINT NOT NULL REFERENCES inventory.virtual_clusters(id) ON DELETE CASCADE,
  rack_id BIGINT NOT NULL REFERENCES inventory.racks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cluster_id, rack_id)
);

INSERT INTO inventory.virtual_clusters (name, key, description, type, display_order) VALUES
  ('Danec Cluster 1', 'danec1', 'Primer cluster Danec', 'cluster', 1),
  ('Danec Cluster 2', 'danec2', 'Segundo cluster Danec', 'cluster', 2),
  ('Danec Cluster 3', 'danec3', 'Tercer cluster Danec', 'cluster', 3),
  ('VMware vSphere', 'vsphere', 'Hosts dedicados a VMware vSphere', 'vsphere', 4)
ON CONFLICT (key) DO NOTHING;

/**
 * Script MVP para importar hosts desde cacheService hacia tabla 'hosts'.
 * NOTA: Requiere POSTGRES_URL y MONITORING_ENABLED=1
 */
import { Client } from 'pg';
import monitoringConfig from '../../backend/src/monitoring/config/monitoringConfig.js';
import cacheService from '../../backend/src/services/cacheService.js';
import Logger from '../../backend/src/utils/logger.js';

async function run() {
  if (!monitoringConfig.postgresUrl) {
    Logger.error('POSTGRES_URL no configurado');
    process.exit(1);
  }
  const client = new Client({ connectionString: monitoringConfig.postgresUrl });
  await client.connect();
  Logger.info('Conectado a Postgres');

  const tipos = ['fisicos', 'virtuales'];
  for (const tipo of tipos) {
    const data = cacheService.get(tipo);
    for (const srv of data.servers) {
      const name = srv.hostname || srv.nombre || srv.ip || `host-${srv.id}`;
      const ip = srv.ip || null;
      const rack = srv.rackNorm || srv.rack || null;
      const critical = false; // heurística futura
      await client.query(
        `INSERT INTO monitoring.hosts(name, ip, type, rack, critical, estado_actual, created_at) VALUES ($1,$2,$3,$4,$5,'UNKNOWN', NOW()) ON CONFLICT DO NOTHING`,
        [name, ip, tipo === 'fisicos' ? 'fisico' : 'virtual', rack, critical]
      );
    }
    Logger.success(`Importados hosts tipo ${tipo}: ${data.servers.length}`);
  }

  await client.end();
  Logger.success('Importación completada');
}

run().catch(e => { Logger.error(e.message); process.exit(1); });
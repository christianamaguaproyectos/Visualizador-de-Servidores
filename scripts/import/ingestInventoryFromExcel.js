import excelParserService from '../../backend/src/services/excelParserService.js';
import configManager from '../../backend/src/config/configManager.js';
import { APP_CONFIG } from '../../backend/src/config/constants.js';
import { withClient } from '../../backend/src/config/db.js';
import { normalizeRackName } from '../../backend/src/utils/dataHelpers.js';
import dotenv from 'dotenv';
dotenv.config();

function identityKeyOf(s) {
  const base = (s.ip || s.hostname || s.nombre || s.serverLabel || '').toString().trim().toLowerCase();
  return base;
}

async function upsertRack(client, name, raw) {
  const { rows } = await client.query(
    `INSERT INTO racks(name, raw_name) VALUES($1,$2)
     ON CONFLICT (name) DO UPDATE SET raw_name = COALESCE(racks.raw_name, EXCLUDED.raw_name), updated_at = NOW()
     RETURNING id`,
    [name, raw]
  );
  return rows[0].id;
}

async function upsertServer(client, type, rackId, rackNorm, rackRaw, s) {
  const identity = identityKeyOf(s);
  const cols = [
    'type','identity_key','rack_id','rack_norm','rack_raw','server_label','nombre','ip','hostname','usuario','marca','modelo','tipo','hardware','serie','socket','no_por_socket','procesadores_logicos','ram_gb','discos','datastore','conexion','software','so','fecha_instalacion','fecha_mantenimiento','estado','backup','fecha_backup','activo'
  ];
  const vals = [
    type, identity, rackId, rackNorm, rackRaw, s.serverLabel, s.nombre, s.ip, s.hostname, s.usuario, s.marca, s.modelo, s.tipo, s.HARDWARE || s.hardware, s.serie, s.socket, s.noPorSocket, s.procesadoresLogicos, s.ramGb, s.discos, s.datastore, s.conexion, s.software, s.so, s.fechaInstalacion, s.fechaMantenimiento, s.estado, s.backup, s.fechaBackup, s.activo
  ];

  const setCols = cols.map((c, i) => `${c}=EXCLUDED.${c}`).join(', ');
  const placeholders = cols.map((_, i) => `$${i+1}`).join(', ');

  await client.query(
    `INSERT INTO servers(${cols.join(',')}) VALUES (${placeholders})
     ON CONFLICT (type, identity_key) DO UPDATE SET ${setCols}, updated_at = NOW()`,
    vals
  );
}

async function ingestType(type) {
  // Asegurar configuración cargada (ruta de excels)
  if (!configManager.getConfig()) {
    configManager.load();
  }
  const data = excelParserService.parseExcelByType(type);
  const servers = data.servers || [];
  console.log(`Ingestando ${servers.length} servidores (${type})...`);
  await withClient(async (client) => {
    for (const s of servers) {
      const rackNorm = s.rackNorm || normalizeRackName(s, type);
      if (!rackNorm) continue;
      const rackId = await upsertRack(client, rackNorm, s.rack || null);
      await upsertServer(client, type, rackId, rackNorm, s.rack || null, s);
    }
  });
  console.log(`OK ${type}`);
}

async function main() {
  await ingestType(APP_CONFIG.SERVER_TYPES.FISICOS);
  await ingestType(APP_CONFIG.SERVER_TYPES.VIRTUALES);
  console.log('Ingesta completa');
}

main().catch(e => { console.error('Error en ingesta:', e.message); process.exit(1); });

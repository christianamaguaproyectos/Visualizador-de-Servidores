/**
 * Script para sincronizar servidores del inventario al sistema de monitoreo
 * Crea hosts y checks de ping automáticamente para cada servidor con IP
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Configuración de conexión
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || 'postgresql://diagrama:DiagramaServers2025@localhost:5432/diagrama_servers'
});

/**
 * Obtiene todos los servidores del inventario que tienen IP válida
 */
async function getServersWithIP() {
  const query = `
    SELECT 
      id,
      nombre,
      ip,
      hostname,
      rack_norm as rack,
      tipo,
      type as server_type,
      estado,
      so
    FROM inventory.servers 
    WHERE ip IS NOT NULL 
      AND ip != '' 
      AND ip != 'N/A'
      AND ip !~ '^\\s*$'
    ORDER BY rack_norm, nombre
  `;
  
  const result = await pool.query(query);
  
  // Filtrar y limpiar IPs (tomar solo la primera si hay múltiples)
  return result.rows.map(row => {
    let ip = row.ip.trim();
    // Si hay múltiples IPs (separadas por salto de línea o espacio), tomar la primera
    if (ip.includes('\n')) {
      ip = ip.split('\n')[0].trim();
    }
    if (ip.includes(' ')) {
      ip = ip.split(' ')[0].trim();
    }
    return { ...row, ip };
  }).filter(row => {
    // Validar que sea una IP válida (formato básico)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipRegex.test(row.ip);
  });
}

/**
 * Obtiene hosts ya existentes en monitoreo
 */
async function getExistingHosts() {
  const query = `SELECT name, ip::text FROM monitoring.hosts`;
  const result = await pool.query(query);
  return new Map(result.rows.map(h => [h.ip, h.name]));
}

/**
 * Crea un host en el sistema de monitoreo
 */
async function createHost(server) {
  const query = `
    INSERT INTO monitoring.hosts (name, ip, type, rack, estado_actual, group_tags)
    VALUES ($1, $2::inet, $3::host_type_enum, $4, 'PENDING', $5)
    ON CONFLICT (ip) DO UPDATE SET
      name = EXCLUDED.name,
      type = EXCLUDED.type,
      rack = EXCLUDED.rack,
      updated_at = NOW()
    RETURNING id, name
  `;
  
  const groupTags = [server.rack || 'sin-rack'].filter(Boolean);
  const tipo = server.server_type === 'virtuales' ? 'virtual' : 'fisico';
  
  const result = await pool.query(query, [
    server.nombre || server.hostname || `Server-${server.ip}`,
    server.ip.trim(),
    tipo,
    server.rack,
    groupTags
  ]);
  
  return result.rows[0];
}

/**
 * Crea un check de ping (icmp) para un host
 */
async function createPingCheck(hostId, hostName) {
  const query = `
    INSERT INTO monitoring.checks (host_id, kind, config, frequency_sec, timeout_ms, retries, enabled)
    VALUES ($1, 'icmp', $2, 300, 2000, 1, true)
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  
  const config = {
    description: `ICMP ping check para ${hostName}`
  };
  
  const result = await pool.query(query, [
    hostId,
    JSON.stringify(config)
  ]);
  
  return result.rows[0];
}

/**
 * Función principal de sincronización
 */
async function syncInventoryToMonitoring() {
  console.log('🔄 Iniciando sincronización de inventario a monitoreo...\n');
  
  try {
    // Obtener servidores con IP
    const servers = await getServersWithIP();
    console.log(`📦 Encontrados ${servers.length} servidores con IP en el inventario\n`);
    
    if (servers.length === 0) {
      console.log('⚠️  No hay servidores con IP válida para importar');
      return;
    }
    
    // Obtener hosts existentes
    const existingHosts = await getExistingHosts();
    console.log(`📊 Hosts existentes en monitoreo: ${existingHosts.size}\n`);
    
    let created = 0;
    let updated = 0;
    let checksCreated = 0;
    let errors = 0;
    
    // Procesar cada servidor
    for (const server of servers) {
      try {
        const isNew = !existingHosts.has(server.ip.trim());
        
        // Crear/actualizar host
        const host = await createHost(server);
        
        if (isNew) {
          created++;
          console.log(`✅ Creado: ${host.name} (${server.ip})`);
        } else {
          updated++;
          console.log(`🔄 Actualizado: ${host.name} (${server.ip})`);
        }
        
        // Crear check de ping
        await createPingCheck(host.id, host.name);
        checksCreated++;
        
      } catch (err) {
        errors++;
        console.error(`❌ Error con ${server.nombre || server.ip}: ${err.message}`);
      }
    }
    
    // Resumen
    console.log('\n' + '='.repeat(50));
    console.log('📊 RESUMEN DE SINCRONIZACIÓN');
    console.log('='.repeat(50));
    console.log(`✅ Hosts creados:      ${created}`);
    console.log(`🔄 Hosts actualizados: ${updated}`);
    console.log(`🔍 Checks creados:     ${checksCreated}`);
    console.log(`❌ Errores:            ${errors}`);
    console.log('='.repeat(50));
    
    // Verificar totales
    const totalHosts = await pool.query('SELECT COUNT(*) FROM monitoring.hosts');
    const totalChecks = await pool.query('SELECT COUNT(*) FROM monitoring.checks WHERE enabled = true');
    
    console.log(`\n📈 Total hosts en monitoreo: ${totalHosts.rows[0].count}`);
    console.log(`📈 Total checks activos:     ${totalChecks.rows[0].count}`);
    
  } catch (err) {
    console.error('❌ Error fatal:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

// Ejecutar
syncInventoryToMonitoring()
  .then(() => {
    console.log('\n✅ Sincronización completada');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Sincronización fallida:', err.message);
    process.exit(1);
  });

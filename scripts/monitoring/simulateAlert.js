/**
 * Script para simular alertas de monitoreo
 * 
 * Uso:
 *   node scripts/monitoring/simulateAlert.js down <host_id>   - Simula caída de servidor
 *   node scripts/monitoring/simulateAlert.js up <host_id>     - Simula recuperación
 *   node scripts/monitoring/simulateAlert.js list             - Lista hosts disponibles
 *   node scripts/monitoring/simulateAlert.js test-email       - Envía email de prueba directo
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import notificationService from '../../backend/src/monitoring/services/notificationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { Pool } = pg;

// Construir connection string desde variables del .env o usar POSTGRES_URL directamente
const connectionString = process.env.POSTGRES_URL || 
  `postgresql://${process.env.POSTGRES_USER || 'diagrama'}:${encodeURIComponent(process.env.POSTGRES_PASSWORD || 'diagrama123')}@localhost:5432/${process.env.POSTGRES_DB || 'diagrama_servers'}`;

const pool = new Pool({ connectionString });

async function listHosts() {
  const result = await pool.query(`
    SELECT id, name, ip, estado_actual, critical,
           COALESCE(estado_changed_at::text, 'nunca') as last_change
    FROM monitoring.hosts 
    WHERE enabled = true 
    ORDER BY estado_actual DESC, name
    LIMIT 20
  `);
  
  console.log('\n📋 Hosts disponibles para simular:\n');
  console.log('ID\tEstado\tCrítico\tNombre\t\t\tIP');
  console.log('─'.repeat(70));
  
  result.rows.forEach(h => {
    const estado = h.estado_actual === 'UP' ? '🟢 UP' : 
                   h.estado_actual === 'DOWN' ? '🔴 DOWN' : 
                   `⚪ ${h.estado_actual}`;
    const critical = h.critical ? '⚠️ Sí' : '  No';
    console.log(`${h.id}\t${estado}\t${critical}\t${h.name.padEnd(16)}\t${h.ip}`);
  });
  
  console.log('\n💡 Uso: node simulateAlert.js [down|up] <host_id>\n');
}

async function simulateDown(hostId) {
  // Obtener info del host
  const hostResult = await pool.query(
    'SELECT id, name, ip, estado_actual, critical FROM monitoring.hosts WHERE id = $1',
    [hostId]
  );
  
  if (hostResult.rows.length === 0) {
    console.error(`❌ Host con ID ${hostId} no encontrado`);
    return;
  }
  
  const host = hostResult.rows[0];
  const previousState = host.estado_actual;
  
  if (previousState === 'DOWN') {
    console.log(`⚠️  El host ${host.name} ya está en estado DOWN`);
    return;
  }
  
  console.log(`\n🔴 Simulando CAÍDA de ${host.name} (${host.ip})...`);
  console.log(`   Estado anterior: ${previousState}`);
  
  // Actualizar estado en BD
  await pool.query(`
    UPDATE monitoring.hosts 
    SET estado_actual = 'DOWN', 
        estado_changed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
  `, [hostId]);
  
  console.log('   ✅ Estado actualizado a DOWN en BD');
  
  // Disparar notificación
  console.log('   📧 Enviando notificación...');
  
  try {
    await notificationService.notifyStateChange({
      hostId: host.id,
      hostName: host.name,
      hostIp: host.ip,
      previousState: previousState,
      newState: 'DOWN',
      isCritical: host.critical,
      error: 'Simulación de caída - Host no responde al ping',
      checkType: 'ping'
    });
    console.log('   ✅ Notificación enviada!\n');
  } catch (err) {
    console.error('   ❌ Error enviando notificación:', err.message);
  }
}

async function simulateUp(hostId) {
  const hostResult = await pool.query(
    'SELECT id, name, ip, estado_actual, critical FROM monitoring.hosts WHERE id = $1',
    [hostId]
  );
  
  if (hostResult.rows.length === 0) {
    console.error(`❌ Host con ID ${hostId} no encontrado`);
    return;
  }
  
  const host = hostResult.rows[0];
  const previousState = host.estado_actual;
  
  if (previousState === 'UP') {
    console.log(`⚠️  El host ${host.name} ya está en estado UP`);
    return;
  }
  
  console.log(`\n🟢 Simulando RECUPERACIÓN de ${host.name} (${host.ip})...`);
  console.log(`   Estado anterior: ${previousState}`);
  
  // Actualizar estado en BD
  await pool.query(`
    UPDATE monitoring.hosts 
    SET estado_actual = 'UP', 
        estado_changed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
  `, [hostId]);
  
  console.log('   ✅ Estado actualizado a UP en BD');
  
  // Disparar notificación
  console.log('   📧 Enviando notificación de recuperación...');
  
  try {
    await notificationService.notifyStateChange({
      hostId: host.id,
      hostName: host.name,
      hostIp: host.ip,
      previousState: previousState,
      newState: 'UP',
      isCritical: host.critical,
      checkType: 'ping'
    });
    console.log('   ✅ Notificación enviada!\n');
  } catch (err) {
    console.error('   ❌ Error enviando notificación:', err.message);
  }
}

async function testEmail() {
  console.log('\n📧 Enviando email de prueba directo...\n');
  
  try {
    await notificationService.notifyStateChange({
      hostId: 999,
      hostName: 'TEST-SERVER',
      hostIp: '192.168.1.100',
      previousState: 'UP',
      newState: 'DOWN',
      isCritical: true,
      error: 'Este es un email de prueba generado manualmente',
      checkType: 'ping'
    });
    console.log('✅ Email de prueba enviado!\n');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0];
  const hostId = args[1];
  
  try {
    switch (action) {
      case 'list':
        await listHosts();
        break;
        
      case 'down':
        if (!hostId) {
          console.error('❌ Debes especificar el ID del host');
          console.log('   Uso: node simulateAlert.js down <host_id>');
          await listHosts();
          break;
        }
        await simulateDown(parseInt(hostId));
        break;
        
      case 'up':
        if (!hostId) {
          console.error('❌ Debes especificar el ID del host');
          console.log('   Uso: node simulateAlert.js up <host_id>');
          await listHosts();
          break;
        }
        await simulateUp(parseInt(hostId));
        break;
        
      case 'test-email':
        await testEmail();
        break;
        
      default:
        console.log(`
🔔 Simulador de Alertas de Monitoreo
=====================================

Comandos disponibles:

  list              Lista hosts disponibles
  down <host_id>    Simula caída de un servidor (envía alerta)
  up <host_id>      Simula recuperación de un servidor
  test-email        Envía email de prueba directo

Ejemplos:
  node simulateAlert.js list
  node simulateAlert.js down 3
  node simulateAlert.js up 3
  node simulateAlert.js test-email
        `);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();

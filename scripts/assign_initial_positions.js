import { config } from 'dotenv';
config();

import { withClient } from '../backend/src/config/db.js';
import Logger from '../backend/src/utils/logger.js';

/**
 * Script para asignar posiciones iniciales a servidores sin rack_position
 * Distribuye los servidores uniformemente en cada rack
 */
async function assignInitialPositions() {
  try {
    await withClient(async (client) => {
      // Obtener todos los racks con sus servidores
      const { rows: racks } = await client.query(`
        SELECT DISTINCT rack_norm 
        FROM inventory.servers 
        WHERE rack_norm IS NOT NULL 
        ORDER BY rack_norm
      `);

      Logger.info(`Procesando ${racks.length} racks...`);

      for (const rack of racks) {
        const rackName = rack.rack_norm;
        
        // Obtener servidores de este rack que no tienen posición
        const { rows: servers } = await client.query(`
          SELECT id, nombre, rack_units 
          FROM inventory.servers 
          WHERE rack_norm = $1 
          AND (rack_position IS NULL OR rack_position = 0)
          ORDER BY id
        `, [rackName]);

        if (servers.length === 0) {
          Logger.info(`✓ Rack ${rackName}: todos los servidores ya tienen posición`);
          continue;
        }

        Logger.info(`📍 Rack ${rackName}: asignando posiciones a ${servers.length} servidores...`);

        // Distribuir uniformemente en 42 unidades
        const totalUnits = 42;
        const totalServerUnits = servers.reduce((sum, s) => sum + (s.rack_units || 2), 0);
        const availableSpace = totalUnits - totalServerUnits;
        const gaps = servers.length + 1;
        const baseGapSize = Math.floor(availableSpace / gaps);
        const extraSpaces = availableSpace % gaps;

        let currentPosition = totalUnits - baseGapSize; // Empezar desde arriba (42)

        for (let i = 0; i < servers.length; i++) {
          const server = servers[i];
          const units = server.rack_units || 2;

          if (i < extraSpaces) {
            currentPosition -= 1;
          }

          // Asignar posición (la unidad superior del servidor)
          await client.query(`
            UPDATE inventory.servers 
            SET rack_position = $1 
            WHERE id = $2
          `, [currentPosition, server.id]);

          Logger.success(`  ${server.nombre}: posición ${currentPosition} (${units}U)`);

          currentPosition -= (units + baseGapSize);
        }
      }

      Logger.success('✅ Asignación de posiciones completada');
    });
  } catch (error) {
    Logger.error('Error asignando posiciones:', error);
    process.exit(1);
  }
}

assignInitialPositions();

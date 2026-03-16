/**
 * exportController.js - Controlador para exportación de datos a Excel
 */

import xlsx from 'xlsx';
import { withClient } from '../config/db.js';

export class ExportController {
  /**
   * Exporta servidores físicos a Excel
   * GET /api/export/fisicos
   */
  async exportFisicos(req, res) {
    try {
      await withClient(async (client) => {
        const { rows } = await client.query(
          `SELECT 
            id as "No.",
            nombre as "SERVERS",
            ip as "IP",
            hostname as "HOSTNAME",
            usuario as "USUARIO",
            rack_raw as "RACK",
            hardware as "HARDWARE",
            marca as "MARCA",
            modelo as "MODELO SERVER",
            tipo as "TIPO",
            serie as "NO. SERIE",
            socket as "SOCKET",
            no_por_socket as "NO. POR SOCKET",
            procesadores_logicos as "PROCESADOR LÓGICOS",
            ram_gb as "RAM GB",
            discos as "DISCOS DEL SERVER",
            datastore as "DATASTORE",
            conexion as "CONEXIÓN",
            software as "SOFTWARE",
            so as "SISTEMA OPERATIVO",
            fecha_instalacion as "FECHA DE INSTALACION",
            fecha_mantenimiento as "FECHA DE MANTENIMIENTO",
            estado as "ESTADO",
            backup as "BACKUP",
            fecha_backup as "FECHA BACKUP",
            activo as "ACTIVO",
            rack_position as "Posición en Rack",
            rack_units as "Unidades (U)"
          FROM inventory.servers 
          WHERE type = 'fisicos'
          ORDER BY rack_norm, rack_position NULLS LAST, nombre`
        );

        // Crear libro de Excel
        const workbook = xlsx.utils.book_new();
        
        // Convertir datos a hoja
        const worksheet = xlsx.utils.json_to_sheet(rows);
        
        // Ajustar ancho de columnas
        const columnWidths = [
          { wch: 8 },  // No.
          { wch: 25 }, // SERVERS
          { wch: 15 }, // IP
          { wch: 20 }, // HOSTNAME
          { wch: 20 }, // USUARIO
          { wch: 12 }, // RACK
          { wch: 15 }, // HARDWARE
          { wch: 15 }, // MARCA
          { wch: 25 }, // MODELO SERVER
          { wch: 15 }, // TIPO
          { wch: 20 }, // NO. SERIE
          { wch: 12 }, // SOCKET
          { wch: 15 }, // NO. POR SOCKET
          { wch: 20 }, // PROCESADOR LÓGICOS
          { wch: 12 }, // RAM GB
          { wch: 40 }, // DISCOS DEL SERVER
          { wch: 30 }, // DATASTORE
          { wch: 25 }, // CONEXIÓN
          { wch: 40 }, // SOFTWARE
          { wch: 30 }, // SISTEMA OPERATIVO
          { wch: 20 }, // FECHA DE INSTALACION
          { wch: 22 }, // FECHA DE MANTENIMIENTO
          { wch: 15 }, // ESTADO
          { wch: 25 }, // BACKUP
          { wch: 18 }, // FECHA BACKUP
          { wch: 12 }, // ACTIVO
          { wch: 15 }, // Posición en Rack
          { wch: 13 }  // Unidades (U)
        ];
        worksheet['!cols'] = columnWidths;

        // Agregar hoja al libro
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Servidores Físicos');

        // Generar buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Generar nombre de archivo con fecha
        const fecha = new Date().toISOString().split('T')[0];
        const filename = `servidores_fisicos_${fecha}.xlsx`;

        // Enviar archivo
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
      });
    } catch (error) {
      console.error('❌ Error exportando servidores físicos:', error);
      res.status(500).json({ error: 'Error al exportar servidores físicos' });
    }
  }

  /**
   * Exporta máquinas virtuales a Excel
   * GET /api/export/virtuales
   */
  async exportVirtuales(req, res) {
    try {
      await withClient(async (client) => {
        const { rows } = await client.query(
          `SELECT 
            id as "No.",
            nombre as "SERVERS",
            ip as "IP",
            hostname as "HOSTNAME",
            usuario as "USUARIO",
            rack_raw as "HOST",
            hardware as "HARDWARE",
            tipo as "TIPO",
            ram_gb as "RAM GB",
            so as "SISTEMA OPERATIVO",
            software as "SOFTWARE",
            discos as "DISCOS",
            datastore as "DATASTORE",
            conexion as "CONEXIÓN",
            backup as "BACKUP",
            estado as "ESTADO",
            activo as "ACTIVO",
            fecha_instalacion as "FECHA DE INSTALACION",
            fecha_mantenimiento as "FECHA DE MANTENIMIENTO",
            fecha_backup as "FECHA BACKUP",
            rack_position as "Posición en Host",
            rack_units as "Unidades (U)"
          FROM inventory.servers 
          WHERE type = 'virtuales'
          ORDER BY rack_norm, nombre`
        );

        // Crear libro de Excel
        const workbook = xlsx.utils.book_new();
        
        // Convertir datos a hoja
        const worksheet = xlsx.utils.json_to_sheet(rows);
        
        // Ajustar ancho de columnas
        const columnWidths = [
          { wch: 8 },  // No.
          { wch: 25 }, // SERVERS
          { wch: 15 }, // IP
          { wch: 20 }, // HOSTNAME
          { wch: 20 }, // USUARIO
          { wch: 20 }, // HOST
          { wch: 15 }, // HARDWARE
          { wch: 15 }, // TIPO
          { wch: 12 }, // RAM GB
          { wch: 30 }, // SISTEMA OPERATIVO
          { wch: 40 }, // SOFTWARE
          { wch: 40 }, // DISCOS
          { wch: 30 }, // DATASTORE
          { wch: 25 }, // CONEXIÓN
          { wch: 25 }, // BACKUP
          { wch: 15 }, // ESTADO
          { wch: 12 }, // ACTIVO
          { wch: 20 }, // FECHA DE INSTALACION
          { wch: 22 }, // FECHA DE MANTENIMIENTO
          { wch: 18 }, // FECHA BACKUP
          { wch: 15 }, // Posición en Host
          { wch: 13 }  // Unidades (U)
        ];
        worksheet['!cols'] = columnWidths;

        // Agregar hoja al libro
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Máquinas Virtuales');

        // Generar buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Generar nombre de archivo con fecha
        const fecha = new Date().toISOString().split('T')[0];
        const filename = `maquinas_virtuales_${fecha}.xlsx`;

        // Enviar archivo
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
      });
    } catch (error) {
      console.error('❌ Error exportando máquinas virtuales:', error);
      res.status(500).json({ error: 'Error al exportar máquinas virtuales' });
    }
  }
}

export default new ExportController();

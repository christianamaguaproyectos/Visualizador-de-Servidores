/**
 * exportController.js - Controlador para exportación de datos a Excel
 *
 * Usa exceljs (la librería xlsx/SheetJS de npm tiene vulnerabilidades sin parche).
 */

import ExcelJS from 'exceljs';
import { withClient } from '../config/db.js';

const CONTENT_TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Caracteres con los que Excel puede interpretar un texto como fórmula */
const INICIO_FORMULA = /^[=+\-@\t\r]/;

/**
 * Protege contra Formula Injection (CSV/Excel Injection):
 * si un texto empieza con = + - @ tab o retorno de carro, se le antepone ' para
 * que Excel lo trate siempre como texto y nunca lo ejecute como fórmula.
 * @param {*} valor
 * @returns {*}
 */
export function sanitizarCeldaExcel(valor) {
  if (typeof valor === 'string' && INICIO_FORMULA.test(valor)) {
    return `'${valor}`;
  }
  return valor;
}

/**
 * Genera el archivo .xlsx a partir del resultado de la consulta y lo envía
 * @param {Object} res - Response de Express
 * @param {{rows: Object[], fields: {name: string}[]}} resultado - Resultado de pg
 * @param {{nombreHoja: string, anchos: number[], nombreArchivo: string}} opciones
 */
async function enviarExcel(res, resultado, { nombreHoja, anchos, nombreArchivo }) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(nombreHoja);

  // Columnas tomadas de la consulta (así el encabezado existe aunque no haya filas)
  const encabezados = resultado.fields.map(f => f.name);
  worksheet.columns = encabezados.map((encabezado, i) => ({
    header: encabezado,
    key: encabezado,
    width: anchos[i] || 15,
  }));

  for (const fila of resultado.rows) {
    const filaSegura = {};
    for (const encabezado of encabezados) {
      filaSegura[encabezado] = sanitizarCeldaExcel(fila[encabezado]);
    }
    worksheet.addRow(filaSegura);
  }

  const buffer = await workbook.xlsx.writeBuffer();

  const fecha = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}_${fecha}.xlsx"`);
  res.setHeader('Content-Type', CONTENT_TYPE_XLSX);
  res.send(Buffer.from(buffer));
}

export class ExportController {
  /**
   * Exporta servidores físicos a Excel
   * GET /api/export/fisicos
   */
  async exportFisicos(req, res) {
    try {
      await withClient(async (client) => {
        const resultado = await client.query(
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

        await enviarExcel(res, resultado, {
          nombreHoja: 'Servidores Físicos',
          nombreArchivo: 'servidores_fisicos',
          // Ancho de columnas (mismo orden que el SELECT)
          anchos: [8, 25, 15, 20, 20, 12, 15, 15, 25, 15, 20, 12, 15, 20, 12, 40, 30, 25, 40, 30, 20, 22, 15, 25, 18, 12, 15, 13],
        });
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
        const resultado = await client.query(
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

        await enviarExcel(res, resultado, {
          nombreHoja: 'Máquinas Virtuales',
          nombreArchivo: 'maquinas_virtuales',
          // Ancho de columnas (mismo orden que el SELECT)
          anchos: [8, 25, 15, 20, 20, 20, 15, 15, 12, 30, 40, 40, 30, 25, 25, 15, 12, 20, 22, 18, 15, 13],
        });
      });
    } catch (error) {
      console.error('❌ Error exportando máquinas virtuales:', error);
      res.status(500).json({ error: 'Error al exportar máquinas virtuales' });
    }
  }
}

export default new ExportController();

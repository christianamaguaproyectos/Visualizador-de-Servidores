/**
 * DTO y mapeadores para Servidores
 * 
 * Responsabilidades:
 * - Validar datos de entrada (create/update)
 * - Mapear datos de Prisma (camelCase) al formato que espera el frontend (legacy)
 * - Centralizar el contrato de datos entre capas
 */

/**
 * Campos requeridos al crear un servidor
 */
const REQUIRED_CREATE_FIELDS = ['type', 'nombre', 'rack_norm'];

/**
 * Campos permitidos para actualización
 */
const UPDATABLE_FIELDS = [
  'serverLabel', 'nombre', 'ip', 'hostname', 'usuario', 'marca', 'modelo', 'tipo',
  'hardware', 'serie', 'socket', 'noPorSocket', 'procesadoresLogicos', 'ramGb',
  'discos', 'datastore', 'conexion', 'software', 'so', 'fechaInstalacion',
  'fechaMantenimiento', 'estado', 'backup', 'fechaBackup', 'activo', 'rackRaw',
  'rackUnits', 'rackPosition',
  // Campos físicos
  'storage', 'ocsInventario', 'datastoreVirtuales', 'conexionStorage',
  // Campos virtuales (seguridad)
  'mtm', 'configBackup', 'sophosEp', 'vicarius', 'acronis', 'veeam',
  'manual', 'zabbix', 'wazuh', 'bluelevel', 'pam', 'usuarioPam',
];

/**
 * Mapa de snake_case (frontend/request) a camelCase (Prisma)
 */
const SNAKE_TO_CAMEL = {
  'server_label': 'serverLabel',
  'no_por_socket': 'noPorSocket',
  'procesadores_logicos': 'procesadoresLogicos',
  'ram_gb': 'ramGb',
  'fecha_instalacion': 'fechaInstalacion',
  'fecha_mantenimiento': 'fechaMantenimiento',
  'fecha_backup': 'fechaBackup',
  'rack_raw': 'rackRaw',
  'rack_norm': 'rackNorm',
  'rack_units': 'rackUnits',
  'rack_position': 'rackPosition',
  'ocs_inventario': 'ocsInventario',
  'datastore_virtuales': 'datastoreVirtuales',
  'conexion_storage': 'conexionStorage',
  'config_backup': 'configBackup',
  'sophos_ep': 'sophosEp',
  'usuario_pam': 'usuarioPam',
};

/**
 * Convierte un body del request (snake_case) a datos de Prisma (camelCase)
 * @param {Object} body - Body del request
 * @returns {Object} Datos en camelCase para Prisma
 */
export function normalizeInputToPrisma(body) {
  const result = {};
  for (const [key, value] of Object.entries(body)) {
    const camelKey = SNAKE_TO_CAMEL[key] || key;
    if (value !== undefined) {
      result[camelKey] = value;
    }
  }
  return result;
}

/**
 * Extrae solo los campos actualizables del input normalizado
 * @param {Object} normalized - Input normalizado a camelCase
 * @returns {Object} Solo campos permitidos para update
 */
export function extractUpdatableFields(normalized) {
  const result = {};
  for (const field of UPDATABLE_FIELDS) {
    if (normalized[field] !== undefined) {
      result[field] = normalized[field];
    }
  }
  return result;
}

/**
 * Valida datos para creación de servidor
 * @param {Object} body - Body del request
 * @returns {{ valid: boolean, error?: string }} Resultado de validación
 */
export function validateCreateServer(body) {
  for (const field of REQUIRED_CREATE_FIELDS) {
    if (!body[field]) {
      return { valid: false, error: `Campo requerido: ${field}` };
    }
  }

  if (!['fisicos', 'virtuales'].includes(body.type)) {
    return { valid: false, error: 'type debe ser "fisicos" o "virtuales"' };
  }

  return { valid: true };
}

/**
 * Mapea un servidor de Prisma (camelCase) al formato que espera el frontend (legacy)
 * IMPORTANTE: El frontend actual espera esta estructura mixta.
 * Cuando se migre a React, se podrá eliminar este mapper y usar camelCase directo.
 * 
 * @param {Object} server - Server de Prisma
 * @returns {Object} Server en formato frontend
 */
export function toFrontendFormat(server) {
  return {
    id: String(server.id),
    rackId: server.rackId,
    rack: server.rackRaw || server.rack?.name || server.rackNorm,
    rackNorm: server.rackNorm || server.rack?.name,
    rackUnits: server.rackUnits || 2,
    rackPosition: server.rackPosition,
    serverLabel: server.serverLabel,
    nombre: server.nombre,
    ip: server.ip,
    hostname: server.hostname,
    usuario: server.usuario,
    marca: server.marca,
    modelo: server.modelo,
    tipo: server.tipo,
    HARDWARE: server.hardware,
    TIPO: server.tipo,
    serie: server.serie,
    socket: server.socket,
    noPorSocket: server.noPorSocket,
    procesadoresLogicos: server.procesadoresLogicos,
    ramGb: server.ramGb,
    discos: server.discos,
    datastore: server.datastore,
    conexion: server.conexion,
    software: server.software,
    so: server.so,
    fechaInstalacion: server.fechaInstalacion,
    fechaMantenimiento: server.fechaMantenimiento,
    estado: server.estado,
    backup: server.backup,
    fechaBackup: server.fechaBackup,
    activo: server.activo,
    // Campos físicos
    storage: server.storage,
    ocsInventario: server.ocsInventario,
    datastoreVirtuales: server.datastoreVirtuales,
    conexionStorage: server.conexionStorage,
    // Campos virtuales (seguridad)
    mtm: server.mtm,
    configBackup: server.configBackup,
    sophosEp: server.sophosEp,
    vicarius: server.vicarius,
    acronis: server.acronis,
    veeam: server.veeam,
    manual: server.manual,
    zabbix: server.zabbix,
    wazuh: server.wazuh,
    bluelevel: server.bluelevel,
    pam: server.pam,
    usuarioPam: server.usuarioPam,
  };
}

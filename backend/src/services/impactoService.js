/**
 * impactoService.js — Impacto de servicios.
 *
 * - Estado de monitoreo de cada servidor del inventario (también lo usan Físicos y Virtuales).
 * - Servicios (inventory.services) y papel de cada servidor en ellos
 *   (inventory.service_components).
 * - Estado actual de cada servicio (con las caídas reales de Monitoreo) y simulación de caídas.
 *   El cálculo es puro y vive en impactoCalculo.js.
 *
 * Los datos de entrada ya llegan validados por dtos/impactoDto.js. Los errores de PostgreSQL
 * se traducen a AppError con mensajes propios: nunca se expone err.message crudo.
 *
 * ── Cruce inventory.servers ↔ monitoring.hosts ─────────────────────────────
 * No hay FK entre ambos. monitoringSyncService._sincronizarServidor elige el host de monitoreo
 * de cada servidor así, y este servicio aplica LA MISMA regla:
 *   1) hosts.name = servers.nombre (comparación exacta);
 *   2) si no hay ninguno por nombre: host(hosts.ip) = "IP limpia" del servidor.
 * "IP limpia" = el texto de servers.ip hasta el primer separador (cualquier carácter que /\s/
 * de JavaScript considera espacio, o "," o ";"), sin recortar antes, y solo si tiene forma
 * IPv4. Si varios hosts empatan se toma el de menor id. La IP 0.0.0.0 nunca se usa para el
 * cruce: es el marcador que el sync guarda en los hosts sin IP válida.
 *
 * Solo los hosts HABILITADOS en estado DOWN o DEGRADED cuentan como caída real (un host
 * deshabilitado —servidor APAGADO/BAJA— puede conservar un estado viejo).
 */

import { withClient, withTransaction } from '../config/db.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { evaluarServicios, hostsDeVms, propagarCaida } from './impactoCalculo.js';

/** Estados de monitoreo que cuentan como caída real */
export const ESTADOS_CAIDA = Object.freeze(['DOWN', 'DEGRADED']);

/**
 * Separadores de IP del sync (monitoringSyncService.cleanIP hace ip.split(/[\n\s,;]/)[0]):
 * exactamente los caracteres de /\s/ en JavaScript más "," y ";". Se construyen con códigos
 * para no escribir caracteres invisibles en el fuente.
 */
const CODIGOS_ESPACIO_JS = [
  0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A,
  0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF,
];
export const SEPARADORES_IP = String.fromCharCode(...CODIGOS_ESPACIO_JS) + ',;';
// Regex de PostgreSQL (se envía como parámetro): prefijo de servers.ip hasta el primer separador
const RE_PRIMER_TOKEN_IP = `^[^${SEPARADORES_IP}]*`;

/** Servidores + su host de monitoreo. $1 = RE_PRIMER_TOKEN_IP */
const SQL_SERVIDORES = `
  WITH sv AS MATERIALIZED (
    SELECT s.id, s.type, s.nombre, s.ip, s.hostname, s.rack_norm, s.estado, s.software,
           CASE WHEN t.token ~ '^[0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}$'
                 AND t.token <> '0.0.0.0'
                THEN t.token END AS ip_limpia
    FROM inventory.servers s
    CROSS JOIN LATERAL (SELECT substring(COALESCE(s.ip, '') FROM $1::text) AS token) t
  ),
  hs AS MATERIALIZED (
    SELECT mh.id, mh.name, host(mh.ip) AS ip_txt, mh.estado_actual, mh.enabled, mh.estado_changed_at
    FROM monitoring.hosts mh
  ),
  por_nombre AS (
    SELECT DISTINCT ON (sv.id) sv.id AS server_id, hs.id AS host_id
    FROM sv JOIN hs ON hs.name = sv.nombre
    ORDER BY sv.id, hs.id
  ),
  por_ip AS (
    SELECT DISTINCT ON (sv.id) sv.id AS server_id, hs.id AS host_id
    FROM sv JOIN hs ON hs.ip_txt = sv.ip_limpia
    WHERE NOT EXISTS (SELECT 1 FROM por_nombre pn WHERE pn.server_id = sv.id)
    ORDER BY sv.id, hs.id
  ),
  elegido AS (
    SELECT server_id, host_id FROM por_nombre
    UNION ALL
    SELECT server_id, host_id FROM por_ip
  )
  SELECT sv.id::text AS id, sv.type::text AS type, sv.nombre, sv.ip, sv.hostname, sv.rack_norm,
         sv.estado AS estado_inventario, sv.software,
         h.id::text AS monitoring_host_id, h.estado_actual, h.enabled AS monitoring_enabled,
         h.estado_changed_at
  FROM sv
  LEFT JOIN elegido e ON e.server_id = sv.id
  LEFT JOIN hs h ON h.id = e.host_id
  ORDER BY sv.id`;

const SQL_SERVICIOS = `
  SELECT id::text AS id, name, description, created_by, created_at, updated_at
  FROM inventory.services`;

const SQL_COMPONENTES = `
  SELECT id::text AS id, service_id::text AS service_id, server_id::text AS server_id, role, impact,
         impact_detail, created_by, created_at, updated_at
  FROM inventory.service_components`;

/** Lecturas de varias tablas en una misma instantánea consistente */
const LECTURA_CONSISTENTE = Object.freeze({ isolationLevel: 'REPEATABLE READ', readOnly: true });

function traducirErrorPg(err, contexto) {
  if (err instanceof AppError) return err;
  const restriccion = err?.constraint || '';
  switch (err?.code) {
    case '23505':
      if (restriccion.startsWith('services_name')) return new ConflictError('Ya existe un servicio con ese nombre');
      if (restriccion === 'uq_service_component') return new ConflictError('Ese servidor ya forma parte del servicio');
      return new ConflictError('Ya existe un registro con esos datos');
    case '23503':
      return new NotFoundError(restriccion.includes('service_id') ? 'Servicio' : 'Servidor');
    case '23514':
      return new ValidationError(`Datos de ${contexto} fuera de rango`);
    case '22P02':
    case '22003':
      return new ValidationError(`Datos de ${contexto} inválidos`);
    default:
      return err;
  }
}

/**
 * Nombre visible de un servidor: en inventarios reales hay equipos sin "nombre"; se usa el
 * hostname, la primera IP o el id para que las listas nunca muestren un vacío.
 */
export function nombreVisible(row) {
  const texto = (v) => (typeof v === 'string' ? v.trim() : '');
  const ip = texto(row.ip).split(/[\s,;/]+/).find((p) => p && p !== '0.0.0.0');
  return texto(row.nombre) || texto(row.hostname) || ip || `Servidor #${row.id}`;
}

/** Aplicación registrada (campo Software); null si está vacío o es «N/A» */
export function nombreAplicacion(software) {
  const t = typeof software === 'string' ? software.replace(/\s+/g, ' ').trim() : '';
  return !t || /^(n\/?a|-|ninguno)$/i.test(t) ? null : t;
}

function mapServidor(row) {
  const monitoreado = row.monitoring_host_id !== null && row.monitoring_host_id !== undefined;
  return {
    id: row.id,
    type: row.type,
    name: nombreVisible(row),
    ip: row.ip,
    hostname: row.hostname,
    rack: row.rack_norm,
    estadoInventario: row.estado_inventario,
    application: nombreAplicacion(row.software),
    status: monitoreado ? row.estado_actual : 'UNKNOWN',
    monitoring: monitoreado ? {
      hostId: row.monitoring_host_id,
      status: row.estado_actual,
      enabled: row.monitoring_enabled,
      changedAt: row.estado_changed_at,
    } : null,
  };
}

const mapServicio = (row) => ({
  id: row.id, name: row.name, description: row.description, createdBy: row.created_by,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

const mapComponente = (row) => ({
  id: row.id, serviceId: row.service_id, serverId: row.server_id, role: row.role, impact: row.impact,
  impactDetail: row.impact_detail, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
});

async function leerTodo(client) {
  const [servidores, servicios, componentes] = await Promise.all([
    client.query(SQL_SERVIDORES, [RE_PRIMER_TOKEN_IP]),
    client.query(`${SQL_SERVICIOS} ORDER BY name`),
    client.query(`${SQL_COMPONENTES} ORDER BY id`),
  ]);
  const comps = componentes.rows.map(mapComponente);
  return {
    servidores: servidores.rows.map(mapServidor),
    servicios: servicios.rows.map(mapServicio).map((s) => ({ ...s, components: comps.filter((c) => c.serviceId === s.id) })),
  };
}

/** Caídas reales según Monitoreo: hosts habilitados en DOWN o DEGRADED */
export function caidasReales(servidores) {
  return servidores.filter((s) => s.monitoring?.enabled && ESTADOS_CAIDA.includes(s.monitoring.status)).map((s) => s.id);
}

/** Resultado de una caída (real o simulada) listo para la API */
function resultado(caidosIniciales, datos) {
  const caidos = propagarCaida(caidosIniciales, datos.servidores);
  return {
    servicios: evaluarServicios(datos.servicios, caidos),
    servidoresCaidos: [...caidos].map(([id, c]) => ({ id, motivo: c.motivo, por: c.por, nivel: c.nivel })),
  };
}

class ImpactoService {
  /** Estado de monitoreo de todos los servidores (también para Físicos y Virtuales) */
  async listarServidores() {
    return withClient(async (client) => {
      const { rows } = await client.query(SQL_SERVIDORES, [RE_PRIMER_TOKEN_IP]);
      return rows.map(mapServidor);
    });
  }

  /**
   * Todo lo que necesita la página: servidores, servicios con sus componentes,
   * VM → host y el estado actual de cada servicio con las caídas reales de Monitoreo.
   */
  async panorama() {
    return withTransaction(async (client) => {
      const datos = await leerTodo(client);
      return {
        servers: datos.servidores,
        services: datos.servicios,
        hosts: Object.fromEntries(hostsDeVms(datos.servidores)),
        actual: resultado(caidasReales(datos.servidores), datos),
        generatedAt: new Date().toISOString(),
      };
    }, LECTURA_CONSISTENTE);
  }

  /** Qué pasaría si cayeran estos servidores (no modifica nada) */
  async simular(ids) {
    return withTransaction(async (client) => {
      const datos = await leerTodo(client);
      const existentes = new Set(datos.servidores.map((s) => s.id));
      return {
        simulados: ids.filter((id) => existentes.has(id)),
        ignorados: ids.filter((id) => !existentes.has(id)),
        ...resultado(ids, datos),
      };
    }, LECTURA_CONSISTENTE);
  }

  // ── Servicios ──────────────────────────

  async crearServicio(datos, autor) {
    try {
      return await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO inventory.services (name, description, created_by) VALUES ($1, $2, $3)
           RETURNING id::text AS id, name, description, created_by, created_at, updated_at`,
          [datos.name, datos.description, autor],
        );
        return { ...mapServicio(rows[0]), components: [] };
      });
    } catch (err) {
      throw traducirErrorPg(err, 'servicio');
    }
  }

  async editarServicio(id, cambios) {
    const columnas = { name: 'name', description: 'description' };
    const sets = []; const valores = [];
    for (const [k, col] of Object.entries(columnas)) {
      if (k in cambios) { valores.push(cambios[k]); sets.push(`${col} = $${valores.length}`); }
    }
    valores.push(id);
    try {
      return await withTransaction(async (client) => {
        const { rows } = await client.query(
          `UPDATE inventory.services SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${valores.length}::bigint
           RETURNING id::text AS id, name, description, created_by, created_at, updated_at`,
          valores,
        );
        if (!rows.length) throw new NotFoundError('Servicio', id);
        return mapServicio(rows[0]);
      });
    } catch (err) {
      throw traducirErrorPg(err, 'servicio');
    }
  }

  async eliminarServicio(id) {
    return withTransaction(async (client) => {
      const { rowCount } = await client.query('DELETE FROM inventory.services WHERE id = $1::bigint', [id]);
      if (!rowCount) throw new NotFoundError('Servicio', id);
    });
  }

  // ── Componentes (papel de un servidor en un servicio) ──────────────────────────

  async agregarComponente(serviceId, datos, autor) {
    try {
      return await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO inventory.service_components
             (service_id, server_id, role, impact, impact_detail, created_by)
           VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6)
           RETURNING id::text AS id, service_id::text AS service_id, server_id::text AS server_id, role, impact,
                     impact_detail, created_by, created_at, updated_at`,
          [serviceId, datos.serverId, datos.role, datos.impact, datos.impactDetail, autor],
        );
        return mapComponente(rows[0]);
      });
    } catch (err) {
      throw traducirErrorPg(err, 'componente');
    }
  }

  async editarComponente(id, cambios) {
    const columnas = { role: 'role', impact: 'impact', impactDetail: 'impact_detail' };
    const sets = []; const valores = [];
    for (const [k, col] of Object.entries(columnas)) {
      if (k in cambios) { valores.push(cambios[k]); sets.push(`${col} = $${valores.length}`); }
    }
    valores.push(id);
    try {
      return await withTransaction(async (client) => {
        const { rows } = await client.query(
          `UPDATE inventory.service_components SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${valores.length}::bigint
           RETURNING id::text AS id, service_id::text AS service_id, server_id::text AS server_id, role, impact,
                     impact_detail, created_by, created_at, updated_at`,
          valores,
        );
        if (!rows.length) throw new NotFoundError('Componente', id);
        return mapComponente(rows[0]);
      });
    } catch (err) {
      throw traducirErrorPg(err, 'componente');
    }
  }

  async eliminarComponente(id) {
    return withTransaction(async (client) => {
      const { rowCount } = await client.query('DELETE FROM inventory.service_components WHERE id = $1::bigint', [id]);
      if (!rowCount) throw new NotFoundError('Componente', id);
    });
  }
}

export default new ImpactoService();

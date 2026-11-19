/**
 * topologyService.js — Mapa de Dependencias y Topología de Servidores (Fase 1.2)
 *
 * - CRUD de dependencias (inventory.server_dependencies) y de vistas
 *   (inventory.topology_views + inventory.topology_node_positions), siempre en
 *   transacciones BEGIN/COMMIT/ROLLBACK sobre el pool compartido (config/db.js).
 * - Grafo con estado de monitoreo e impacto en cascada (la lógica de grafo pura
 *   vive en topologyGraph.js y se prueba sin BD).
 *
 * Los datos de entrada ya llegan validados por dtos/topologyDto.js (IDs como
 * string de dígitos). Los errores de PostgreSQL se traducen a AppError con
 * mensajes propios: nunca se expone err.message crudo.
 *
 * ── Cruce inventory.servers ↔ monitoring.hosts ─────────────────────────────
 * No hay FK entre ambos. monitoringSyncService._sincronizarServidor elige el
 * host de monitoreo de cada servidor así, y este servicio aplica LA MISMA regla:
 *   1) hosts.name = servers.nombre (comparación exacta);
 *   2) si no hay ninguno por nombre: host(hosts.ip) = "IP limpia" del servidor.
 * "IP limpia" = cleanIP() del sync: el texto de servers.ip hasta el primer
 * separador (cualquier carácter que /\s/ de JavaScript considera espacio, o
 * "," o ";"), SIN recortar antes (" 10.0.0.1" da un token vacío = sin IP), y
 * solo si ese token tiene forma IPv4 (/^\d{1,3}(\.\d{1,3}){3}$/).
 *
 * Diferencias deliberadas con el sync (documentadas):
 *   - Si varios hosts empatan, el sync toma la primera fila que devuelva
 *     PostgreSQL (sin ORDER BY); aquí se toma, de forma determinista, la de menor id.
 *   - La IP 0.0.0.0 nunca se usa para el cruce: es el marcador que el sync guarda
 *     en los hosts sin IP válida, y cruzar por ella asignaría a un servidor el
 *     estado de cualquier otro servidor sin IP.
 *
 * Rendimiento: servidores y hosts se leen UNA vez (CTE MATERIALIZED), la IP limpia
 * se calcula una vez por servidor y el cruce se resuelve con equi-joins (hash
 * join), sin evaluar nada por cada par servidor×host.
 *
 * Solo los hosts HABILITADOS en estado DOWN o DEGRADED son raíces del impacto
 * real (un host deshabilitado —servidor APAGADO/BAJA— puede tener estado viejo).
 */

import { withClient, withTransaction } from '../config/db.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import Logger from '../utils/logger.js';
import {
  analyzeServer, buildAdjacency, CASCADE_STATUS, compareIds, computeCascadeImpact, markBidirectionalPairs,
} from './topologyGraph.js';

// Funciones de grafo del plan (1.2), reexportadas para quien importe el servicio
export { computeCascadeImpact, isBidirectionalPair, analyzeServer } from './topologyGraph.js';

/** Estados de monitoreo que originan impacto en cascada */
export const DOWN_STATES = Object.freeze(['DOWN', 'DEGRADED']);

/**
 * Separadores de IP del sync: monitoringSyncService.cleanIP hace
 * ip.split(/[\n\s,;]/)[0]. Son exactamente los caracteres de /\s/ en JavaScript
 * (lo comprueba una prueba unitaria recorriendo todo el BMP) más "," y ";".
 * Se construyen con códigos para no escribir caracteres invisibles en el fuente.
 */
const CODIGOS_ESPACIO_JS = [
  0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A,
  0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF,
];
export const SEPARADORES_IP = String.fromCharCode(...CODIGOS_ESPACIO_JS) + ',;';
// Regex de PostgreSQL (se envía como parámetro): prefijo de servers.ip hasta el primer separador
const RE_PRIMER_TOKEN_IP = `^[^${SEPARADORES_IP}]*`;

/**
 * Servidores + host de monitoreo + posición en la vista.
 * $1 = view_id (o NULL), $2 = RE_PRIMER_TOKEN_IP, $3 = ids de servidores (o NULL = todos).
 */
const SQL_SERVIDORES = `
  WITH sv AS MATERIALIZED (
    SELECT s.id, s.type, s.nombre, s.ip, s.hostname, s.rack_norm, s.estado, s.activo,
           CASE WHEN t.token ~ '^[0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}$'
                 AND t.token <> '0.0.0.0'
                THEN t.token END AS ip_limpia
    FROM inventory.servers s
    CROSS JOIN LATERAL (SELECT substring(COALESCE(s.ip, '') FROM $2::text) AS token) t
    WHERE $3::bigint[] IS NULL OR s.id = ANY($3::bigint[])
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
         sv.estado AS estado_inventario, sv.activo,
         h.id::text AS monitoring_host_id, h.estado_actual, h.enabled AS monitoring_enabled,
         h.estado_changed_at,
         p.x, p.y, p.pinned, p.collapsed
  FROM sv
  LEFT JOIN elegido e ON e.server_id = sv.id
  LEFT JOIN hs h ON h.id = e.host_id
  LEFT JOIN inventory.topology_node_positions p ON p.server_id = sv.id AND p.view_id = $1::bigint
  ORDER BY sv.id`;

/** Lecturas de varias tablas en una misma instantánea consistente */
const LECTURA_CONSISTENTE = Object.freeze({ isolationLevel: 'REPEATABLE READ', readOnly: true });

const SQL_DEPENDENCIA = `
  SELECT d.id::text AS id, d.source_server_id::text AS source, d.target_server_id::text AS target,
         d.dependency_type, d.criticality, d.port, d.protocol, d.label, d.notes, d.created_by,
         d.created_at, d.updated_at,
         ss.nombre AS source_name, ts.nombre AS target_name
  FROM inventory.server_dependencies d
  JOIN inventory.servers ss ON ss.id = d.source_server_id
  JOIN inventory.servers ts ON ts.id = d.target_server_id`;

const SQL_VISTA = `
  SELECT v.id::text AS id, v.name, v.slug, v.description, v.is_default, v.viewport_zoom, v.viewport_x,
         v.viewport_y, v.layout_mode, v.filter_config, v.created_by, v.created_at, v.updated_at,
         (SELECT COUNT(*)::int FROM inventory.topology_node_positions p WHERE p.view_id = v.id) AS node_count
  FROM inventory.topology_views v`;

// ─────────────────────────────────────────────
//  Utilidades internas
// ─────────────────────────────────────────────

/**
 * Traduce errores de PostgreSQL a errores HTTP con mensaje propio.
 * Los demás se relanzan tal cual (el errorHandler responde 500 genérico).
 */
function traducirErrorPg(err, contexto) {
  if (err instanceof AppError) return err;
  const constraint = err?.constraint || '';
  switch (err?.code) {
    case '23505':
      if (constraint === 'uq_server_dependency') {
        return new ConflictError('Ya existe una dependencia de ese tipo entre esos servidores');
      }
      if (constraint.startsWith('topology_views_name')) return new ConflictError('Ya existe una vista con ese nombre');
      if (constraint.startsWith('topology_views_slug')) return new ConflictError('Ya existe una vista con ese slug');
      if (constraint === 'uq_topology_views_single_default') {
        return new ConflictError('Otra operación cambió la vista predeterminada al mismo tiempo; reintente');
      }
      return new ConflictError('Ya existe un registro con esos datos');
    case '23503':
      return new NotFoundError('Servidor');
    case '23514':
      if (constraint === 'chk_server_dep_no_self') return new ValidationError('Un servidor no puede depender de sí mismo');
      return new ValidationError(`Datos de ${contexto} fuera de rango`);
    case '22P02':
    case '22003':
      return new ValidationError(`Datos de ${contexto} inválidos`);
    default:
      return err;
  }
}

/**
 * Serializa los cambios de vista predeterminada: dos transacciones que marcan
 * vistas como predeterminadas a la vez se ejecutan una tras otra (la segunda ve
 * el resultado de la primera) en lugar de chocar con uq_topology_views_single_default.
 * SHARE ROW EXCLUSIVE choca consigo mismo y con las escrituras, no con las lecturas.
 */
async function bloquearCambioDeVistaPorDefecto(client) {
  await client.query('LOCK TABLE inventory.topology_views IN SHARE ROW EXCLUSIVE MODE');
}

async function desmarcarVistaPorDefecto(client) {
  await bloquearCambioDeVistaPorDefecto(client);
  await client.query('UPDATE inventory.topology_views SET is_default = FALSE WHERE is_default');
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

function mapDependency(row) {
  return {
    id: row.id,
    source: row.source,
    target: row.target,
    sourceName: row.source_name ?? null,
    targetName: row.target_name ?? null,
    dependencyType: row.dependency_type,
    criticality: row.criticality,
    port: row.port,
    protocol: row.protocol,
    label: row.label,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapView(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isDefault: row.is_default,
    viewport: { zoom: num(row.viewport_zoom), x: num(row.viewport_x), y: num(row.viewport_y) },
    layoutMode: row.layout_mode,
    filterConfig: row.filter_config || {},
    nodeCount: row.node_count ?? 0,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Resumen de un servidor con su estado de monitoreo */
function mapServer(row) {
  const monitored = row.monitoring_host_id !== null && row.monitoring_host_id !== undefined;
  return {
    id: row.id,
    type: row.type,
    name: row.nombre,
    ip: row.ip,
    hostname: row.hostname,
    rack: row.rack_norm,
    estadoInventario: row.estado_inventario,
    activo: row.activo,
    status: monitored ? row.estado_actual : 'UNKNOWN',
    monitoring: monitored ? {
      hostId: row.monitoring_host_id,
      status: row.estado_actual,
      enabled: row.monitoring_enabled,
      changedAt: row.estado_changed_at,
    } : null,
  };
}

async function fetchServers(client, { viewId = null, ids = null } = {}) {
  const { rows } = await client.query(SQL_SERVIDORES, [viewId, RE_PRIMER_TOKEN_IP, ids]);
  return rows;
}

async function fetchEdges(client) {
  const { rows } = await client.query(`${SQL_DEPENDENCIA} ORDER BY d.id`);
  return rows.map(mapDependency);
}

async function resolveView(client, selector) {
  let res;
  if (selector?.id) {
    res = await client.query(`${SQL_VISTA} WHERE v.id = $1::bigint`, [selector.id]);
  } else if (selector?.slug) {
    res = await client.query(`${SQL_VISTA} WHERE v.slug = $1`, [selector.slug]);
  } else {
    // Vista por defecto; si nadie está marcada, la de slug "general"
    res = await client.query(`${SQL_VISTA} WHERE v.is_default OR v.slug = 'general' ORDER BY v.is_default DESC LIMIT 1`);
    return res.rows[0] ? mapView(res.rows[0]) : null;
  }
  if (!res.rows[0]) throw new NotFoundError('Vista', selector.id || selector.slug);
  return mapView(res.rows[0]);
}

async function assertServersExist(client, ids) {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return;
  const { rows } = await client.query('SELECT id::text AS id FROM inventory.servers WHERE id = ANY($1::bigint[])', [unicos]);
  const existentes = new Set(rows.map((r) => r.id));
  const faltan = unicos.filter((i) => !existentes.has(i)).sort(compareIds);
  if (faltan.length) {
    const lista = faltan.slice(0, 20).join(', ') + (faltan.length > 20 ? '…' : '');
    if (faltan.length === 1) throw new NotFoundError('Servidor', lista);
    throw new AppError(`No se encontraron los servidores con ID ${lista}`, 404, 'NOT_FOUND');
  }
}

// ─────────────────────────────────────────────
//  Servicio
// ─────────────────────────────────────────────

class TopologyService {
  /**
   * Grafo de la vista con estado de monitoreo e impacto en cascada.
   *
   * @param {{ viewSelector?: {id?: string, slug?: string}|null, includeIsolated?: boolean, simulateDownIds?: string[] }} opciones
   *   includeIsolated=false: solo servidores con alguna relación, con posición
   *   guardada en la vista o simulados como caídos. true: todos los servidores.
   *
   * Vista, servidores, hosts y aristas se leen en UNA instantánea (transacción
   * REPEATABLE READ READ ONLY): una arista nunca apunta a un servidor ausente de
   * `nodes` aunque otra petición cree o borre servidores a la vez.
   */
  async getTopologyGraph({ viewSelector = null, includeIsolated = false, simulateDownIds = [] } = {}) {
    return withTransaction(async (client) => {
      const view = await resolveView(client, viewSelector);
      const serverRows = await fetchServers(client, { viewId: view?.id ?? null });
      const edgesRaw = await fetchEdges(client);

      const existentes = new Set(serverRows.map((r) => r.id));
      const simulados = simulateDownIds.filter((i) => existentes.has(i));
      const ignoredSimulateIds = simulateDownIds.filter((i) => !existentes.has(i));

      const monitoringDownIds = serverRows
        .filter((r) => r.monitoring_host_id && r.monitoring_enabled && DOWN_STATES.includes(r.estado_actual))
        .map((r) => r.id);
      const rootIds = [...new Set([...monitoringDownIds, ...simulados])].sort(compareIds);
      const rootSet = new Set(rootIds);
      const simuladoSet = new Set(simulados);
      const monitoreoSet = new Set(monitoringDownIds);

      const adjacency = buildAdjacency(edgesRaw);
      const impact = computeCascadeImpact({ adjacency, rootIds });

      const conRelacion = new Set();
      for (const e of edgesRaw) { conRelacion.add(e.source); conRelacion.add(e.target); }

      const nodes = serverRows
        .filter((r) => includeIsolated || conRelacion.has(r.id) || r.x !== null || simuladoSet.has(r.id))
        .map((r) => {
          const imp = impact.get(r.id);
          let downSource = null;
          if (simuladoSet.has(r.id)) downSource = monitoreoSet.has(r.id) ? 'BOTH' : 'SIMULATED';
          else if (monitoreoSet.has(r.id)) downSource = 'MONITORING';
          return {
            ...mapServer(r),
            position: r.x === null ? null : { x: num(r.x), y: num(r.y), pinned: r.pinned, collapsed: r.collapsed },
            dependsOnCount: adjacency.out.get(r.id)?.length ?? 0,
            dependentsCount: adjacency.in.get(r.id)?.length ?? 0,
            isDown: rootSet.has(r.id),
            downSource,
            cascadeStatus: imp ? imp.cascadeStatus : CASCADE_STATUS.NONE,
            impactLevel: imp ? imp.impactLevel : 0,
            impactedByServers: imp ? imp.impactedByServers : [],
            impactPath: imp ? imp.impactPath : [],
          };
        });

      const afectado = (id) => rootSet.has(id) || impact.has(id);
      const edges = markBidirectionalPairs(edgesRaw).map((e) => ({
        ...e,
        // La caída del proveedor (target) se propaga al dependiente (source) por esta flecha
        carriesImpact: afectado(e.target) && impact.has(e.source),
      }));

      let directCount = 0;
      let transitiveCount = 0;
      for (const v of impact.values()) {
        if (v.cascadeStatus === CASCADE_STATUS.DIRECT) directCount++;
        else transitiveCount++;
      }

      return {
        view,
        nodes,
        edges,
        impact: {
          rootIds,
          monitoringDownIds,
          simulatedDownIds: simulados,
          ignoredSimulateIds,
          directCount,
          transitiveCount,
          totalImpacted: impact.size,
        },
        generatedAt: new Date().toISOString(),
      };
    }, LECTURA_CONSISTENTE);
  }

  /** Dependencias y dependientes (directos y transitivos) de un servidor + ciclos */
  async getServerImpactAnalysis(serverId) {
    return withTransaction(async (client) => {
      const [serverRow] = await fetchServers(client, { ids: [serverId] });
      if (!serverRow) throw new NotFoundError('Servidor', serverId);
      const edges = await fetchEdges(client);
      const a = analyzeServer(serverId, edges);

      const ids = new Set([serverId]);
      for (const i of [...a.dependsOnDirect, ...a.dependentsDirect]) ids.add(i);
      for (const n of [...a.dependsOnTransitive, ...a.dependentsTransitive]) ids.add(n.id);
      const resumen = new Map((await fetchServers(client, { ids: [...ids] })).map((r) => [r.id, mapServer(r)]));

      const directos = (lista, campoPropio, campoOtro) => lista.map((otroId) => ({
        ...resumen.get(otroId),
        depth: 1,
        // Relaciones concretas (puede haber varias de distinto tipo con el mismo servidor)
        dependencies: edges.filter((e) => e[campoPropio] === serverId && e[campoOtro] === otroId),
      }));
      const transitivos = (lista) => lista.map((n) => ({ ...resumen.get(n.id), depth: n.depth, path: n.path }));

      return {
        server: resumen.get(serverId),
        dependsOnDirect: directos(a.dependsOnDirect, 'source', 'target'),
        dependsOnTransitive: transitivos(a.dependsOnTransitive),
        dependentsDirect: directos(a.dependentsDirect, 'target', 'source'),
        dependentsTransitive: transitivos(a.dependentsTransitive),
        totalAffected: a.totalAffected,
        cycles: a.cycles,
        cyclesTruncated: a.cyclesTruncated,
      };
    }, LECTURA_CONSISTENTE);
  }

  // ── Dependencias ──────────────────────────

  /** Lista de dependencias; con serverId, solo las que lo tienen como origen o destino */
  async listDependencies({ serverId = null } = {}) {
    return withClient(async (client) => {
      if (serverId) {
        const { rows } = await client.query(
          `${SQL_DEPENDENCIA} WHERE d.source_server_id = $1::bigint OR d.target_server_id = $1::bigint ORDER BY d.id`,
          [serverId],
        );
        return rows.map(mapDependency);
      }
      return fetchEdges(client);
    });
  }

  async #getDependency(client, id, { lock = false } = {}) {
    const { rows } = await client.query(
      `${SQL_DEPENDENCIA} WHERE d.id = $1::bigint${lock ? ' FOR UPDATE OF d' : ''}`,
      [id],
    );
    return rows[0] ? mapDependency(rows[0]) : null;
  }

  /**
   * Inserta una dependencia. Con siExiste='ignorar', si ya existe la misma
   * (source, target, tipo) no falla y devuelve null.
   */
  async #insertDependency(client, d, createdBy, { siExiste = 'error' } = {}) {
    const { rows } = await client.query(
      `INSERT INTO inventory.server_dependencies
         (source_server_id, target_server_id, dependency_type, criticality, port, protocol, label, notes, created_by)
       VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6, $7, $8, $9)
       ${siExiste === 'ignorar' ? 'ON CONFLICT ON CONSTRAINT uq_server_dependency DO NOTHING' : ''}
       RETURNING id::text AS id`,
      [d.sourceServerId, d.targetServerId, d.dependencyType, d.criticality, d.port, d.protocol, d.label, d.notes, createdBy],
    );
    return rows[0] ? this.#getDependency(client, rows[0].id) : null;
  }

  /**
   * Crea una dependencia y, si bidirectional=true, también su inversa (en la MISMA
   * transacción). La relación pedida (source -> target) debe ser nueva (si no, 409);
   * la inversa es idempotente: si ya existía del mismo tipo se conserva tal cual y
   * se informa en `inverse.created = false`.
   *
   * @returns {Promise<{ dependency: object, dependencies: object[], inverse: null | { created: boolean, dependency: object } }>}
   *   dependencies = solo las relaciones creadas en esta petición.
   */
  async createDependency(data, createdBy) {
    try {
      const resultado = await withTransaction(async (client) => {
        await assertServersExist(client, [data.sourceServerId, data.targetServerId]);
        const dependency = await this.#insertDependency(client, data, createdBy);
        if (!data.bidirectional) return { dependency, dependencies: [dependency], inverse: null };

        const datosInversa = { ...data, sourceServerId: data.targetServerId, targetServerId: data.sourceServerId };
        const creada = await this.#insertDependency(client, datosInversa, createdBy, { siExiste: 'ignorar' });
        if (creada) return { dependency, dependencies: [dependency, creada], inverse: { created: true, dependency: creada } };

        const { rows } = await client.query(
          `${SQL_DEPENDENCIA}
            WHERE d.source_server_id = $1::bigint AND d.target_server_id = $2::bigint AND d.dependency_type = $3`,
          [datosInversa.sourceServerId, datosInversa.targetServerId, datosInversa.dependencyType],
        );
        return { dependency, dependencies: [dependency], inverse: { created: false, dependency: rows[0] ? mapDependency(rows[0]) : null } };
      });
      const inversa = resultado.inverse ? (resultado.inverse.created ? ' y su inversa' : ' (la inversa ya existía)') : '';
      Logger.info(`Dependencia creada: ${data.sourceServerId} -> ${data.targetServerId} (${data.dependencyType})${inversa}`);
      return resultado;
    } catch (err) {
      throw traducirErrorPg(err, 'dependencia');
    }
  }

  async updateDependency(id, patch) {
    try {
      return await withTransaction(async (client) => {
        const actual = await this.#getDependency(client, id, { lock: true });
        if (!actual) throw new NotFoundError('Dependencia', id);
        const merged = {
          sourceServerId: patch.sourceServerId ?? actual.source,
          targetServerId: patch.targetServerId ?? actual.target,
          dependencyType: patch.dependencyType ?? actual.dependencyType,
          criticality: patch.criticality ?? actual.criticality,
          port: 'port' in patch ? patch.port : actual.port,
          protocol: 'protocol' in patch ? patch.protocol : actual.protocol,
          label: 'label' in patch ? patch.label : actual.label,
          notes: 'notes' in patch ? patch.notes : actual.notes,
        };
        if (merged.sourceServerId === merged.targetServerId) {
          throw new ValidationError('Un servidor no puede depender de sí mismo');
        }
        await assertServersExist(client, [merged.sourceServerId, merged.targetServerId]);
        await client.query(
          `UPDATE inventory.server_dependencies
             SET source_server_id = $2::bigint, target_server_id = $3::bigint, dependency_type = $4,
                 criticality = $5, port = $6, protocol = $7, label = $8, notes = $9
           WHERE id = $1::bigint`,
          [id, merged.sourceServerId, merged.targetServerId, merged.dependencyType, merged.criticality,
            merged.port, merged.protocol, merged.label, merged.notes],
        );
        return this.#getDependency(client, id);
      });
    } catch (err) {
      throw traducirErrorPg(err, 'dependencia');
    }
  }

  async deleteDependency(id) {
    return withTransaction(async (client) => {
      const { rowCount } = await client.query('DELETE FROM inventory.server_dependencies WHERE id = $1::bigint', [id]);
      if (!rowCount) throw new NotFoundError('Dependencia', id);
      Logger.info(`Dependencia eliminada: ${id}`);
      return { id };
    });
  }

  // ── Vistas ────────────────────────────────

  async listViews() {
    return withClient(async (client) => {
      const { rows } = await client.query(`${SQL_VISTA} ORDER BY v.is_default DESC, v.name`);
      return rows.map(mapView);
    });
  }

  async createView(data, createdBy) {
    try {
      return await withTransaction(async (client) => {
        // Solo una vista por defecto: se desmarca la anterior en la misma transacción
        if (data.isDefault) await desmarcarVistaPorDefecto(client);
        const vp = data.viewport || {};
        const { rows } = await client.query(
          `INSERT INTO inventory.topology_views
             (name, slug, description, is_default, viewport_zoom, viewport_x, viewport_y, layout_mode, filter_config, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
           RETURNING id::text AS id`,
          [data.name, data.slug, data.description ?? null, data.isDefault ?? false, vp.zoom ?? 1, vp.x ?? 0, vp.y ?? 0,
            data.layoutMode ?? 'manual', JSON.stringify(data.filterConfig ?? {}), createdBy],
        );
        return resolveView(client, { id: rows[0].id });
      });
    } catch (err) {
      throw traducirErrorPg(err, 'vista');
    }
  }

  async updateView(id, patch) {
    try {
      return await withTransaction(async (client) => {
        // El bloqueo de tabla se toma ANTES que el de fila para no invertir el orden de bloqueos
        if (patch.isDefault === true) await bloquearCambioDeVistaPorDefecto(client);
        const { rows } = await client.query('SELECT is_default FROM inventory.topology_views WHERE id = $1::bigint FOR UPDATE', [id]);
        if (!rows[0]) throw new NotFoundError('Vista', id);
        if (patch.isDefault === false && rows[0].is_default) {
          throw new ValidationError('Para cambiar la vista por defecto, marque otra vista como predeterminada');
        }
        if (patch.isDefault === true && !rows[0].is_default) {
          await client.query('UPDATE inventory.topology_views SET is_default = FALSE WHERE is_default');
        }
        const sets = [];
        const params = [id];
        const set = (col, val, cast = '') => { params.push(val); sets.push(`${col} = $${params.length}${cast}`); };
        if ('name' in patch) set('name', patch.name);
        if ('slug' in patch) set('slug', patch.slug);
        if ('description' in patch) set('description', patch.description);
        if ('isDefault' in patch) set('is_default', patch.isDefault);
        if ('layoutMode' in patch) set('layout_mode', patch.layoutMode);
        if ('filterConfig' in patch) set('filter_config', JSON.stringify(patch.filterConfig), '::jsonb');
        if (patch.viewport) {
          if ('zoom' in patch.viewport) set('viewport_zoom', patch.viewport.zoom);
          if ('x' in patch.viewport) set('viewport_x', patch.viewport.x);
          if ('y' in patch.viewport) set('viewport_y', patch.viewport.y);
        }
        if (sets.length) await client.query(`UPDATE inventory.topology_views SET ${sets.join(', ')} WHERE id = $1::bigint`, params);
        return resolveView(client, { id });
      });
    } catch (err) {
      throw traducirErrorPg(err, 'vista');
    }
  }

  /**
   * Guardado masivo de posiciones (INSERT ... ON CONFLICT DO UPDATE) y del viewport.
   * @param {string} viewId
   * @param {{ positions: Array<{serverId, x, y, pinned, collapsed}>, removeServerIds: string[], viewport: object|null }} payload
   */
  async saveViewPositions(viewId, { positions, removeServerIds = [], viewport = null }) {
    try {
      return await withTransaction(async (client) => {
        const { rows } = await client.query('SELECT id FROM inventory.topology_views WHERE id = $1::bigint FOR UPDATE', [viewId]);
        if (!rows[0]) throw new NotFoundError('Vista', viewId);
        await assertServersExist(client, positions.map((p) => p.serverId));

        let saved = 0;
        if (positions.length) {
          const r = await client.query(
            `INSERT INTO inventory.topology_node_positions (view_id, server_id, x, y, pinned, collapsed)
             SELECT $1::bigint, t.server_id, t.x, t.y, t.pinned, t.collapsed
             FROM unnest($2::bigint[], $3::float8[], $4::float8[], $5::boolean[], $6::boolean[])
                  AS t(server_id, x, y, pinned, collapsed)
             ON CONFLICT (view_id, server_id) DO UPDATE
               SET x = EXCLUDED.x, y = EXCLUDED.y, pinned = EXCLUDED.pinned, collapsed = EXCLUDED.collapsed`,
            [viewId, positions.map((p) => p.serverId), positions.map((p) => p.x), positions.map((p) => p.y),
              positions.map((p) => p.pinned), positions.map((p) => p.collapsed)],
          );
          saved = r.rowCount;
        }

        let removed = 0;
        if (removeServerIds.length) {
          const r = await client.query(
            'DELETE FROM inventory.topology_node_positions WHERE view_id = $1::bigint AND server_id = ANY($2::bigint[])',
            [viewId, removeServerIds],
          );
          removed = r.rowCount;
        }

        if (viewport) {
          await client.query(
            `UPDATE inventory.topology_views
               SET viewport_zoom = COALESCE($2, viewport_zoom), viewport_x = COALESCE($3, viewport_x),
                   viewport_y = COALESCE($4, viewport_y)
             WHERE id = $1::bigint`,
            [viewId, viewport.zoom ?? null, viewport.x ?? null, viewport.y ?? null],
          );
        } else {
          await client.query('UPDATE inventory.topology_views SET updated_at = NOW() WHERE id = $1::bigint', [viewId]);
        }
        const view = await resolveView(client, { id: viewId });
        return { viewId, saved, removed, viewport: view.viewport };
      });
    } catch (err) {
      throw traducirErrorPg(err, 'posiciones');
    }
  }

  async deleteView(id) {
    return withTransaction(async (client) => {
      const { rows } = await client.query('SELECT name, is_default FROM inventory.topology_views WHERE id = $1::bigint FOR UPDATE', [id]);
      if (!rows[0]) throw new NotFoundError('Vista', id);
      if (rows[0].is_default) throw new ConflictError('No se puede eliminar la vista por defecto');
      await client.query('DELETE FROM inventory.topology_views WHERE id = $1::bigint', [id]);
      Logger.info(`Vista de topología eliminada: ${rows[0].name} (ID: ${id})`);
      return { id };
    });
  }
}

export default new TopologyService();

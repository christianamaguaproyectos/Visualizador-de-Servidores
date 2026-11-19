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
 * No hay FK entre ambos: monitoringSyncService.js crea/actualiza el host de
 * monitoreo de cada servidor buscando primero por NOMBRE (hosts.name = servers.nombre)
 * y, si no existe, por IP. La IP del host es la "IP limpia" del inventario: el
 * primer token de servers.ip (separado por espacios, saltos de línea, "," o ";")
 * si tiene forma IPv4; si no hay IP válida guarda el marcador 0.0.0.0.
 * Este servicio replica esa regla en SQL (LEFT JOIN LATERAL, un único host por
 * servidor) con este orden de preferencia:
 *   1) hosts.name = servers.nombre (exacto, como el sync)
 *   2) mismo nombre sin distinguir mayúsculas ni espacios extremos
 *   3) host(hosts.ip) = IP limpia del servidor (nunca 0.0.0.0)
 *   en empate, el host de menor id.
 * Solo los hosts HABILITADOS en estado DOWN o DEGRADED son raíces del impacto
 * real (un host deshabilitado —servidor APAGADO/BAJA— puede tener estado viejo).
 */

import { withClient } from '../config/db.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import Logger from '../utils/logger.js';
import {
  analyzeServer, buildAdjacency, CASCADE_STATUS, compareIds, computeCascadeImpact, markBidirectionalPairs,
} from './topologyGraph.js';

// Funciones de grafo del plan (1.2), reexportadas para quien importe el servicio
export { computeCascadeImpact, isBidirectionalPair, analyzeServer } from './topologyGraph.js';

/** Estados de monitoreo que originan impacto en cascada */
export const DOWN_STATES = Object.freeze(['DOWN', 'DEGRADED']);

// IP limpia del inventario (misma regla que monitoringSyncService.cleanIP), sin "\" para
// no depender de escapes dentro de la plantilla JS
const SQL_IP_LIMPIA = `NULLIF((regexp_match(btrim(COALESCE(s.ip, '')), '^([0-9]{1,3}([.][0-9]{1,3}){3})([[:space:],;]|$)'))[1], '0.0.0.0')`;

/** SELECT de servidores + host de monitoreo + posición en la vista ($1 = view_id o NULL) */
const SQL_SERVIDORES = `
  SELECT s.id::text AS id, s.type::text AS type, s.nombre, s.ip, s.hostname, s.rack_norm,
         s.estado AS estado_inventario, s.activo,
         h.id::text AS monitoring_host_id, h.estado_actual, h.enabled AS monitoring_enabled,
         h.estado_changed_at,
         p.x, p.y, p.pinned, p.collapsed
  FROM inventory.servers s
  CROSS JOIN LATERAL (SELECT ${SQL_IP_LIMPIA} AS ip_limpia) c
  LEFT JOIN LATERAL (
    SELECT mh.id, mh.estado_actual, mh.enabled, mh.estado_changed_at
    FROM monitoring.hosts mh
    WHERE mh.name = s.nombre
       OR lower(btrim(mh.name)) = lower(btrim(s.nombre))
       OR (c.ip_limpia IS NOT NULL AND host(mh.ip) = c.ip_limpia)
    ORDER BY CASE
               WHEN mh.name = s.nombre THEN 0
               WHEN lower(btrim(mh.name)) = lower(btrim(s.nombre)) THEN 1
               ELSE 2
             END, mh.id
    LIMIT 1
  ) h ON TRUE
  LEFT JOIN inventory.topology_node_positions p ON p.server_id = s.id AND p.view_id = $1::bigint`;

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

async function withTransaction(fn) {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const resultado = await fn(client);
      await client.query('COMMIT');
      return resultado;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => { });
      throw err;
    }
  });
}

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
      return new ConflictError(`El ${contexto} ya existe`);
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
  const params = [viewId];
  let where = '';
  if (ids) {
    params.push(ids);
    where = ' WHERE s.id = ANY($2::bigint[])';
  }
  const { rows } = await client.query(`${SQL_SERVIDORES}${where} ORDER BY s.id`, params);
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
    throw new NotFoundError(faltan.length === 1 ? 'Servidor' : 'Servidores', lista);
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
   */
  async getTopologyGraph({ viewSelector = null, includeIsolated = false, simulateDownIds = [] } = {}) {
    return withClient(async (client) => {
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
    });
  }

  /** Dependencias y dependientes (directos y transitivos) de un servidor + ciclos */
  async getServerImpactAnalysis(serverId) {
    return withClient(async (client) => {
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
    });
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

  async #insertDependency(client, d, createdBy) {
    const { rows } = await client.query(
      `INSERT INTO inventory.server_dependencies
         (source_server_id, target_server_id, dependency_type, criticality, port, protocol, label, notes, created_by)
       VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id::text AS id`,
      [d.sourceServerId, d.targetServerId, d.dependencyType, d.criticality, d.port, d.protocol, d.label, d.notes, createdBy],
    );
    return this.#getDependency(client, rows[0].id);
  }

  /**
   * Crea una dependencia (y su inversa si bidirectional=true, en la MISMA transacción).
   * @returns {Promise<{ dependency: object, dependencies: object[] }>}
   */
  async createDependency(data, createdBy) {
    try {
      const creadas = await withTransaction(async (client) => {
        await assertServersExist(client, [data.sourceServerId, data.targetServerId]);
        const lista = [await this.#insertDependency(client, data, createdBy)];
        if (data.bidirectional) {
          lista.push(await this.#insertDependency(client, {
            ...data, sourceServerId: data.targetServerId, targetServerId: data.sourceServerId,
          }, createdBy));
        }
        return lista;
      });
      Logger.info(`Dependencia creada: ${data.sourceServerId} -> ${data.targetServerId} (${data.dependencyType})${data.bidirectional ? ' y su inversa' : ''}`);
      return { dependency: creadas[0], dependencies: creadas };
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
        if (data.isDefault) await client.query('UPDATE inventory.topology_views SET is_default = FALSE WHERE is_default');
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

/**
 * Validación y normalización de entradas del Mapa de Dependencias / Topología.
 *
 * Funciones puras: reciben lo que llega en req.body / req.query / req.params y
 * devuelven valores limpios o lanzan ValidationError (HTTP 400) con un mensaje
 * claro. Los IDs se devuelven como string de dígitos (BIGINT sin pérdida).
 */

import { ValidationError } from '../middleware/errorHandler.js';
import { parsePositiveBigInt } from '../utils/ids.js';

export const DEPENDENCY_TYPES = Object.freeze([
  'DATABASE', 'NETWORK', 'STORAGE', 'API', 'AUTH', 'HYPERVISOR', 'BACKUP', 'DNS_INFRA', 'SERVICE',
]);
export const CRITICALITIES = Object.freeze(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

export const LIMITS = Object.freeze({
  label: 120,
  name: 120,
  slug: 120,
  protocol: 20,
  layoutMode: 30,
  notes: 2000,
  description: 1000,
  createdBy: 120,
  maxPositions: 1000,
  maxIdList: 200,
  maxCoordinate: 1_000_000,
  maxViewportOffset: 10_000_000,
  minZoom: 0.05,
  maxZoom: 10,
  maxFilterConfigBytes: 8192,
});

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PROTOCOL_RE = /^[A-Za-z0-9._+-]+$/;
const LAYOUT_MODE_RE = /^[a-z0-9_-]+$/;
// Caracteres de control C0 y DEL (y C1). En textos multilínea se conservan \t \n \r.
// eslint-disable-next-line no-control-regex
const CONTROL_ALL = /[\x00-\x1F\x7F-\x9F]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_NEWLINES = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;

/**
 * Caracteres invisibles y de control bidireccional de Unicode que se ELIMINAN
 * siempre: espacios de ancho cero y marcas LRM/RLM (U+200B-U+200F), incrustaciones
 * y anulaciones bidi (U+202A-U+202E), aislamientos bidi (U+2066-U+2069) y BOM
 * (U+FEFF). Permitirían etiquetas o nombres que se ven idénticos o invertidos
 * ("Trojan Source") y duplicados que el UNIQUE no detecta. Se construyen con
 * códigos para no escribir esos caracteres en el fuente.
 */
const rangoUnicode = (desde, hasta) => {
  let s = '';
  for (let c = desde; c <= hasta; c++) s += String.fromCharCode(c);
  return s;
};
export const INVISIBLES_UNICODE = new RegExp(
  `[${rangoUnicode(0x200B, 0x200F)}${rangoUnicode(0x202A, 0x202E)}${rangoUnicode(0x2066, 0x2069)}${String.fromCharCode(0xFEFF)}]`,
  'g',
);

const has = (obj, ...keys) => keys.some((k) => Object.prototype.hasOwnProperty.call(obj, k));
const pick = (obj, ...keys) => {
  for (const k of keys) if (has(obj, k)) return obj[k];
  return undefined;
};

/** Exige que el cuerpo sea un objeto JSON (no array, no null) */
export function requireBodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('El cuerpo de la petición debe ser un objeto JSON');
  }
  return body;
}

/** ID positivo como string de dígitos */
export function parseId(value, field = 'id') {
  return parsePositiveBigInt(value, field).toString();
}

/**
 * Texto opcional: quita caracteres de control e invisibles/bidi de Unicode,
 * recorta espacios y valida longitud.
 * null / undefined / '' -> null.
 */
export function cleanText(value, { field, max, multiline = false, required = false }) {
  if (value === undefined || value === null) {
    if (required) throw new ValidationError(`${field} es obligatorio`);
    return null;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new ValidationError(`${field} debe ser texto`);
  }
  const limpio = String(value)
    .replace(INVISIBLES_UNICODE, '')
    .replace(multiline ? CONTROL_EXCEPT_NEWLINES : CONTROL_ALL, multiline ? '' : ' ')
    .trim();
  if (!limpio) {
    if (required) throw new ValidationError(`${field} es obligatorio`);
    return null;
  }
  if (limpio.length > max) throw new ValidationError(`${field} admite como máximo ${max} caracteres`);
  return limpio;
}

/** Valor de una lista cerrada (sin distinguir mayúsculas) */
export function parseEnum(value, allowed, field) {
  if (typeof value !== 'string' || !allowed.includes(value.trim().toUpperCase())) {
    throw new ValidationError(`${field} inválido. Valores permitidos: ${allowed.join(', ')}`);
  }
  return value.trim().toUpperCase();
}

/** Puerto opcional 1-65535 (número o string de dígitos) */
export function parsePort(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'string' && /^\d{1,5}$/.test(value.trim()) ? Number(value.trim()) : value;
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new ValidationError('port debe ser un entero entre 1 y 65535');
  }
  return n;
}

function parseProtocol(value) {
  const p = cleanText(value, { field: 'protocol', max: LIMITS.protocol });
  if (p !== null && !PROTOCOL_RE.test(p)) {
    throw new ValidationError('protocol solo admite letras, números y . _ + -');
  }
  return p;
}

function parseBooleanValue(value, field) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  throw new ValidationError(`${field} debe ser booleano`);
}

/** Booleano de query string (?x=true|false|1|0); ausente -> valor por defecto */
export function parseBooleanQuery(value, field, defaultValue) {
  if (value === undefined || value === '') return defaultValue;
  if (Array.isArray(value)) throw new ValidationError(`${field} debe ser booleano`);
  const v = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'si'].includes(v)) return true;
  if (['false', '0', 'no'].includes(v)) return false;
  throw new ValidationError(`${field} debe ser booleano (true/false)`);
}

/** Lista de IDs "1,2,3" (query) o array (body). Sin duplicados, máx. LIMITS.maxIdList */
export function parseIdList(value, field) {
  if (value === undefined || value === null || value === '') return [];
  let partes;
  if (Array.isArray(value)) partes = value;
  else if (typeof value === 'string') partes = value.split(',').map((s) => s.trim()).filter(Boolean);
  else throw new ValidationError(`${field} debe ser una lista de IDs separados por comas`);
  if (partes.length > LIMITS.maxIdList) {
    throw new ValidationError(`${field} admite como máximo ${LIMITS.maxIdList} IDs`);
  }
  return [...new Set(partes.map((p) => parseId(p, field)))];
}

/** ?view= acepta un ID numérico o un slug; ausente -> null (vista por defecto) */
export function parseViewSelector(value) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new ValidationError('view debe ser un ID o un slug');
  const v = value.trim();
  if (/^\d+$/.test(v)) return { id: parseId(v, 'view') };
  if (v.length <= LIMITS.slug && SLUG_RE.test(v)) return { slug: v };
  throw new ValidationError('view debe ser un ID numérico o un slug válido (minúsculas, números y guiones)');
}

function finiteNumber(value, field, { min, max }) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new ValidationError(`${field} debe ser un número finito`);
  if (n < min || n > max) throw new ValidationError(`${field} debe estar entre ${min} y ${max}`);
  return n;
}

/** Normaliza un nombre a slug: "Servicio ERP Núcleo" -> "servicio-erp-nucleo" */
export function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITS.slug)
    .replace(/-+$/g, '');
}

// ─────────────────────────────────────────────
//  Dependencias
// ─────────────────────────────────────────────

/** Cuerpo de POST /api/dependencies (acepta camelCase o snake_case) */
export function parseDependencyCreate(body) {
  requireBodyObject(body);
  const sourceRaw = pick(body, 'sourceServerId', 'source_server_id');
  const targetRaw = pick(body, 'targetServerId', 'target_server_id');
  if (sourceRaw === undefined || targetRaw === undefined) {
    throw new ValidationError('sourceServerId y targetServerId son obligatorios');
  }
  const sourceServerId = parseId(sourceRaw, 'sourceServerId');
  const targetServerId = parseId(targetRaw, 'targetServerId');
  if (sourceServerId === targetServerId) {
    throw new ValidationError('Un servidor no puede depender de sí mismo');
  }
  const typeRaw = pick(body, 'dependencyType', 'dependency_type');
  const critRaw = pick(body, 'criticality');
  const bidirectionalRaw = pick(body, 'bidirectional', 'mutual');
  return {
    sourceServerId,
    targetServerId,
    dependencyType: typeRaw === undefined || typeRaw === null || typeRaw === ''
      ? 'SERVICE' : parseEnum(typeRaw, DEPENDENCY_TYPES, 'dependencyType'),
    criticality: critRaw === undefined || critRaw === null || critRaw === ''
      ? 'CRITICAL' : parseEnum(critRaw, CRITICALITIES, 'criticality'),
    port: parsePort(body.port),
    protocol: parseProtocol(body.protocol),
    label: cleanText(body.label, { field: 'label', max: LIMITS.label }),
    notes: cleanText(body.notes, { field: 'notes', max: LIMITS.notes, multiline: true }),
    bidirectional: bidirectionalRaw === undefined ? false : parseBooleanValue(bidirectionalRaw, 'bidirectional'),
  };
}

/** Cuerpo de PUT /api/dependencies/:id (parcial: solo lo que venga) */
export function parseDependencyUpdate(body) {
  requireBodyObject(body);
  const patch = {};
  if (has(body, 'sourceServerId', 'source_server_id')) {
    patch.sourceServerId = parseId(pick(body, 'sourceServerId', 'source_server_id'), 'sourceServerId');
  }
  if (has(body, 'targetServerId', 'target_server_id')) {
    patch.targetServerId = parseId(pick(body, 'targetServerId', 'target_server_id'), 'targetServerId');
  }
  if (has(body, 'dependencyType', 'dependency_type')) {
    patch.dependencyType = parseEnum(pick(body, 'dependencyType', 'dependency_type'), DEPENDENCY_TYPES, 'dependencyType');
  }
  if (has(body, 'criticality')) patch.criticality = parseEnum(body.criticality, CRITICALITIES, 'criticality');
  if (has(body, 'port')) patch.port = parsePort(body.port);
  if (has(body, 'protocol')) patch.protocol = parseProtocol(body.protocol);
  if (has(body, 'label')) patch.label = cleanText(body.label, { field: 'label', max: LIMITS.label });
  if (has(body, 'notes')) patch.notes = cleanText(body.notes, { field: 'notes', max: LIMITS.notes, multiline: true });
  if (Object.keys(patch).length === 0) throw new ValidationError('No se envió ningún campo para actualizar');
  return patch;
}

// ─────────────────────────────────────────────
//  Vistas
// ─────────────────────────────────────────────

function parseSlug(value) {
  const s = cleanText(value, { field: 'slug', max: LIMITS.slug, required: true });
  if (!SLUG_RE.test(s)) throw new ValidationError('slug solo admite minúsculas, números y guiones (ej. "erp-produccion")');
  return s;
}

function parseLayoutMode(value) {
  const m = cleanText(value, { field: 'layoutMode', max: LIMITS.layoutMode, required: true });
  if (!LAYOUT_MODE_RE.test(m)) throw new ValidationError('layoutMode solo admite minúsculas, números, _ y -');
  return m;
}

function parseFilterConfig(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('filterConfig debe ser un objeto JSON');
  }
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json, 'utf8') > LIMITS.maxFilterConfigBytes) {
    throw new ValidationError(`filterConfig no puede superar ${LIMITS.maxFilterConfigBytes} bytes`);
  }
  return value;
}

/** Viewport { zoom, x, y } (todos opcionales salvo que se exija alguno) */
export function parseViewport(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('viewport debe ser un objeto { zoom, x, y }');
  }
  const vp = {};
  if (has(value, 'zoom')) vp.zoom = finiteNumber(value.zoom, 'viewport.zoom', { min: LIMITS.minZoom, max: LIMITS.maxZoom });
  if (has(value, 'x')) vp.x = finiteNumber(value.x, 'viewport.x', { min: -LIMITS.maxViewportOffset, max: LIMITS.maxViewportOffset });
  if (has(value, 'y')) vp.y = finiteNumber(value.y, 'viewport.y', { min: -LIMITS.maxViewportOffset, max: LIMITS.maxViewportOffset });
  if (Object.keys(vp).length === 0) throw new ValidationError('viewport debe incluir zoom, x o y');
  return vp;
}

function parseViewCommon(body, patch) {
  if (has(body, 'description')) patch.description = cleanText(body.description, { field: 'description', max: LIMITS.description, multiline: true });
  if (has(body, 'isDefault', 'is_default')) patch.isDefault = parseBooleanValue(pick(body, 'isDefault', 'is_default'), 'isDefault');
  if (has(body, 'layoutMode', 'layout_mode')) patch.layoutMode = parseLayoutMode(pick(body, 'layoutMode', 'layout_mode'));
  if (has(body, 'filterConfig', 'filter_config')) patch.filterConfig = parseFilterConfig(pick(body, 'filterConfig', 'filter_config'));
  if (has(body, 'viewport')) patch.viewport = parseViewport(body.viewport);
  return patch;
}

/** Cuerpo de POST /api/topology/views */
export function parseViewCreate(body) {
  requireBodyObject(body);
  const name = cleanText(body.name, { field: 'name', max: LIMITS.name, required: true });
  let slug;
  if (has(body, 'slug') && body.slug !== null && body.slug !== '') {
    slug = parseSlug(body.slug);
  } else {
    slug = slugify(name);
    if (!slug) throw new ValidationError('No se pudo generar un slug a partir del nombre: envíe "slug" explícitamente');
  }
  return parseViewCommon(body, { name, slug });
}

/** Cuerpo de PUT /api/topology/views/:id (parcial) */
export function parseViewUpdate(body) {
  requireBodyObject(body);
  const patch = {};
  if (has(body, 'name')) patch.name = cleanText(body.name, { field: 'name', max: LIMITS.name, required: true });
  if (has(body, 'slug')) patch.slug = parseSlug(body.slug);
  parseViewCommon(body, patch);
  if (Object.keys(patch).length === 0) throw new ValidationError('No se envió ningún campo para actualizar');
  return patch;
}

/**
 * Cuerpo de PUT /api/topology/views/:id/positions
 * { positions: [{ serverId, x, y, pinned?, collapsed? }], viewport?: {zoom,x,y}, removeServerIds?: [] }
 * Si un servidor viene repetido gana la última posición.
 */
export function parsePositionsPayload(body) {
  requireBodyObject(body);
  const lista = body.positions === undefined ? [] : body.positions;
  if (!Array.isArray(lista)) throw new ValidationError('positions debe ser un array');
  if (lista.length > LIMITS.maxPositions) {
    throw new ValidationError(`positions admite como máximo ${LIMITS.maxPositions} nodos por petición`);
  }
  const porServidor = new Map();
  lista.forEach((p, i) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new ValidationError(`positions[${i}] debe ser un objeto`);
    const serverId = parseId(pick(p, 'serverId', 'server_id'), `positions[${i}].serverId`);
    const rango = { min: -LIMITS.maxCoordinate, max: LIMITS.maxCoordinate };
    porServidor.set(serverId, {
      serverId,
      x: finiteNumber(p.x, `positions[${i}].x`, rango),
      y: finiteNumber(p.y, `positions[${i}].y`, rango),
      pinned: p.pinned === undefined ? true : parseBooleanValue(p.pinned, `positions[${i}].pinned`),
      collapsed: p.collapsed === undefined ? false : parseBooleanValue(p.collapsed, `positions[${i}].collapsed`),
    });
  });

  const removeRaw = pick(body, 'removeServerIds', 'remove_server_ids');
  let removeServerIds = [];
  if (removeRaw !== undefined) {
    if (!Array.isArray(removeRaw)) throw new ValidationError('removeServerIds debe ser un array');
    if (removeRaw.length > LIMITS.maxPositions) {
      throw new ValidationError(`removeServerIds admite como máximo ${LIMITS.maxPositions} IDs`);
    }
    removeServerIds = [...new Set(removeRaw.map((v) => parseId(v, 'removeServerIds')))];
  }

  const viewport = body.viewport === undefined || body.viewport === null ? null : parseViewport(body.viewport);
  if (porServidor.size === 0 && removeServerIds.length === 0 && !viewport) {
    throw new ValidationError('Envíe positions, removeServerIds o viewport');
  }
  return { positions: [...porServidor.values()], removeServerIds, viewport };
}

/** Usuario de la sesión para created_by (sin caracteres de control, máx. 120) */
export function sessionUsername(req) {
  return cleanText(req.session?.user?.username || 'system', { field: 'usuario', max: 500 })
    ?.slice(0, LIMITS.createdBy) || 'system';
}

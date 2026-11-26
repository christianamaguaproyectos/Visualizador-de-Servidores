/**
 * Validación y normalización de las entradas de Impacto de servicios.
 *
 * Funciones puras: reciben lo que llega en req.body / req.query / req.params y devuelven
 * valores limpios o lanzan ValidationError (HTTP 400). Los IDs se devuelven como string
 * de dígitos (BIGINT sin pérdida).
 */

import { ValidationError } from '../middleware/errorHandler.js';
import { parsePositiveBigInt } from '../utils/ids.js';
import { NIVELES_IMPACTO } from '../services/impactoCalculo.js';

export const LIMITES = Object.freeze({
  nombre: 120,
  descripcion: 1000,
  papel: 200,
  texto: 2000,
  usuario: 120,
  maxSimulados: 200,
});

// Caracteres de control C0, DEL y C1. En textos multilínea se conservan \t \n \r.
// eslint-disable-next-line no-control-regex
const CONTROL_TODOS = /[\x00-\x1F\x7F-\x9F]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_SALVO_SALTOS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;

/**
 * Caracteres invisibles y de control bidireccional de Unicode que se eliminan siempre
 * (U+200B-U+200F, U+202A-U+202E, U+2066-U+2069 y BOM): permitirían nombres que se ven
 * idénticos o invertidos. Se construyen con códigos para no escribirlos en el fuente.
 */
const rango = (desde, hasta) => {
  let s = '';
  for (let c = desde; c <= hasta; c++) s += String.fromCharCode(c);
  return s;
};
export const INVISIBLES_UNICODE = new RegExp(
  `[${rango(0x200B, 0x200F)}${rango(0x202A, 0x202E)}${rango(0x2066, 0x2069)}${String.fromCharCode(0xFEFF)}]`,
  'g',
);

const tiene = (obj, clave) => Object.prototype.hasOwnProperty.call(obj, clave);

/** Exige que el cuerpo sea un objeto JSON (no array, no null) */
export function exigirObjeto(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('El cuerpo de la petición debe ser un objeto JSON');
  }
  return body;
}

/** ID positivo como string de dígitos */
export function parseId(valor, campo = 'id') {
  return parsePositiveBigInt(valor, campo).toString();
}

/** Texto opcional limpio; null / undefined / '' → null */
export function limpiarTexto(valor, { campo, max, multilinea = false, obligatorio = false }) {
  if (valor === undefined || valor === null) {
    if (obligatorio) throw new ValidationError(`${campo} es obligatorio`);
    return null;
  }
  if (typeof valor !== 'string' && typeof valor !== 'number') throw new ValidationError(`${campo} debe ser texto`);
  const limpio = String(valor)
    .replace(INVISIBLES_UNICODE, '')
    .replace(multilinea ? CONTROL_SALVO_SALTOS : CONTROL_TODOS, multilinea ? '' : ' ')
    .trim();
  if (!limpio) {
    if (obligatorio) throw new ValidationError(`${campo} es obligatorio`);
    return null;
  }
  if (limpio.length > max) throw new ValidationError(`${campo} admite como máximo ${max} caracteres`);
  return limpio;
}

function parseImpacto(valor) {
  if (typeof valor !== 'string' || !NIVELES_IMPACTO.includes(valor.trim().toUpperCase())) {
    throw new ValidationError(`impacto inválido. Valores permitidos: ${NIVELES_IMPACTO.join(', ')}`);
  }
  return valor.trim().toUpperCase();
}

/** POST /api/impacto/servicios */
export function parseServicioNuevo(body) {
  exigirObjeto(body);
  return {
    name: limpiarTexto(body.name, { campo: 'name', max: LIMITES.nombre, obligatorio: true }),
    description: limpiarTexto(body.description, { campo: 'description', max: LIMITES.descripcion, multilinea: true }),
  };
}

/** PUT /api/impacto/servicios/:id (solo los campos enviados) */
export function parseServicioCambios(body) {
  exigirObjeto(body);
  const cambios = {};
  if (tiene(body, 'name')) cambios.name = limpiarTexto(body.name, { campo: 'name', max: LIMITES.nombre, obligatorio: true });
  if (tiene(body, 'description')) cambios.description = limpiarTexto(body.description, { campo: 'description', max: LIMITES.descripcion, multilinea: true });
  if (!Object.keys(cambios).length) throw new ValidationError('No hay cambios que aplicar');
  return cambios;
}

/** Lista JSON de IDs (sin repetir); null → [] */
function parseIdsLista(valor, campo) {
  if (valor === null) return [];
  if (!Array.isArray(valor)) throw new ValidationError(`${campo} debe ser una lista`);
  if (valor.length > LIMITES.maxSimulados) throw new ValidationError(`${campo} admite como máximo ${LIMITES.maxSimulados} elementos`);
  return [...new Set(valor.map((v) => parseId(v, campo)))];
}

/** Campos de un componente (papel de un servidor en un servicio) */
function camposComponente(body, { parcial }) {
  const c = {};
  if (!parcial || tiene(body, 'role')) c.role = limpiarTexto(body.role, { campo: 'role', max: LIMITES.papel });
  if (!parcial || tiene(body, 'impact')) c.impact = body.impact === undefined && !parcial ? 'SIN_DEFINIR' : parseImpacto(body.impact);
  if (!parcial || tiene(body, 'impactDetail')) c.impactDetail = limpiarTexto(body.impactDetail, { campo: 'impactDetail', max: LIMITES.texto, multilinea: true });
  // Componentes del mismo servicio que también caen si cae este
  if (!parcial || tiene(body, 'alsoFails')) c.alsoFails = body.alsoFails === undefined ? [] : parseIdsLista(body.alsoFails, 'alsoFails');
  return c;
}

/** POST /api/impacto/servicios/:id/componentes */
export function parseComponenteNuevo(body) {
  exigirObjeto(body);
  return { serverId: parseId(body.serverId, 'serverId'), ...camposComponente(body, { parcial: false }) };
}

/** PUT /api/impacto/componentes/:id */
export function parseComponenteCambios(body) {
  exigirObjeto(body);
  if (tiene(body, 'serverId')) throw new ValidationError('El servidor de un componente no se puede cambiar: elimínelo y agréguelo de nuevo');
  const c = camposComponente(body, { parcial: true });
  if (!Object.keys(c).length) throw new ValidationError('No hay cambios que aplicar');
  return c;
}

/** ?ids=1,2,3 → lista de IDs sin repetir */
export function parseListaIds(valor, campo = 'ids') {
  if (valor === undefined || valor === null || valor === '') return [];
  if (typeof valor !== 'string') throw new ValidationError(`${campo} solo puede indicarse una vez`);
  const ids = [...new Set(valor.split(',').map((p) => p.trim()).filter(Boolean).map((p) => parseId(p, campo)))];
  if (ids.length > LIMITES.maxSimulados) throw new ValidationError(`${campo} admite como máximo ${LIMITES.maxSimulados} servidores`);
  return ids;
}

/** Usuario de la sesión (autor de los registros) */
export function usuarioSesion(req) {
  return limpiarTexto(req.session?.user?.username || 'system', { campo: 'usuario', max: 500 })?.slice(0, LIMITES.usuario) || 'system';
}

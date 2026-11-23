/**
 * Envoltorios de la API de dependencias y topología (Fase 1). Todas las peticiones
 * pasan por apiJson (tiempo de espera, 401 y CSRF vía /js/csrf.js).
 */
import { apiJson } from '../ui-system/apiFetch.js';

const json = (metodo, cuerpo) => ({
  method: metodo,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(cuerpo ?? {}),
});
const enc = encodeURIComponent;

export function obtenerGrafo({ vista = null, includeIsolated = false, simulateDownIds = [], signal } = {}) {
  const q = new URLSearchParams();
  if (vista) q.set('view', vista);
  if (includeIsolated) q.set('includeIsolated', 'true');
  if (simulateDownIds.length) q.set('simulateDownIds', simulateDownIds.join(','));
  const qs = q.toString();
  return apiJson(`/api/topology/graph${qs ? `?${qs}` : ''}`, { signal });
}

export const listarVistas = () => apiJson('/api/topology/views');
/** Inventario de la vista de racks (/fisicos o /virtuales): racks, también vacíos, con sus servidores */
export const obtenerInventario = (tipo) => apiJson(`/api/data?type=${enc(tipo)}`);
export const crearVista = (datos) => apiJson('/api/topology/views', json('POST', datos));
export const editarVista = (id, datos) => apiJson(`/api/topology/views/${enc(id)}`, json('PUT', datos));
export const eliminarVista = (id) => apiJson(`/api/topology/views/${enc(id)}`, { method: 'DELETE' });
export const guardarPosiciones = (id, datos) => apiJson(`/api/topology/views/${enc(id)}/positions`, json('PUT', datos));

export const listarDependencias = (serverId) =>
  apiJson(`/api/dependencies${serverId ? `?serverId=${enc(serverId)}` : ''}`);
export const analisisImpacto = (serverId) => apiJson(`/api/dependencies/server/${enc(serverId)}/impact`);
export const crearDependencia = (datos) => apiJson('/api/dependencies', json('POST', datos));
export const editarDependencia = (id, datos) => apiJson(`/api/dependencies/${enc(id)}`, json('PUT', datos));
export const eliminarDependencia = (id) => apiJson(`/api/dependencies/${enc(id)}`, { method: 'DELETE' });

export const obtenerUsuario = () => apiJson('/api/auth/user');

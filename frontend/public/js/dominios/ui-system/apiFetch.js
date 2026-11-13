/**
 * apiFetch(): cliente HTTP común del frontend (Fase 4.2 / FE-MED-05).
 *
 * - Tiempo de espera con AbortController: una petición colgada ya no deja la pantalla
 *   "cargando" para siempre (por defecto 15 s).
 * - Acepta una señal externa (signal) para cancelar, p. ej., al cambiar de vista.
 * - 401 centralizado: si la sesión expiró, se redirige UNA vez a /login.
 * - El token CSRF lo sigue añadiendo /js/csrf.js (envuelve window.fetch), así que
 *   apiFetch funciona igual para GET y para POST/PUT/DELETE.
 */

const TIEMPO_ESPERA_MS = 15000;
let redirigiendoALogin = false;

export class ErrorApi extends Error {
  constructor(mensaje, { status = 0, datos = null, tiempoAgotado = false } = {}) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    this.datos = datos;
    this.tiempoAgotado = tiempoAgotado;
  }
}

function manejarSesionExpirada() {
  if (redirigiendoALogin || window.location.pathname.startsWith('/login')) return;
  redirigiendoALogin = true;
  window.location.href = '/login';
}

/**
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number, redirigirEn401?: boolean }} [opciones]
 * @returns {Promise<Response>}
 */
export async function apiFetch(url, opciones = {}) {
  const { timeoutMs = TIEMPO_ESPERA_MS, redirigirEn401 = true, signal, ...init } = opciones;
  const controlador = new AbortController();
  let tiempoAgotado = false;
  const temporizador = setTimeout(() => { tiempoAgotado = true; controlador.abort(); }, timeoutMs);

  if (signal) {
    if (signal.aborted) controlador.abort();
    else signal.addEventListener('abort', () => controlador.abort(), { once: true });
  }

  try {
    const respuesta = await fetch(url, { credentials: 'same-origin', ...init, signal: controlador.signal });
    if (respuesta.status === 401 && redirigirEn401) manejarSesionExpirada();
    return respuesta;
  } catch (error) {
    if (tiempoAgotado) {
      throw new ErrorApi(`Tiempo de espera agotado (${Math.round(timeoutMs / 1000)} s): ${url}`, { tiempoAgotado: true });
    }
    throw error;
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Igual que apiFetch pero devuelve el JSON y lanza ErrorApi si la respuesta no es 2xx.
 * @returns {Promise<any>}
 */
export async function apiJson(url, opciones = {}) {
  const respuesta = await apiFetch(url, opciones);
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const mensaje = datos?.error || datos?.message || `Error HTTP ${respuesta.status}`;
    throw new ErrorApi(mensaje, { status: respuesta.status, datos });
  }
  return datos;
}

import crypto from 'crypto';
import { logInfo } from '../utils/structuredLogger.js';

function crearRequestId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

// Solo se acepta un x-request-id entrante con caracteres seguros y longitud acotada:
// evita inyección en logs (saltos de línea, secuencias de escape) y cabeceras gigantes.
const REQUEST_ID_VALIDO = /^[a-zA-Z0-9._-]{1,64}$/;

// Parámetros de query cuyo valor nunca debe quedar en los logs (p. ej. ?token= del reset de clave)
const PARAMS_SENSIBLES = /^(token|resettoken|reset_token|password|pass|clave|secret|key|apikey|api_key|code|csrf|csrftoken)$/i;

export function sanitizarRequestId(valor) {
  return typeof valor === 'string' && REQUEST_ID_VALIDO.test(valor) ? valor : null;
}

/**
 * Devuelve la URL con los valores de parámetros sensibles reemplazados por [REDACTED].
 */
export function redactarUrl(url) {
  if (typeof url !== 'string') return '';
  const idx = url.indexOf('?');
  if (idx === -1) return url;
  const ruta = url.slice(0, idx);
  const partes = url.slice(idx + 1).split('&').map((par) => {
    const igual = par.indexOf('=');
    if (igual === -1) return par;
    const nombre = par.slice(0, igual);
    let nombreDecodificado = nombre;
    try { nombreDecodificado = decodeURIComponent(nombre); } catch { /* mal codificado: se usa tal cual */ }
    return PARAMS_SENSIBLES.test(nombreDecodificado) ? `${nombre}=[REDACTED]` : par;
  });
  return `${ruta}?${partes.join('&')}`;
}

export function attachRequestContext(req, res, next) {
  const requestId = sanitizarRequestId(req.get('x-request-id')) || crearRequestId();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  if (req.path.startsWith('/api/')) {
    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.requestId === undefined) {
        return originalJson({ ...payload, requestId });
      }
      return originalJson(payload);
    };
  }

  next();
}

export function structuredApiRequestLogger(req, res, next) {
  const isApi = req.path.startsWith('/api/') || req.path === '/events';
  if (!isApi) {
    return next();
  }

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    logInfo('http.request', 'Request procesado', 'api', {
      requestId: req.requestId,
      method: req.method,
      path: redactarUrl(req.originalUrl),
      statusCode: res.statusCode,
      durationMs: Math.round(elapsedMs),
      ip: req.ip,
      usuario: req.session?.user?.username || null
    });
  });

  next();
}

/**
 * Protección CSRF (Cross-Site Request Forgery)
 *
 * Dos capas para toda petición que modifica datos (POST, PUT, PATCH, DELETE):
 *  1. Verificación de origen: si el navegador envía Origin/Referer, debe ser el
 *     mismo sitio (o uno de CORS_ORIGINS).
 *  2. Token sincronizado: la cabecera X-CSRF-Token debe coincidir con el token
 *     guardado en la sesión (se obtiene con GET /api/auth/csrf).
 *
 * Login, recuperación y restablecimiento de contraseña ocurren antes de tener
 * sesión, por eso solo usan la verificación de origen.
 */

import crypto from 'crypto';
import { Logger } from '../utils/logger.js';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Endpoints previos a la sesión: solo verificación de origen */
const RUTAS_SIN_TOKEN = new Set([
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
]);

/**
 * Devuelve el token CSRF de la sesión, creándolo si no existe
 * @param {Object} req
 * @returns {string}
 */
export function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

/**
 * GET /api/auth/csrf -> { csrfToken }
 */
export function getCsrfToken(req, res) {
  res.json({ csrfToken: ensureCsrfToken(req) });
}

function origenDeReferer(referer) {
  try {
    return referer ? new URL(referer).origin : null;
  } catch {
    return null;
  }
}

function tokensIguales(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Crea el middleware CSRF
 * @param {{allowedOrigins?: string[]}} opciones
 */
export function createCsrfProtection({ allowedOrigins = [] } = {}) {
  const origenesPermitidos = new Set(allowedOrigins);

  return function csrfProtection(req, res, next) {
    if (METODOS_SEGUROS.has(req.method)) return next();

    const rechazar = (code, motivo) => {
      Logger.warn(`🛡️  CSRF bloqueado (${motivo}): ${req.method} ${req.originalUrl.split('?')[0]}`);
      return res.status(403).json({
        error: 'Solicitud rechazada por protección CSRF',
        code,
        requestId: req.requestId || null,
      });
    };

    // 1) Origen: los navegadores siempre envían Origin en peticiones cross-site
    const origen = req.get('origin') || origenDeReferer(req.get('referer'));
    if (origen) {
      let hostOrigen = null;
      try { hostOrigen = new URL(origen).host; } catch { /* origen inválido */ }
      const mismoSitio = hostOrigen && hostOrigen === req.get('host');
      if (!mismoSitio && !origenesPermitidos.has(origen)) {
        return rechazar('CSRF_ORIGIN', `origen no permitido: ${origen}`);
      }
    }

    // 2) Token sincronizado (excepto endpoints previos a la sesión)
    const ruta = req.originalUrl.split('?')[0];
    if (RUTAS_SIN_TOKEN.has(ruta)) return next();

    // Sin sesión iniciada no hay nada que falsificar: requireAuth responderá 401
    if (!req.session?.user) return next();

    const esperado = req.session?.csrfToken;
    const recibido = req.get('x-csrf-token');
    if (!esperado || !recibido || !tokensIguales(esperado, recibido)) {
      return rechazar('CSRF_INVALID', 'token ausente o inválido');
    }

    return next();
  };
}

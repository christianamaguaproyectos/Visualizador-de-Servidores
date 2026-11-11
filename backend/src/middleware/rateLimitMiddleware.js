/**
 * Rate limiter en memoria para despliegues simples (PM2 single instance).
 * Para multi-instancia se recomienda migrar a Redis.
 */
/** Tope de claves en memoria por limitador (evita crecimiento sin límite) */
const MAX_KEYS_DEFAULT = 10_000;

export function createRateLimiter({
  windowMs = 60 * 1000,
  maxRequests = 60,
  message = 'Demasiadas solicitudes. Intente nuevamente más tarde.',
  keyGenerator,
  maxKeys = MAX_KEYS_DEFAULT
} = {}) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of hits.entries()) {
      if (value.resetAt <= now) {
        hits.delete(key);
      }
    }
  }, Math.max(30 * 1000, Math.floor(windowMs / 2))).unref?.();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const keyBase = keyGenerator ? keyGenerator(req) : req.ip;
    const key = `${req.path}:${keyBase || 'unknown'}`;

    const current = hits.get(key);
    if (!current || current.resetAt <= now) {
      // Si se alcanza el tope, descartar la clave más antigua (Map conserva orden de inserción)
      if (!current && hits.size >= maxKeys) {
        hits.delete(hits.keys().next().value);
      }
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message,
        retryAfterSeconds
      });
    }

    current.count += 1;
    hits.set(key, current);
    return next();
  };
}

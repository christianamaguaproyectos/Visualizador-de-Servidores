import crypto from 'crypto';
import { logInfo } from '../utils/structuredLogger.js';

function crearRequestId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

export function attachRequestContext(req, res, next) {
  const requestId = req.get('x-request-id') || crearRequestId();
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
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(elapsedMs),
      ip: req.ip,
      usuario: req.session?.user?.username || null
    });
  });

  next();
}

export function securityHeadersMiddleware(req, res, next) {
  // Hardening basico sin romper recursos actuales.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  const cspReportOnly = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  res.setHeader('Content-Security-Policy-Report-Only', cspReportOnly);
  next();
}

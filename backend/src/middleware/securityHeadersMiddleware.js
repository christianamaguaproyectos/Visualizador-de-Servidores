/**
 * Content-Security-Policy ACTIVA (Fase 4.2 / FE-MED-05).
 *
 * - Sin 'unsafe-inline' ni 'unsafe-eval': todos los <script>, <style> y atributos style="..."
 *   inline se movieron a archivos (js/paginas/*.js, css/*.css). Si alguien lograra inyectar
 *   HTML, el navegador NO ejecutaría sus scripts ni sus estilos.
 * - Sin dominios externos: las fuentes están auto-alojadas en /fonts (antes Google Fonts).
 * - Asignar element.style.x desde JS (CSSOM) sigue permitido; lo bloqueado es el atributo
 *   style="..." en HTML/innerHTML y los <style>/<script> sin archivo.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

export function securityHeadersMiddleware(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  next();
}

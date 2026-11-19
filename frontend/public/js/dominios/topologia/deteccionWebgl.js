/**
 * Detección de WebGL sin descargar three.js. Se puede forzar la ausencia con
 * ?webgl=0 (útil para probar el aviso y el cambio automático al Editor 2D).
 */
export function hayWebgl() {
  try {
    if (new URLSearchParams(window.location.search).get('webgl') === '0') return false;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    const perder = gl.getExtension('WEBGL_lose_context');
    if (perder) perder.loseContext();
    return true;
  } catch {
    return false;
  }
}

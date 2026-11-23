/**
 * Detección de WebGL sin descargar three.js. Se puede forzar la ausencia con
 * ?webgl=0 (útil para probar el aviso y el cambio automático al Editor 2D).
 */
/**
 * true si el equipo dibuja con gráficos integrados o por software (Intel, AMD Radeon integrada
 * de portátil, SwiftShader, llvmpipe…). Se usa para empezar en modo rendimiento.
 */
export function graficosModestos() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const nombre = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (/nvidia|geforce|quadro|rtx|radeon rx|radeon pro|apple m\d/.test(nombre)) return false;
    return /intel|uhd|iris|swiftshader|llvmpipe|software|basic render|mesa|vega|radeon\(tm\) graphics|adreno|mali/.test(nombre);
  } catch {
    return true;
  }
}

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

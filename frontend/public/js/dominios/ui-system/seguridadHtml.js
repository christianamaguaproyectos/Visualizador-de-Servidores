/**
 * Funciones compartidas para insertar datos en HTML de forma segura (anti-XSS).
 * Usar SIEMPRE que un dato del servidor o del usuario vaya dentro de innerHTML.
 */

const ENTIDADES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapa texto para el contenido de un elemento HTML
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return (value ?? '').toString().replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

/**
 * Escapa texto para un atributo HTML entre comillas (ej. data-x="...")
 * @param {*} value
 * @returns {string}
 */
export function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

/**
 * Texto seguro con guion largo si está vacío
 * @param {*} value
 * @returns {string}
 */
export function textoSeguro(value) {
  const limpio = (value ?? '').toString().trim();
  return limpio ? escapeHtml(limpio) : '—';
}

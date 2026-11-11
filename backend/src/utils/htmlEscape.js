/**
 * Utilidades para insertar datos de forma segura en correos HTML.
 */

const ENTIDADES_HTML = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapa un valor para insertarlo en HTML (contenido o atributos entre comillas).
 * Evita que nombres de host/usuario con etiquetas HTML alteren el correo.
 * @param {*} valor
 * @returns {string}
 */
export function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ENTIDADES_HTML[c]);
}

/**
 * Limpia un texto para usarlo en un encabezado de correo (ej. Subject):
 * elimina saltos de línea CR/LF que permitirían inyectar encabezados.
 * @param {*} valor
 * @param {number} [maximo=200]
 * @returns {string}
 */
export function limpiarEncabezado(valor, maximo = 200) {
  return String(valor ?? '').replace(/[\r\n]+/g, ' ').slice(0, maximo);
}

/** Email simple y estricto: sin espacios, < >, comillas ni separadores */
const EMAIL_REGEX = /^[^\s@<>()[\]\\,;:"']+@[^\s@<>()[\]\\,;:"']+\.[a-zA-Z]{2,}$/;

/**
 * Valida un email con una expresión estricta
 * @param {*} email
 * @returns {boolean}
 */
export function esEmailValido(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_REGEX.test(email);
}

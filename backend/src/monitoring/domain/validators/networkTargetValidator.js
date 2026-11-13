/**
 * Validador centralizado de destinos de red para los checks de monitoreo (anti-SSRF).
 *
 * Impide que los checks ICMP/TCP/HTTP apunten a destinos peligrosos:
 *  - loopback (127.0.0.0/8, ::1) -> la propia máquina / servicios locales
 *  - 0.0.0.0/8 y ::               -> "esta red"
 *  - link-local (169.254.0.0/16, fe80::/10) -> metadatos de nube (169.254.169.254)
 *  - multicast / reservados (224.0.0.0/4, 240.0.0.0/4, ff00::/8)
 *  - IPv6 de uso local único (fc00::/7)
 *
 * Excepción: las subredes listadas en MONITORING_ALLOWED_CIDRS (separadas por coma,
 * ej. "127.0.0.1/32,fd00:10::/64") se permiten aunque caigan en un rango bloqueado.
 *
 * La validación se hace sobre TODAS las IP resueltas por DNS y también en el
 * momento de conectar (crearLookupSeguro), para evitar DNS rebinding.
 */

import net from 'net';
import dns from 'dns';

/** Rangos bloqueados: [direccion, prefijo, tipo] */
const RANGOS_BLOQUEADOS = [
  ['0.0.0.0', 8, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'],
  ['240.0.0.0', 4, 'ipv4'],
  ['::', 128, 'ipv6'],
  ['::1', 128, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
  ['ff00::', 8, 'ipv6'],
];

/** Nombres que siempre apuntan a la propia máquina */
const NOMBRES_BLOQUEADOS = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback']);

/** Hostname RFC 1123: etiquetas alfanuméricas, guiones solo en medio, máx. 253 caracteres */
const HOSTNAME_REGEX = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.?$/;

const listaBloqueada = new net.BlockList();
for (const [direccion, prefijo, tipo] of RANGOS_BLOQUEADOS) {
  listaBloqueada.addSubnet(direccion, prefijo, tipo);
}

/**
 * Construye la lista de subredes permitidas desde MONITORING_ALLOWED_CIDRS
 * @returns {net.BlockList}
 */
function construirListaPermitida() {
  const lista = new net.BlockList();
  const valor = process.env.MONITORING_ALLOWED_CIDRS || '';

  for (const cidr of valor.split(',').map(s => s.trim()).filter(Boolean)) {
    const [direccion, prefijoTexto] = cidr.split('/');
    const tipo = net.isIPv6(direccion) ? 'ipv6' : net.isIPv4(direccion) ? 'ipv4' : null;
    if (!tipo) continue;
    const prefijo = prefijoTexto === undefined ? (tipo === 'ipv4' ? 32 : 128) : Number(prefijoTexto);
    try {
      lista.addSubnet(direccion, prefijo, tipo);
    } catch {
      // CIDR mal formado: se ignora
    }
  }
  return lista;
}

const listaPermitida = construirListaPermitida();

/**
 * Normaliza IPv4 mapeadas en IPv6 (::ffff:127.0.0.1 -> 127.0.0.1)
 * @param {string} ip
 * @returns {string}
 */
function normalizarIp(ip) {
  const mapeada = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  return mapeada ? mapeada[1] : ip;
}

/**
 * Indica si una IP literal está permitida como destino de un check
 * @param {string} ipOriginal
 * @returns {boolean}
 */
export function esIpPermitida(ipOriginal) {
  const ip = normalizarIp(String(ipOriginal || ''));
  const familia = net.isIP(ip);
  if (familia === 0) return false;

  const tipo = familia === 6 ? 'ipv6' : 'ipv4';
  if (listaPermitida.check(ip, tipo)) return true;
  return !listaBloqueada.check(ip, tipo);
}

/**
 * Valida la sintaxis de un host (IP literal o hostname RFC 1123).
 * Rechaza valores que empiecen con '-' (inyección de opciones en ping).
 * @param {string} host
 * @returns {boolean}
 */
export function esHostSintacticamenteValido(host) {
  if (typeof host !== 'string' || host.length === 0 || host.startsWith('-')) return false;
  return net.isIP(host) !== 0 || HOSTNAME_REGEX.test(host);
}

/**
 * Resuelve un host y valida TODAS sus IP.
 * @param {string} host - IP o hostname
 * @returns {Promise<{valido: boolean, error?: string, direcciones?: {address: string, family: number}[]}>}
 */
export async function validarDestinoRed(host) {
  if (!esHostSintacticamenteValido(host)) {
    return { valido: false, error: 'Host inválido' };
  }

  if (NOMBRES_BLOQUEADOS.has(host.toLowerCase().replace(/\.$/, ''))) {
    return { valido: false, error: 'Destino no permitido (localhost)' };
  }

  let direcciones;
  if (net.isIP(host) !== 0) {
    direcciones = [{ address: host, family: net.isIP(host) }];
  } else {
    try {
      direcciones = await dns.promises.lookup(host, { all: true });
    } catch {
      return { valido: false, error: `No se pudo resolver el host ${host}` };
    }
  }

  if (!direcciones.length) {
    return { valido: false, error: `No se pudo resolver el host ${host}` };
  }

  const bloqueada = direcciones.find(d => !esIpPermitida(d.address));
  if (bloqueada) {
    return { valido: false, error: `Destino no permitido: ${host} resuelve a una dirección restringida` };
  }

  return { valido: true, direcciones };
}

/**
 * Valida el destino de un check según su tipo (icmp/tcp usan host, http usa url)
 * @param {string} kind
 * @param {Object} config
 * @returns {Promise<{valido: boolean, error?: string}>}
 */
export async function validarDestinoChequeo(kind, config = {}) {
  if (kind === 'http') {
    let url;
    try {
      url = new URL(config.url);
    } catch {
      return { valido: false, error: 'URL inválida para chequeo HTTP' };
    }
    // new URL() devuelve IPv6 entre corchetes: [::1]
    const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
    return validarDestinoRed(host);
  }
  return validarDestinoRed(config.host || config.ip);
}

/**
 * Función `lookup` compatible con net.connect / undici que valida las IP
 * resueltas JUSTO al conectar (evita DNS rebinding entre validación y conexión).
 */
export function lookupSeguro(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  dns.lookup(hostname, { ...options, all: true }, (err, direcciones) => {
    if (err) return callback(err);

    const bloqueada = direcciones.find(d => !esIpPermitida(d.address));
    if (bloqueada || direcciones.length === 0) {
      const error = new Error(`Destino no permitido: ${hostname} resuelve a una dirección restringida`);
      error.code = 'EDESTINONOPERMITIDO';
      return callback(error);
    }

    if (options.all) return callback(null, direcciones);
    return callback(null, direcciones[0].address, direcciones[0].family);
  });
}

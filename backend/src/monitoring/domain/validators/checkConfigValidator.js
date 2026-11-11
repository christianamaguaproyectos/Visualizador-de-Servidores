import { TiposChequeo } from '../glosario/terminosDominio.js';
import { esHostSintacticamenteValido } from './networkTargetValidator.js';

/** Límites permitidos para los parámetros numéricos de un check */
export const LIMITES_CHEQUEO = {
  frequency_sec: { min: 15, max: 86400 },
  timeout_ms: { min: 200, max: 15000 },
  retries: { min: 0, max: 5 },
};

function esHostValido(host) {
  // IP literal o hostname RFC 1123; nunca empieza con '-' (evita inyectar opciones a ping)
  return esHostSintacticamenteValido(host);
}

function esPuertoValido(port) {
  const numero = Number(port);
  return Number.isInteger(numero) && numero > 0 && numero <= 65535;
}

function esUrlValida(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validarConfiguracionChequeo(tipoChequeo, configuracion = {}) {
  if (!tipoChequeo) {
    return { valido: false, error: 'Tipo de chequeo no definido' };
  }

  if (tipoChequeo === TiposChequeo.ICMP) {
    const host = configuracion.host || configuracion.ip;
    return esHostValido(host)
      ? { valido: true }
      : { valido: false, error: 'Host invalido para chequeo ICMP' };
  }

  if (tipoChequeo === TiposChequeo.TCP) {
    const host = configuracion.host || configuracion.ip;
    if (!esHostValido(host)) {
      return { valido: false, error: 'Host invalido para chequeo TCP' };
    }
    if (!esPuertoValido(configuracion.port)) {
      return { valido: false, error: 'Puerto invalido para chequeo TCP' };
    }
    return { valido: true };
  }

  if (tipoChequeo === TiposChequeo.HTTP) {
    return esUrlValida(configuracion.url)
      ? { valido: true }
      : { valido: false, error: 'URL invalida para chequeo HTTP' };
  }

  return { valido: false, error: 'Tipo de chequeo no soportado' };
}

/**
 * Valida los parámetros numéricos de un check (solo los que vienen definidos).
 * @param {{frequency_sec?: any, timeout_ms?: any, retries?: any}} parametros
 * @returns {{valido: boolean, error?: string}}
 */
export function validarParametrosChequeo(parametros = {}) {
  for (const [campo, { min, max }] of Object.entries(LIMITES_CHEQUEO)) {
    const valor = parametros[campo];
    if (valor === undefined) continue;

    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero < min || numero > max) {
      return { valido: false, error: `${campo} debe ser un entero entre ${min} y ${max}` };
    }
  }
  return { valido: true };
}

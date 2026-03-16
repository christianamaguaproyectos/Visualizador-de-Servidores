import { TiposChequeo } from '../glosario/terminosDominio.js';

const HOST_REGEX = /^[a-zA-Z0-9._-]+$/;

function esHostValido(host) {
  return typeof host === 'string' && host.length > 0 && HOST_REGEX.test(host);
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

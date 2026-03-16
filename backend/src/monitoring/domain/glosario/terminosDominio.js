export const TiposChequeo = Object.freeze({
  ICMP: 'icmp',
  TCP: 'tcp',
  HTTP: 'http'
});

export const EstadosChequeo = Object.freeze({
  OK: 'ok',
  FALLA: 'fail',
  TIMEOUT: 'timeout',
  DEGRADADO: 'degraded'
});

export const EstadosHost = Object.freeze({
  ARRIBA: 'UP',
  CAIDO: 'DOWN',
  DEGRADADO: 'DEGRADED',
  MANTENIMIENTO: 'MAINTENANCE'
});

export const SeveridadesIncidente = Object.freeze({
  CRITICA: 'critical',
  ADVERTENCIA: 'warning'
});

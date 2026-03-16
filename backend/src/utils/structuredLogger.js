function construirEvento({
  nivel = 'info',
  evento,
  dominio = 'general',
  mensaje,
  metadatos = {},
  error
}) {
  return {
    timestamp: new Date().toISOString(),
    nivel,
    evento,
    dominio,
    mensaje,
    entorno: process.env.NODE_ENV || 'development',
    servicio: process.env.SERVICE_NAME || 'diagrama-servers',
    metadatos,
    error: error
      ? {
          nombre: error.name,
          mensaje: error.message,
          codigo: error.code
        }
      : undefined
  };
}

function escribirEvento(evento) {
  const linea = JSON.stringify(evento);
  if (evento.nivel === 'error') {
    console.error(linea);
    return;
  }
  if (evento.nivel === 'warn') {
    console.warn(linea);
    return;
  }
  console.log(linea);
}

export function logEstructurado(parametros) {
  escribirEvento(construirEvento(parametros));
}

export function logInfo(evento, mensaje, dominio, metadatos = {}) {
  logEstructurado({ nivel: 'info', evento, dominio, mensaje, metadatos });
}

export function logAdvertencia(evento, mensaje, dominio, metadatos = {}) {
  logEstructurado({ nivel: 'warn', evento, dominio, mensaje, metadatos });
}

export function logError(evento, mensaje, dominio, metadatos = {}, error) {
  logEstructurado({ nivel: 'error', evento, dominio, mensaje, metadatos, error });
}

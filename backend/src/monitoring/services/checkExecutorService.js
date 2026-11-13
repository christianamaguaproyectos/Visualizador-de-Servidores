import { request, Agent } from 'undici';
import net from 'net';
import { execFile } from 'child_process';
import { promisify } from 'util';
import monitoringConfig from '../config/monitoringConfig.js';
import Logger from '../../utils/logger.js';
import { logAdvertencia, logError } from '../../utils/structuredLogger.js';
import { EstadosChequeo, TiposChequeo } from '../domain/glosario/terminosDominio.js';
import { validarConfiguracionChequeo } from '../domain/validators/checkConfigValidator.js';
import { validarDestinoRed, validarDestinoChequeo, lookupSeguro } from '../domain/validators/networkTargetValidator.js';

const execFileAsync = promisify(execFile);

/**
 * Cliente HTTP para checks: valida la IP resuelta al conectar (anti DNS rebinding)
 * y nunca sigue redirecciones automáticamente.
 */
const agenteHttpSeguro = new Agent({
  connect: { lookup: lookupSeguro }
});

/** En Windows un ping exitoso siempre incluye "TTL=" (en inglés y español) */
const PING_TTL_REGEX = /TTL=\d+/i;
/** Latencia del ping: "time=12ms", "time<1ms", "tiempo=12ms" y "tiempo<1m" (Windows en español) */
const PING_TIEMPO_REGEX = /(?:time|tiempo)[=<]\s*(\d+(?:\.\d+)?)\s*ms?/i;

class CheckExecutorService {
  /**
   * Ejecuta ping ICMP real usando el comando del sistema
   */
  async runICMP(host, timeoutMs = 2000) {
    const validacion = validarConfiguracionChequeo(TiposChequeo.ICMP, { host });
    if (!validacion.valido) {
      return {
        status: EstadosChequeo.FALLA,
        latency: 0,
        error: validacion.error
      };
    }

    // Resolver y validar el destino (anti-SSRF); se hace ping a la IP ya validada
    const destino = await validarDestinoRed(host);
    if (!destino.valido) {
      return { status: EstadosChequeo.FALLA, latency: 0, error: destino.error };
    }
    const ip = destino.direcciones[0].address;

    const start = Date.now();
    const timeoutSec = Math.ceil(timeoutMs / 1000);

    // Detectar sistema operativo y ajustar comando
    const isWindows = process.platform === 'win32';
    const argumentos = isWindows
      ? ['-n', '1', '-w', String(timeoutMs), ip]
      : ['-c', '1', '-W', String(timeoutSec), '--', ip];

    try {
      const { stdout } = await execFileAsync('ping', argumentos, { timeout: timeoutMs + 1000 });
      const latency = Date.now() - start;

      // En Windows, ping devuelve código 0 aunque responda "Host de destino inaccesible"
      // (lo contesta el gateway). Solo es éxito real si la respuesta trae "TTL=".
      if (isWindows && !PING_TTL_REGEX.test(stdout)) {
        return { status: EstadosChequeo.FALLA, latency, error: 'Host inaccesible (sin respuesta TTL)' };
      }

      // Extraer tiempo del ping del output (inglés o español)
      let pingTime = latency;
      const timeMatch = stdout.match(PING_TIEMPO_REGEX);
      if (timeMatch) {
        pingTime = Math.round(parseFloat(timeMatch[1]));
      }

      return { status: EstadosChequeo.OK, latency: pingTime };
    } catch (err) {
      const latency = Date.now() - start;

      // Timeout del comando
      if (err.killed || err.code === 'ETIMEDOUT') {
        return { status: EstadosChequeo.TIMEOUT, latency, error: 'ICMP timeout' };
      }

      // Host no alcanzable (exit code != 0)
      return { status: EstadosChequeo.FALLA, latency, error: err.message || 'Host unreachable' };
    }
  }

  async runTCP({ host, port, timeoutMs }) {
    const validacion = validarConfiguracionChequeo(TiposChequeo.TCP, { host, port });
    if (!validacion.valido) {
      return {
        status: EstadosChequeo.FALLA,
        latency: 0,
        error: validacion.error
      };
    }

    // Resolver y validar el destino (anti-SSRF); se conecta a la IP ya validada
    const destino = await validarDestinoRed(host);
    if (!destino.valido) {
      return { status: EstadosChequeo.FALLA, latency: 0, error: destino.error };
    }
    const ip = destino.direcciones[0].address;

    const start = Date.now();
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const onDone = (status, error) => {
        if (settled) return; settled = true;
        try { socket.destroy(); } catch {}
        const latency = Date.now() - start;
        resolve({ status, latency, error });
      };
      socket.setTimeout(timeoutMs, () => onDone(EstadosChequeo.TIMEOUT, 'TCP timeout'));
      socket.once('error', (err) => onDone(EstadosChequeo.FALLA, err.message));
      socket.connect(Number(port), ip, () => onDone(EstadosChequeo.OK));
    });
  }

  async runHTTP({ url, timeoutMs, expectCode = 200 }) {
    const validacion = validarConfiguracionChequeo(TiposChequeo.HTTP, { url });
    if (!validacion.valido) {
      return {
        status: EstadosChequeo.FALLA,
        latency: 0,
        error: validacion.error
      };
    }

    // Validar el destino antes de conectar (anti-SSRF). La IP se vuelve a validar
    // al conectar mediante agenteHttpSeguro (lookupSeguro) para evitar DNS rebinding.
    const destino = await validarDestinoChequeo(TiposChequeo.HTTP, { url });
    if (!destino.valido) {
      return { status: EstadosChequeo.FALLA, latency: 0, error: destino.error };
    }

    const start = Date.now();
    try {
      const { statusCode, headers, body } = await request(url, {
        method: 'GET',
        dispatcher: agenteHttpSeguro,
        maxRedirections: 0,
        signal: AbortSignal.timeout(timeoutMs)
      });
      // Descartar el cuerpo para liberar la conexión
      await body.dump().catch(() => {});
      const latency = Date.now() - start;
      const status = statusCode === expectCode ? EstadosChequeo.OK : EstadosChequeo.DEGRADADO;
      // No se guardan las cabeceras crudas (pueden incluir Set-Cookie o datos internos)
      return { status, latency, code: statusCode, sample: { statusCode, contentType: headers['content-type'] || null } };
    } catch (err) {
      const latency = Date.now() - start;
      const status = err.name === 'TimeoutError' ? EstadosChequeo.TIMEOUT : EstadosChequeo.FALLA;
      return { status, latency, error: err.message };
    }
  }

  async execute(check) {
    const { kind, config = {} } = check || {};
    if (!kind) {
      return { status: EstadosChequeo.FALLA, error: 'Check sin tipo' };
    }

    const validacion = validarConfiguracionChequeo(kind, config);
    if (!validacion.valido) {
      return { status: EstadosChequeo.FALLA, error: validacion.error };
    }

    // timeout del check: el scheduler lo envía como timeoutMs (columna timeout_ms).
    // Antes solo ICMP lo usaba; TCP/HTTP ignoraban el timeout configurado del check.
    const timeoutDelCheck = Number(check?.timeoutMs ?? check?.timeout_ms ?? config.timeoutMs) || null;
    const defaults = monitoringConfig.defaults;

    try {
      if (kind === TiposChequeo.ICMP) {
        const host = config.host || config.ip;
        return await this.runICMP(host, timeoutDelCheck || defaults.pingTimeoutMs);
      }
      if (kind === TiposChequeo.TCP) {
        return await this.runTCP({ host: config.host || config.ip, port: config.port, timeoutMs: timeoutDelCheck || defaults.tcpTimeoutMs });
      }
      if (kind === TiposChequeo.HTTP) {
        return await this.runHTTP({ url: config.url, timeoutMs: timeoutDelCheck || defaults.httpTimeoutMs, expectCode: config.expectCode || 200 });
      }
      logAdvertencia('check.tipo_no_soportado', 'Se recibio un tipo de check no soportado', 'monitoreo', {
        tipoChequeo: kind
      });
      return { status: EstadosChequeo.FALLA, error: 'Tipo de check no soportado' };
    } catch (e) {
      Logger.error('Error ejecutando check', kind, e.message);
      logError('check.error_ejecucion', 'Error ejecutando check', 'monitoreo', { tipoChequeo: kind }, e);
      return { status: EstadosChequeo.FALLA, error: e.message };
    }
  }
}

export default new CheckExecutorService();
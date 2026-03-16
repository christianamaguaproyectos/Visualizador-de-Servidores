import { request } from 'undici';
import net from 'net';
import { execFile } from 'child_process';
import { promisify } from 'util';
import monitoringConfig from '../config/monitoringConfig.js';
import Logger from '../../utils/logger.js';
import { logAdvertencia, logError } from '../../utils/structuredLogger.js';
import { EstadosChequeo, TiposChequeo } from '../domain/glosario/terminosDominio.js';
import { validarConfiguracionChequeo } from '../domain/validators/checkConfigValidator.js';

const execFileAsync = promisify(execFile);

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

    const start = Date.now();
    const timeoutSec = Math.ceil(timeoutMs / 1000);

    // Detectar sistema operativo y ajustar comando
    const isWindows = process.platform === 'win32';
    const comando = isWindows ? 'ping' : 'ping';
    const argumentos = isWindows
      ? ['-n', '1', '-w', String(timeoutMs), host]
      : ['-c', '1', '-W', String(timeoutSec), host];

    try {
      const { stdout } = await execFileAsync(comando, argumentos, { timeout: timeoutMs + 1000 });
      const latency = Date.now() - start;

      // Extraer tiempo del ping del output
      let pingTime = latency;
      const timeMatch = stdout.match(/time[=<](\d+(?:\.\d+)?)\s*ms/i);
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
      socket.connect(port, host, () => onDone(EstadosChequeo.OK));
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

    const start = Date.now();
    try {
      const { statusCode, headers } = await request(url, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs)
      });
      const latency = Date.now() - start;
      const status = statusCode === expectCode ? EstadosChequeo.OK : EstadosChequeo.DEGRADADO;
      return { status, latency, code: statusCode, sample: { headers } };
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

    const timeoutMs = check?.timeout_ms || config.timeoutMs || monitoringConfig.defaults.pingTimeoutMs;

    try {
      if (kind === TiposChequeo.ICMP) {
        const host = config.host || config.ip;
        return await this.runICMP(host, timeoutMs);
      }
      if (kind === TiposChequeo.TCP) {
        return await this.runTCP({ host: config.host || config.ip, port: config.port, timeoutMs: config.timeoutMs || monitoringConfig.defaults.tcpTimeoutMs });
      }
      if (kind === TiposChequeo.HTTP) {
        return await this.runHTTP({ url: config.url, timeoutMs: config.timeoutMs || monitoringConfig.defaults.httpTimeoutMs, expectCode: config.expectCode || 200 });
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
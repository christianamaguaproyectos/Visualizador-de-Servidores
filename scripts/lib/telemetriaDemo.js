/**
 * Telemetría de demostración para los hosts de monitoreo creados por seed-demo-topologia.js.
 *
 * Escribe ejecuciones sintéticas en monitoring.check_runs para el check de cada host demo
 * (latencias con variación suave, picos ocasionales; fallos en el host DOWN y respuestas lentas
 * o sin respuesta en el DEGRADED). No ejecuta ninguna conexión de red ni cambia el estado de
 * los hosts: los checks demo siguen desactivados y el planificador no los evalúa.
 * Cada fila lleva sample = {"demo": true}; al borrar los hosts demo (--borrar) se eliminan en
 * cascada.
 */

export const PASO_HISTORIAL_SEG = 60;
export const PASO_CONTINUO_SEG = 15;
const HORAS_HISTORIAL = 24;
const MINUTOS_CAIDA = 45; // el host DOWN deja de responder en los últimos minutos

/** Número pseudoaleatorio determinista en [0, 1) a partir de un texto (FNV-1a + xorshift) */
export function azar(semilla) {
  let h = 2166136261;
  for (let i = 0; i < semilla.length; i += 1) {
    h ^= semilla.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Una ejecución sintética para un host en el instante t (epoch ms).
 * @returns {{status: 'ok'|'fail'|'timeout'|'degraded', latency: number|null}}
 */
export function puntoDemo(nombre, estado, t, ahora = Date.now()) {
  const r = azar(`${nombre}|${t}`);
  const base = 3 + (azar(nombre) * 22); // 3–25 ms según el host
  const onda = Math.sin(t / 900000 + azar(`${nombre}#`) * 6.28) * base * 0.25;
  let latency = Math.max(1, Math.round(base + onda + r * base * 0.35));
  if (r > 0.985) latency = Math.round(latency * (3 + r * 3)); // pico ocasional

  if (estado === 'DOWN' && t > ahora - MINUTOS_CAIDA * 60000) {
    return r < 0.7 ? { status: 'fail', latency: null } : { status: 'timeout', latency: 2000 };
  }
  if (estado === 'DEGRADED') {
    if (r < 0.06) return { status: 'timeout', latency: 2000 };
    if (r < 0.3) return { status: 'degraded', latency: Math.round(latency * 6 + 150) };
  }
  if (r < 0.003) return { status: 'timeout', latency: 2000 };
  return { status: 'ok', latency };
}

/**
 * Completa la serie de cada host demo desde su última ejecución (o desde hace 24 h) hasta ahora.
 * Idempotente: nunca duplica (clave primaria time+check_id y ON CONFLICT DO NOTHING).
 * @param {import('pg').PoolClient|import('pg').Client} client
 * @param {{marca: string, pasoSeg?: number, ahora?: number}} opciones
 * @returns {Promise<number>} filas insertadas
 */
export async function completarTelemetria(client, { marca, pasoSeg = PASO_HISTORIAL_SEG, ahora = Date.now() }) {
  const { rows } = await client.query(`
    SELECT h.id AS host_id, h.name, h.estado_actual, c.id AS check_id,
           (SELECT MAX(time) FROM monitoring.check_runs r WHERE r.check_id = c.id) AS ultima
      FROM monitoring.hosts h
      JOIN LATERAL (SELECT id FROM monitoring.checks WHERE host_id = h.id ORDER BY id LIMIT 1) c ON TRUE
     WHERE $1 = ANY(h.group_tags)`, [marca]);

  const paso = pasoSeg * 1000;
  let insertadas = 0;
  for (const fila of rows) {
    const desde = Math.max(ahora - HORAS_HISTORIAL * 3600000, fila.ultima ? new Date(fila.ultima).getTime() + paso : 0);
    const inicio = Math.ceil(desde / paso) * paso;
    const tiempos = []; const estados = []; const latencias = [];
    for (let t = inicio; t <= ahora; t += paso) {
      const p = puntoDemo(fila.name, fila.estado_actual, t, ahora);
      tiempos.push(new Date(t).toISOString());
      estados.push(p.status);
      latencias.push(p.latency);
    }
    if (!tiempos.length) continue;
    const r = await client.query(`
      INSERT INTO monitoring.check_runs (time, check_id, host_id, status, latency_ms, sample)
      SELECT t, $1, $2, s::monitoring.run_status_enum, l, '{"demo": true}'::jsonb
        FROM unnest($3::timestamptz[], $4::text[], $5::int[]) AS x(t, s, l)
      ON CONFLICT DO NOTHING`, [fila.check_id, fila.host_id, tiempos, estados, latencias]);
    insertadas += r.rowCount;
  }
  return insertadas;
}

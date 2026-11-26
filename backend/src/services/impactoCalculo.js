/**
 * impactoCalculo.js — Cálculo PURO del impacto de una caída (sin base de datos).
 *
 * Una máquina virtual cae con el servidor físico donde corre. El host se reconoce porque el
 * campo Host de la VM (rack_norm) coincide con el nombre o el hostname de un servidor físico,
 * comparando solo letras y números (sin mayúsculas, guiones ni espacios).
 *
 * Después, cada servicio toma el efecto más grave entre sus servidores caídos:
 *   TOTAL → NO_FUNCIONA · PARCIAL → PARCIAL · SIN_DEFINIR → REVISAR · NINGUNO (o nada caído) → FUNCIONA
 */

export const NIVELES_IMPACTO = Object.freeze(['TOTAL', 'PARCIAL', 'NINGUNO', 'SIN_DEFINIR']);

const GRAVEDAD = Object.freeze({ TOTAL: 3, PARCIAL: 2, SIN_DEFINIR: 1, NINGUNO: 0 });
const ESTADO_POR_NIVEL = Object.freeze({ TOTAL: 'NO_FUNCIONA', PARCIAL: 'PARCIAL', SIN_DEFINIR: 'REVISAR', NINGUNO: 'FUNCIONA' });

/** Motivo por el que un servidor queda caído en el cálculo */
export const MOTIVOS = Object.freeze({ CAIDO: 'CAIDO', HOST: 'HOST' });

/** Clave de comparación de nombres de equipo: solo letras y números, en mayúsculas */
export function claveEquipo(texto) {
  return String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Compara IDs (string de dígitos) numéricamente */
const compararIds = (a, b) => (String(a).length - String(b).length) || (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

/**
 * VM → host físico. Si varios físicos tienen la misma clave, se toma el de menor id.
 * @param {Array<{id, type, name?, hostname?, rack?}>} servidores
 * @returns {Map<string, string>} id de VM → id del host
 */
export function hostsDeVms(servidores) {
  const fisicoPorClave = new Map();
  const fisicos = servidores.filter((s) => s.type === 'fisicos').sort((a, b) => compararIds(a.id, b.id));
  for (const f of fisicos) {
    for (const k of [claveEquipo(f.name), claveEquipo(f.hostname)]) {
      if (k && !fisicoPorClave.has(k)) fisicoPorClave.set(k, String(f.id));
    }
  }
  const res = new Map();
  for (const v of servidores) {
    if (v.type === 'fisicos') continue;
    const host = fisicoPorClave.get(claveEquipo(v.rack));
    if (host && host !== String(v.id)) res.set(String(v.id), host);
  }
  return res;
}

/**
 * Propaga una caída. Devuelve cada servidor que cae con el motivo y el servidor que la causó.
 * @param {Iterable<string>} caidosIniciales ids que caen primero
 * @param {Array<{id, type, name?, hostname?, rack?}>} servidores
 * @returns {Map<string, {motivo: string, por: string|null, nivel: number}>}
 */
export function propagarCaida(caidosIniciales, servidores) {
  const existentes = new Set(servidores.map((s) => String(s.id)));
  // Quién cae si cae X: las VMs que aloja
  const siguientes = new Map();
  const agregar = (de, a, motivo) => {
    if (!siguientes.has(de)) siguientes.set(de, []);
    siguientes.get(de).push({ id: a, motivo });
  };
  for (const [vm, host] of hostsDeVms(servidores)) agregar(host, vm, MOTIVOS.HOST);
  for (const l of siguientes.values()) l.sort((a, b) => compararIds(a.id, b.id));

  const caidos = new Map();
  const cola = [];
  for (const id of [...new Set([...caidosIniciales].map(String))].sort(compararIds)) {
    if (!existentes.has(id)) continue;
    caidos.set(id, { motivo: MOTIVOS.CAIDO, por: null, nivel: 0 });
    cola.push(id);
  }
  for (let i = 0; i < cola.length; i++) {
    const actual = cola[i];
    for (const s of siguientes.get(actual) || []) {
      if (caidos.has(s.id) || !existentes.has(s.id)) continue;
      caidos.set(s.id, { motivo: s.motivo, por: actual, nivel: caidos.get(actual).nivel + 1 });
      cola.push(s.id);
    }
  }
  return caidos;
}

/**
 * Estado de cada servicio con los servidores caídos.
 * @param {Array<{id, name, components: Array<{id, serverId, impact}>}>} servicios
 * @param {Map<string, {motivo, por, nivel}>} caidos resultado de propagarCaida
 * @returns {Array<{serviceId, name, estado, nivel, componentesCaidos: object[]}>}
 */
export function evaluarServicios(servicios, caidos) {
  return servicios.map((s) => {
    const componentes = s.components || [];
    const componentesCaidos = componentes
      .filter((c) => caidos.has(String(c.serverId)))
      .map((c) => ({ ...c, caida: caidos.get(String(c.serverId)) }))
      .sort((a, b) => (GRAVEDAD[b.impact] ?? 0) - (GRAVEDAD[a.impact] ?? 0) || a.caida.nivel - b.caida.nivel);
    const peor = componentesCaidos.reduce((m, c) => ((GRAVEDAD[c.impact] ?? 0) > (GRAVEDAD[m] ?? 0) ? c.impact : m), 'NINGUNO');
    return {
      serviceId: String(s.id),
      name: s.name,
      estado: componentesCaidos.length ? ESTADO_POR_NIVEL[peor] : 'FUNCIONA',
      nivel: componentesCaidos.length ? peor : null,
      componentesCaidos,
    };
  });
}

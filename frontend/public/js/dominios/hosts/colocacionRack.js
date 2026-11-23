/**
 * Colocación de servidores en un rack de 42U. Función PURA (sin DOM), compartida por la
 * vista de rack de /fisicos (app.js) y la sala de racks 3D de /dependencias: las dos
 * muestran cada servidor exactamente en las mismas unidades.
 *
 * Índices: 0 = unidad superior (U42) … 41 = unidad inferior (U1). La posición U de un
 * índice es `total - indice`.
 *
 * Reglas (las de la vista de rack):
 *  - Si algún servidor del rack tiene `rackPosition` (> 0), modo "posicionado": en el orden
 *    recibido, cada servidor con posición válida (1..total) ocupa desde la U `rackPosition`
 *    hacia abajo tantas unidades como `rackUnits`; los que no tienen posición ocupan el
 *    primer hueco libre empezando por arriba. Un servidor posterior puede ocupar unidades
 *    de uno anterior (se queda con ellas).
 *  - Si ninguno tiene posición, modo "distribuido": hasta total/2 servidores repartidos de
 *    arriba abajo con huecos iguales entre ellos.
 *  - `rackUnits` vacío o no numérico cuenta como 2U; 0 o negativo, como "no ocupa espacio".
 */

export const UNIDADES_RACK = 42;
const ALTO_POR_DEFECTO = 2;

/** Unidades de un servidor según la regla de la vista de rack */
export function normalizarUnidades(valor, porDefecto = ALTO_POR_DEFECTO) {
  if (valor == null || valor === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isFinite(n)) return porDefecto;
  const entero = Math.floor(n);
  return entero <= 0 ? 0 : entero;
}

const unidadesDe = (s) => normalizarUnidades(s?.rackUnits ?? s?.rack_units, ALTO_POR_DEFECTO);
const posicionDe = (s) => s?.rackPosition ?? s?.rack_position ?? null;

/**
 * @param {Array<object>} servidores servidores del rack, en el orden de la vista de rack
 * @param {number} [total] unidades del rack
 * @returns {{
 *   modo: 'posicionado'|'distribuido',
 *   porUnidad: number[],   // índice del servidor (en `servidores`) que ocupa cada unidad, o -1
 *   bloques: Array<{indice: number, servidor: object, inicio: number, alto: number, uSuperior: number, uInferior: number}>,
 *   ocupadas: number, libres: number, sinUbicar: object[]
 * }} `bloques` = tramos contiguos de un mismo servidor, de arriba abajo
 */
export function colocarEnRack(servidores = [], total = UNIDADES_RACK) {
  const lista = Array.isArray(servidores) ? servidores : [];
  const porUnidad = new Array(total).fill(-1);
  const ocupar = (i, inicio, unidades) => {
    for (let u = 0; u < unidades; u++) {
      const idx = inicio + u;
      if (idx >= total) break;
      porUnidad[idx] = i;
    }
  };
  const posicionado = lista.some((s) => posicionDe(s) != null && posicionDe(s) > 0);

  if (posicionado) {
    lista.forEach((s, i) => {
      const unidades = unidadesDe(s);
      if (unidades <= 0) return;
      const pos = posicionDe(s);
      let inicio = -1;
      if (pos && pos > 0 && pos <= total) {
        inicio = total - pos;
      } else {
        for (let j = 0; j < total - unidades + 1 && inicio < 0; j++) {
          let cabe = true;
          for (let k = 0; k < unidades; k++) if (porUnidad[j + k] !== -1) { cabe = false; break; }
          if (cabe) inicio = j;
        }
      }
      if (inicio >= 0 && inicio < total) ocupar(i, inicio, unidades);
    });
  } else if (lista.length) {
    const activos = Math.min(lista.length, Math.floor(total / ALTO_POR_DEFECTO));
    const espacio = total - activos * ALTO_POR_DEFECTO;
    const huecoBase = Math.floor(espacio / (activos + 1));
    const extra = espacio % (activos + 1);
    let actual = huecoBase;
    for (let i = 0; i < activos; i++) {
      if (i < extra) actual += 1;
      const unidades = unidadesDe(lista[i]);
      if (unidades <= 0) continue;
      if (actual < total) {
        ocupar(i, actual, unidades);
        actual += unidades + huecoBase;
      }
    }
  }

  const bloques = [];
  for (let i = 0; i < total; i++) {
    const dueno = porUnidad[i];
    if (dueno < 0) continue;
    if (i > 0 && porUnidad[i - 1] === dueno) { bloques[bloques.length - 1].alto++; continue; }
    bloques.push({ indice: dueno, servidor: lista[dueno], inicio: i, alto: 1 });
  }
  for (const b of bloques) { b.uSuperior = total - b.inicio; b.uInferior = b.uSuperior - b.alto + 1; }
  const colocados = new Set(bloques.map((b) => b.indice));
  const ocupadas = porUnidad.filter((d) => d >= 0).length;
  return {
    modo: posicionado ? 'posicionado' : 'distribuido',
    porUnidad,
    bloques,
    ocupadas,
    libres: total - ocupadas,
    sinUbicar: lista.filter((_, i) => !colocados.has(i)),
  };
}

/**
 * Tramos de unidades libres, de abajo arriba.
 * @returns {Array<{uInferior: number, uSuperior: number, alto: number}>}
 */
export function huecosLibres(porUnidad) {
  const total = porUnidad.length;
  const huecos = [];
  for (let i = total - 1; i >= 0; i--) {
    if (porUnidad[i] !== -1) continue;
    const u = total - i;
    const ultimo = huecos[huecos.length - 1];
    if (ultimo && ultimo.uSuperior === u - 1) { ultimo.uSuperior = u; ultimo.alto++; } else huecos.push({ uInferior: u, uSuperior: u, alto: 1 });
  }
  return huecos;
}

/**
 * Primera posición libre (de abajo arriba) para un servidor de `unidades` U. Devuelve el
 * valor de `rackPosition` que lo coloca ahí (la U superior del tramo) o null si no cabe.
 */
export function primeraPosicionLibre(porUnidad, unidades = ALTO_POR_DEFECTO) {
  const alto = Math.max(1, unidades);
  const hueco = huecosLibres(porUnidad).find((h) => h.alto >= alto);
  return hueco ? hueco.uInferior + alto - 1 : null;
}

/** Texto de los discos tal como lo muestra la ficha del servidor (JSON de slots o texto libre) */
export function formatearDiscos(valor) {
  if (!valor) return '—';
  try {
    const discos = JSON.parse(valor);
    if (Array.isArray(discos) && discos.length > 0) {
      return discos.map((d) => {
        const partes = [];
        if (d.slot) partes.push(`Slot ${d.slot}:`);
        if (d.cantidad) partes.push(`${d.cantidad}x`);
        if (d.capacidad) partes.push(d.capacidad);
        if (d.fru) partes.push(`(FRU: ${d.fru})`);
        return partes.join(' ');
      }).join('\n');
    }
  } catch { /* texto libre */ }
  return valor;
}

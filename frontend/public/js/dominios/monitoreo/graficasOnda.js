/**
 * Gráficas SVG propias (sin librerías) para la telemetría de Monitoreo.
 * Funciones puras: reciben puntos [epoch_ms, latencia_ms|null, estado] y devuelven marcado SVG
 * como texto. Solo usan atributos SVG (sin style="..."), compatibles con la CSP; el color lo
 * ponen las clases de monitoring-styles.css.
 */

const ESTADO_OK = 'ok';

/** Redondea a 1 decimal para un SVG compacto */
const r1 = (n) => Math.round(n * 10) / 10;

/** Escapa texto para atributos y nodos de texto SVG */
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Resumen de una serie: disponibilidad (%), latencia media, p95, última, fallos */
export function resumirSerie(puntos = []) {
  const total = puntos.length;
  const oks = puntos.filter((p) => p[2] === ESTADO_OK);
  const latencias = oks.map((p) => Number(p[1])).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const media = latencias.length ? Math.round(latencias.reduce((a, b) => a + b, 0) / latencias.length) : null;
  const p95 = latencias.length ? latencias[Math.min(latencias.length - 1, Math.ceil(latencias.length * 0.95) - 1)] : null;
  const ultimo = total ? puntos[total - 1] : null;
  return {
    total,
    fallos: total - oks.length,
    disponibilidad: total ? Math.round((oks.length / total) * 1000) / 10 : null,
    media,
    p95,
    maxima: latencias.length ? latencias[latencias.length - 1] : null,
    ultimaLatencia: ultimo && ['ok', 'degraded'].includes(ultimo[2]) && ultimo[1] !== null && Number.isFinite(Number(ultimo[1])) ? Number(ultimo[1]) : null,
    ultimoEstado: ultimo ? ultimo[2] : null,
    ultimaHora: ultimo ? ultimo[0] : null
  };
}

/** Escala "bonita" para el eje Y (10, 20, 50, 100, 200...) */
export function techoEscala(maximo) {
  if (!Number.isFinite(maximo) || maximo <= 0) return 10;
  const exp = 10 ** Math.floor(Math.log10(maximo));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= maximo) return m * exp;
  return 10 * exp;
}

/**
 * Traza suavizada (curva monótona simple con Bézier cúbicas) entre puntos [x, y].
 * Mantiene la forma de "onda" sin sobrepasar los valores reales.
 */
export function trazoSuave(xy) {
  if (xy.length === 0) return '';
  if (xy.length === 1) return `M${r1(xy[0][0])},${r1(xy[0][1])}`;
  let d = `M${r1(xy[0][0])},${r1(xy[0][1])}`;
  for (let i = 1; i < xy.length; i += 1) {
    const [x0, y0] = xy[i - 1];
    const [x1, y1] = xy[i];
    const cx = (x0 + x1) / 2;
    d += ` C${r1(cx)},${r1(y0)} ${r1(cx)},${r1(y1)} ${r1(x1)},${r1(y1)}`;
  }
  return d;
}

/** Divide la serie en tramos continuos de latencia (un fallo corta la línea) */
function tramos(puntos, x, y) {
  const lista = [];
  let actual = [];
  puntos.forEach((p, i) => {
    const ms = p[1] === null || p[1] === undefined ? NaN : Number(p[1]);
    if (p[2] === ESTADO_OK && Number.isFinite(ms)) {
      actual.push([x(i), y(ms)]);
    } else if (actual.length) {
      lista.push(actual);
      actual = [];
    }
  });
  if (actual.length) lista.push(actual);
  return lista;
}

/**
 * Mini-onda (sparkline) para tarjetas: área + línea; los fallos se marcan con un punto rojo.
 * @param {Array} puntos  [[epoch_ms, latencia_ms, estado], ...]
 */
export function svgMiniOnda(puntos = [], { ancho = 120, alto = 28 } = {}) {
  const pad = 2;
  if (!puntos.length) {
    return `<svg class="onda-mini onda-mini--vacia" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" aria-hidden="true" focusable="false">` +
      `<line class="onda-base" x1="0" y1="${alto - pad}" x2="${ancho}" y2="${alto - pad}"/></svg>`;
  }
  const latencias = puntos.map((p) => Number(p[1])).filter((n) => Number.isFinite(n));
  const techo = Math.max(1, ...latencias) * 1.15;
  const paso = puntos.length > 1 ? (ancho - pad * 2) / (puntos.length - 1) : 0;
  const x = (i) => (puntos.length > 1 ? pad + i * paso : ancho / 2);
  const y = (ms) => alto - pad - (Math.min(ms, techo) / techo) * (alto - pad * 2);

  let svg = `<svg class="onda-mini" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" aria-hidden="true" focusable="false">`;
  for (const t of tramos(puntos, x, y)) {
    const linea = trazoSuave(t);
    if (t.length > 1) {
      svg += `<path class="onda-area" d="${linea} L${r1(t[t.length - 1][0])},${alto} L${r1(t[0][0])},${alto} Z"/>`;
    }
    svg += `<path class="onda-linea" d="${linea}"/>`;
    if (t.length === 1) svg += `<circle class="onda-punto" cx="${r1(t[0][0])}" cy="${r1(t[0][1])}" r="1.6"/>`;
  }
  puntos.forEach((p, i) => {
    if (p[2] !== ESTADO_OK) svg += `<circle class="onda-fallo" cx="${r1(x(i))}" cy="${alto - pad - 1}" r="2"/>`;
  });
  const ult = puntos[puntos.length - 1];
  if (ult[2] === ESTADO_OK && Number.isFinite(Number(ult[1])) && ult[1] !== null) {
    svg += `<circle class="onda-actual" cx="${r1(x(puntos.length - 1))}" cy="${r1(y(Number(ult[1])))}" r="2.4"/>`;
  }
  return `${svg}</svg>`;
}

function horaCorta(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Gráfica de onda grande: latencia (línea + área), rejilla con eje Y en ms, eje X con horas,
 * fallos como marcas rojas, y una franja inferior de disponibilidad (una celda por ejecución).
 */
export function svgOndaLatencia(puntos = [], { ancho = 640, alto = 180, titulo = 'Latencia' } = {}) {
  const izq = 44;
  const der = 10;
  const arriba = 10;
  const franja = 10;
  const ejeX = 18;
  const altoGrafica = alto - arriba - franja - ejeX - 6;
  const base = arriba + altoGrafica;
  const anchoUtil = ancho - izq - der;

  const latencias = puntos.map((p) => Number(p[1])).filter((n) => Number.isFinite(n) && n >= 0);
  const techo = techoEscala(Math.max(1, ...latencias) * 1.1);
  const n = puntos.length;
  const x = (i) => (n > 1 ? izq + (i * anchoUtil) / (n - 1) : izq + anchoUtil / 2);
  const y = (ms) => base - (Math.min(ms, techo) / techo) * altoGrafica;

  let svg = `<svg class="onda-grande" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="${esc(titulo)}">`;
  // Rejilla y eje Y
  for (let k = 0; k <= 4; k += 1) {
    const v = (techo * k) / 4;
    const yy = r1(y(v));
    svg += `<line class="onda-rejilla" x1="${izq}" y1="${yy}" x2="${ancho - der}" y2="${yy}"/>`;
    svg += `<text class="onda-eje" x="${izq - 6}" y="${r1(yy + 3)}" text-anchor="end">${techo < 10 ? r1(v) : Math.round(v)} ms</text>`;
  }
  if (!n) {
    svg += `<text class="onda-vacio" x="${izq + anchoUtil / 2}" y="${r1(arriba + altoGrafica / 2)}" text-anchor="middle">Sin ejecuciones en este periodo</text>`;
    return `${svg}</svg>`;
  }
  // Fallos: banda vertical tenue + marca en la base
  puntos.forEach((p, i) => {
    if (p[2] !== ESTADO_OK) {
      const xx = r1(x(i));
      svg += `<line class="onda-fallo-banda" x1="${xx}" y1="${arriba}" x2="${xx}" y2="${base}"/>`;
    }
  });
  for (const t of tramos(puntos, x, y)) {
    const linea = trazoSuave(t);
    if (t.length > 1) {
      svg += `<path class="onda-area" d="${linea} L${r1(t[t.length - 1][0])},${base} L${r1(t[0][0])},${base} Z"/>`;
    }
    svg += `<path class="onda-linea" d="${linea}"/>`;
  }
  // Último valor (punto vivo)
  const ult = puntos[n - 1];
  if (ult[2] === ESTADO_OK && ult[1] !== null && Number.isFinite(Number(ult[1]))) {
    svg += `<circle class="onda-actual-halo" cx="${r1(x(n - 1))}" cy="${r1(y(Number(ult[1])))}" r="6"/>`;
    svg += `<circle class="onda-actual" cx="${r1(x(n - 1))}" cy="${r1(y(Number(ult[1])))}" r="3"/>`;
  }
  // Franja de disponibilidad
  const yFranja = base + 4;
  const anchoCelda = n > 0 ? anchoUtil / n : anchoUtil;
  puntos.forEach((p, i) => {
    const clase = p[2] === ESTADO_OK ? 'disp-ok' : (p[2] === 'timeout' || p[2] === 'degraded' ? 'disp-timeout' : 'disp-fallo');
    svg += `<rect class="${clase}" x="${r1(izq + i * anchoCelda)}" y="${yFranja}" width="${r1(Math.max(1, anchoCelda - 0.6))}" height="${franja}"><title>${horaCorta(p[0])} · ${esc(p[2])}${p[1] !== null && p[1] !== undefined ? ` · ${p[1]} ms` : ''}</title></rect>`;
  });
  // Eje X: 4 marcas de hora
  const marcas = Math.min(4, n);
  for (let k = 0; k < marcas; k += 1) {
    const i = marcas === 1 ? 0 : Math.round((k * (n - 1)) / (marcas - 1));
    const anclaje = k === 0 ? 'start' : (k === marcas - 1 ? 'end' : 'middle');
    svg += `<text class="onda-eje" x="${r1(x(i))}" y="${alto - 3}" text-anchor="${anclaje}">${horaCorta(puntos[i][0])}</text>`;
  }
  return `${svg}</svg>`;
}

/**
 * Modo "Simular caída", foco de impacto y resumen ejecutivo.
 * La simulación solo hace GET /api/topology/graph?simulateDownIds=…: no escribe nada.
 */
import { h, icono } from './dom.js';
import { LIMITE_SIMULACION, textoCriticidad } from './constantesVisuales.js';

export function crearSimulador({ banda, resumen, boton, estado, recargar }) {
  let temporizador = 0;
  let expandido = false;
  let appsExpandido = false;
  const nombreDe = (id) => estado.nodoPorId.get(String(id))?.name || `#${id}`;

  banda.querySelector('[data-accion="salir-simulacion"]').addEventListener('click', () => { desactivar(); boton.focus(); });

  function activar() {
    if (estado.simulando) return;
    estado.simulando = true;
    estado.focoImpacto = true;
    banda.hidden = false;
    boton.setAttribute('aria-pressed', 'true');
    boton.classList.add('es-activo');
    estado.emitir('simulacion', true);
    estado.emitir('foco', true);
    render();
  }

  function desactivar() {
    if (!estado.simulando) return;
    estado.simulando = false;
    estado.focoImpacto = false;
    banda.hidden = true;
    boton.setAttribute('aria-pressed', 'false');
    boton.classList.remove('es-activo');
    const habia = estado.simulados.size > 0;
    estado.simulados = new Set();
    estado.emitir('simulacion', false);
    if (habia) programar(0); else { estado.emitir('foco', false); render(); }
  }

  function alternar(id) {
    const s = String(id);
    if (!estado.simulando) activar();
    if (estado.simulados.has(s)) estado.simulados.delete(s);
    else {
      if (estado.simulados.size >= LIMITE_SIMULACION) {
        window.showToast?.(`Máximo ${LIMITE_SIMULACION} servidores simulados`, 'warning');
        return;
      }
      estado.simulados.add(s);
    }
    programar(250);
  }

  function limpiar() {
    estado.simulados = new Set();
    programar(0);
  }

  function programar(ms) {
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
      await recargar([...estado.simulados]);
      const ign = estado.grafo.impact?.ignoredSimulateIds || [];
      if (ign.length) window.showToast?.(`Se ignoraron ${ign.length} servidor(es) que no existen`, 'warning');
    }, ms);
  }

  function alternarFoco() {
    estado.focoImpacto = !estado.focoImpacto;
    estado.emitir('foco', estado.focoImpacto);
    render();
  }

  /** Criticidad de la primera arista de la ruta de impacto que sale del nodo afectado */
  function criticidadSalto(n) {
    const ruta = n.impactPath || [];
    if (ruta.length < 2) return null;
    const siguiente = ruta[ruta.length - 2];
    if (String(n.hostServerId) === String(siguiente)) return 'VM en el host';
    const e = estado.grafo.edges.find((x) => String(x.source) === String(n.id) && String(x.target) === String(siguiente));
    return e ? textoCriticidad(e.criticality) : null;
  }


  // ── Indicador de impacto: pastilla compacta que se despliega al hacer clic ──
  // El estado abierto/plegado se recuerda por navegador; por defecto está plegado.
  const CLAVE_ABIERTO = 'topo.resumenAbierto';
  let abierto = false;
  try { abierto = localStorage.getItem(CLAVE_ABIERTO) === '1'; } catch { /* sin acceso */ }

  function fijarAbierto(valor) {
    abierto = valor;
    try { localStorage.setItem(CLAVE_ABIERTO, valor ? '1' : '0'); } catch { /* sin acceso */ }
    render();
    resumen.querySelector(valor ? '.topo-resumen__cerrar' : '.topo-resumen__pastilla')?.focus();
  }

  /** Separa las caídas reales (monitoreo) de las simuladas; un servidor caído de verdad cuenta como real */
  function separarCaidas(imp, raices) {
    const simulados = new Set((imp.simulatedDownIds || []).map(String));
    const reales = new Set((imp.monitoringDownIds || raices.filter((r) => !simulados.has(String(r)))).map(String));
    return {
      reales: raices.filter((r) => reales.has(String(r))),
      simuladas: raices.filter((r) => !reales.has(String(r)) && simulados.has(String(r))),
    };
  }

  function textoPastilla(imp, { reales, simuladas }) {
    const partes = [];
    if (reales.length) partes.push(`${reales.length} ${reales.length === 1 ? 'caída real' : 'caídas reales'}`);
    if (simuladas.length) partes.push(`${simuladas.length} ${simuladas.length === 1 ? 'simulada' : 'simuladas'}`);
    partes.push(`${imp.totalImpacted} ${imp.totalImpacted === 1 ? 'afectado' : 'afectados'}`);
    const apps = (imp.applications || []).length;
    if (apps) partes.push(`${apps} ${apps === 1 ? 'aplicación' : 'aplicaciones'}`);
    return partes.join(' · ');
  }

  const MOTIVOS = { CAIDO_REAL: 'caído', SIMULADO: 'simulado', DIRECTO: 'directo', CASCADA: 'en cascada' };

  /** Aplicaciones que caen, con los servidores donde corre cada una */
  function bloqueAplicaciones(imp) {
    // Primero las que caen por la simulación o la cascada; al final las que solo están caídas de verdad
    const soloReal = (a) => a.servers.every((s) => s.motivo === 'CAIDO_REAL');
    const apps = [...(imp.applications || [])].sort((a, b) => Number(soloReal(a)) - Number(soloReal(b)));
    if (!apps.length) return h('p', { class: 'topo-resumen__apps-vacio' }, 'Aplicaciones afectadas: ninguna registrada en el campo Software de estos servidores.');
    const visibles = appsExpandido ? apps : apps.slice(0, 5);
    return h('div', { class: 'topo-resumen__apps' },
      h('p', { class: 'topo-resumen__caidas-titulo' }, `Aplicaciones afectadas (${apps.length})`),
      h('ul', { class: 'topo-resumen__lista' }, visibles.map((a) => h('li', { class: 'topo-resumen__item topo-resumen__item--app' },
        h('strong', {}, a.name),
        h('span', { class: 'topo-resumen__meta' }, ` ${a.servers.map((s) => `${s.name} (${MOTIVOS[s.motivo] || s.motivo})`).join(', ')}`)))),
      apps.length > 5 ? h('button', { type: 'button', class: 'topo-enlace', onClick: () => { appsExpandido = !appsExpandido; render(); } },
        appsExpandido ? 'Ver menos' : `+${apps.length - 5} más`) : null);
  }

  /** Celda CSV segura: comillas escapadas y sin fórmulas de hoja de cálculo */
  function celdaCsv(v) {
    let t = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  }

  /** Descarga el impacto actual (servidores y aplicaciones) como CSV para Excel */
  function descargarCsv(imp, afect) {
    const filas = [['Tipo', 'Nombre', 'Motivo', 'Nivel', 'Aplicación / servidores']];
    for (const id of imp.rootIds || []) {
      const n = estado.nodoPorId.get(String(id));
      filas.push(['Servidor', nombreDe(id), (imp.simulatedDownIds || []).map(String).includes(String(id)) && !(imp.monitoringDownIds || []).map(String).includes(String(id)) ? 'Caída simulada' : 'Caída real', 0, n?.application || '']);
    }
    for (const n of afect) filas.push(['Servidor', n.name, n.cascadeStatus === 'DIRECT_IMPACT' ? 'Directo' : 'En cascada', n.impactLevel, n.application || '']);
    for (const a of imp.applications || []) filas.push(['Aplicación', a.name, '', '', a.servers.map((s) => s.name).join(', ')]);
    const csv = '﻿' + filas.map((f) => f.map(celdaCsv).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: `impacto-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function render() {
    const imp = estado.grafo.impact;
    const raices = imp?.rootIds || [];
    // Sin caídas (reales o simuladas) no se muestra nada; en simulación la banda superior ya guía
    if (!imp || !raices.length) { resumen.hidden = true; resumen.replaceChildren(); return; }
    const caidas = separarCaidas(imp, raices);
    resumen.hidden = false;
    resumen.classList.toggle('es-abierto', abierto);
    const pastilla = h('button', {
      type: 'button', class: 'topo-resumen__pastilla', 'aria-expanded': abierto ? 'true' : 'false',
      'aria-controls': 'topo-resumen-detalle', title: abierto ? 'Plegar detalle del impacto' : 'Ver detalle del impacto',
      onClick: () => fijarAbierto(!abierto),
    }, icono(estado.simulando || imp.simulatedDownIds.length ? 'rayo' : 'alerta', 14), textoPastilla(imp, caidas));
    if (!abierto) { resumen.replaceChildren(pastilla); return; }

    const afect = estado.grafo.nodes.filter((n) => n.cascadeStatus !== 'NONE').sort((a, b) => a.impactLevel - b.impactLevel || String(a.name || '').localeCompare(String(b.name || '')));
    const fuerte = (t) => h('strong', {}, t);
    // Caídas reales y simuladas por separado, cada una con su conteo
    const grupo = (clave, titulo, ids) => (ids.length
      ? h('p', { class: `topo-resumen__caidas topo-resumen__caidas--${clave}` },
        h('span', { class: 'topo-resumen__caidas-titulo' }, `${titulo} (${ids.length}): `), fuerte(ids.map(nombreDe).join(', ')))
      : null);
    const frase = h('div', { class: 'topo-resumen__texto' }, ...[
      grupo('reales', 'Caídas reales (monitoreo)', caidas.reales),
      grupo('simuladas', 'Caídas simuladas', caidas.simuladas),
      h('p', { class: 'topo-resumen__total' }, ...(imp.totalImpacted
        ? ['Afectados: ', fuerte(String(imp.totalImpacted)), ` ${imp.totalImpacted === 1 ? 'servidor' : 'servidores'} (`,
          fuerte(String(imp.directCount)), ' directos y ', fuerte(String(imp.transitiveCount)), ' en cascada).']
        : ['Ningún servidor depende de ', raices.length > 1 ? 'ellos.' : 'él.'])),
    ].filter(Boolean));
    const visibles = expandido ? afect : afect.slice(0, 6);
    const lista = afect.length ? h('ul', { class: 'topo-resumen__lista' }, visibles.map((n) => {
      const crit = criticidadSalto(n);
      return h('li', { class: `topo-resumen__item topo-resumen__item--${n.cascadeStatus === 'DIRECT_IMPACT' ? 'directo' : 'transitivo'}` },
        h('span', { class: 'topo-resumen__punto', 'aria-hidden': 'true' }), n.name,
        h('span', { class: 'topo-resumen__meta' }, ` nivel ${n.impactLevel}${crit ? ` · ${crit}` : ''}`));
    })) : null;
    const mas = afect.length > 6 ? h('button', { type: 'button', class: 'topo-enlace', onClick: () => { expandido = !expandido; render(); } }, expandido ? 'Ver menos' : `+${afect.length - 6} más`) : null;
    const cerrar = h('button', { type: 'button', class: 'topo-icon-btn topo-resumen__cerrar', 'aria-label': 'Plegar detalle del impacto', title: 'Plegar', onClick: () => fijarAbierto(false) }, icono('cerrar', 14));
    const foco = h('div', { class: 'topo-resumen__acciones' },
      afect.length ? h('button', { type: 'button', class: 'btn btn-secondary topo-btn-sm', 'aria-pressed': estado.focoImpacto ? 'true' : 'false', onClick: alternarFoco }, estado.focoImpacto ? 'Ver todo' : 'Ver solo impacto') : null,
      h('button', { type: 'button', class: 'btn btn-secondary topo-btn-sm', title: 'Servidores y aplicaciones afectados, para abrir en Excel', onClick: () => descargarCsv(imp, afect) }, 'Descargar CSV'));
    resumen.replaceChildren(
      h('div', { class: 'topo-resumen__cabecera' }, pastilla, cerrar),
      h('div', { class: 'topo-resumen__detalle', id: 'topo-resumen-detalle' }, ...[frase, lista, mas, bloqueAplicaciones(imp), foco].filter(Boolean)));
  }

  return { activar, desactivar, alternar, render, alternarFoco };
}

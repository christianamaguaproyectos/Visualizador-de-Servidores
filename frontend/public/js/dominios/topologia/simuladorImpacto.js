/**
 * Modo "Simular caída", foco de impacto y resumen ejecutivo (§6).
 * La simulación solo hace GET /api/topology/graph?simulateDownIds=…: no escribe nada.
 */
import { h, icono } from './dom.js';
import { LIMITE_SIMULACION, textoCriticidad } from './constantesVisuales.js';

export function crearSimulador({ banda, resumen, boton, estado, recargar }) {
  let temporizador = 0;
  let expandido = false;
  const nombreDe = (id) => estado.nodoPorId.get(String(id))?.name || `#${id}`;

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

  function textoPastilla(imp, raices) {
    const n = raices.length;
    const caidas = estado.simulando || imp.simulatedDownIds.length
      ? `${n} ${n === 1 ? 'caída simulada' : 'caídas simuladas'}`
      : `${n} ${n === 1 ? 'caída' : 'caídas'}`;
    return `${caidas} · ${imp.totalImpacted} ${imp.totalImpacted === 1 ? 'afectado' : 'afectados'}`;
  }

  function render() {
    const imp = estado.grafo.impact;
    const raices = imp?.rootIds || [];
    // Sin caídas (reales o simuladas) no se muestra nada; en simulación la banda superior ya guía
    if (!imp || !raices.length) { resumen.hidden = true; resumen.replaceChildren(); return; }
    resumen.hidden = false;
    resumen.classList.toggle('es-abierto', abierto);
    const pastilla = h('button', {
      type: 'button', class: 'topo-resumen__pastilla', 'aria-expanded': abierto ? 'true' : 'false',
      'aria-controls': 'topo-resumen-detalle', title: abierto ? 'Plegar detalle del impacto' : 'Ver detalle del impacto',
      onClick: () => fijarAbierto(!abierto),
    }, icono(estado.simulando || imp.simulatedDownIds.length ? 'rayo' : 'alerta', 14), textoPastilla(imp, raices));
    if (!abierto) { resumen.replaceChildren(pastilla); return; }

    const afect = estado.grafo.nodes.filter((n) => n.cascadeStatus !== 'NONE').sort((a, b) => a.impactLevel - b.impactLevel || a.name.localeCompare(b.name));
    const nombres = raices.map(nombreDe);
    const fuerte = (t) => h('strong', {}, t);
    let frase;
    if (estado.simulando || imp.simulatedDownIds.length) {
      frase = h('p', { class: 'topo-resumen__texto' }, 'Si cae ', fuerte(nombres.join(', ')), ', se ven afectados ', fuerte(String(imp.totalImpacted)),
        ' servidores: ', fuerte(String(imp.directCount)), ' directos y ', fuerte(String(imp.transitiveCount)), ' en cascada.');
    } else if (imp.totalImpacted === 0) {
      frase = h('p', { class: 'topo-resumen__texto' }, fuerte(nombres.join(', ')), raices.length > 1 ? ' están caídos; ningún servidor depende de ellos.' : ' está caído; ningún servidor depende de él.');
    } else {
      frase = h('p', { class: 'topo-resumen__texto' }, 'Caída detectada en monitoreo: ', fuerte(nombres.join(', ')), '. Afecta a ', fuerte(String(imp.totalImpacted)), ' servidores.');
    }
    const visibles = expandido ? afect : afect.slice(0, 6);
    const lista = afect.length ? h('ul', { class: 'topo-resumen__lista' }, visibles.map((n) => {
      const crit = criticidadSalto(n);
      return h('li', { class: `topo-resumen__item topo-resumen__item--${n.cascadeStatus === 'DIRECT_IMPACT' ? 'directo' : 'transitivo'}` },
        h('span', { class: 'topo-resumen__punto', 'aria-hidden': 'true' }), n.name,
        h('span', { class: 'topo-resumen__meta' }, ` nivel ${n.impactLevel}${crit ? ` · ${crit}` : ''}`));
    })) : null;
    const mas = afect.length > 6 ? h('button', { type: 'button', class: 'topo-enlace', onClick: () => { expandido = !expandido; render(); } }, expandido ? 'Ver menos' : `+${afect.length - 6} más`) : null;
    const cerrar = h('button', { type: 'button', class: 'topo-icon-btn topo-resumen__cerrar', 'aria-label': 'Plegar detalle del impacto', title: 'Plegar', onClick: () => fijarAbierto(false) }, icono('cerrar', 14));
    const foco = afect.length ? h('div', { class: 'topo-resumen__acciones' },
      h('button', { type: 'button', class: 'btn btn-secondary topo-btn-sm', 'aria-pressed': estado.focoImpacto ? 'true' : 'false', onClick: alternarFoco }, estado.focoImpacto ? 'Ver todo' : 'Ver solo impacto')) : null;
    resumen.replaceChildren(
      h('div', { class: 'topo-resumen__cabecera' }, pastilla, cerrar),
      h('div', { class: 'topo-resumen__detalle', id: 'topo-resumen-detalle' }, ...[frase, lista, mas, foco].filter(Boolean)));
  }

  return { activar, desactivar, alternar, render, alternarFoco };
}

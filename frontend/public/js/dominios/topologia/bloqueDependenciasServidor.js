/**
 * Bloque "Dependencias e impacto" del detalle de un servidor en /fisicos y /virtuales.
 * Datos: GET /api/dependencies/server/:id/impact. Todo el DOM se construye con h()
 * (nodos de texto, sin innerHTML con datos). Las acciones de escritura solo se
 * muestran a administradores; la API las rechaza igualmente al resto (403).
 */
import { h, icono } from './dom.js';
import { ESTADOS, TIPOS_DEPENDENCIA, CRITICIDADES, TIPOS_SERVIDOR, textoCriticidad, textoTipo } from './constantesVisuales.js';
import { analisisImpacto, crearDependencia, eliminarDependencia, obtenerGrafo } from './apiTopologia.js';
import { confirmAction } from '../ui-system/modalConfirm.js';

const toast = (msg, tipo = 'info') => window.showToast?.(msg, tipo);

/**
 * Monta el bloque dentro de `contenedor` para el servidor `serverId`.
 * @param {{ esAdmin: () => boolean, alCargar?: (r: { relaciones: number, afectados: number }) => void }} opciones
 */
export function montarBloqueDependencias(contenedor, serverId, { esAdmin = () => false, alCargar = null } = {}) {
  const id = String(serverId);
  let formularioAbierto = false;
  let catalogo = null;
  let datos = null;

  const seccion = h('section', { class: 'card dep-detalle', 'aria-labelledby': `dep-detalle-titulo-${id}` });
  contenedor.replaceChildren(seccion);

  async function cargar() {
    pintar({ cargando: true });
    try {
      datos = await analisisImpacto(id);
      pintar();
      const relaciones = [...datos.dependsOnDirect, ...datos.dependentsDirect].reduce((n, s) => n + (s.dependencies || []).length, 0);
      alCargar?.({ relaciones, afectados: Number(datos.totalAffected || 0) });
    } catch (err) {
      datos = null;
      pintar({ error: err?.status === 404 ? 'El servidor no existe.' : 'No se pudieron cargar las dependencias.' });
    }
  }

  function pintar({ cargando = false, error = null } = {}) {
    const admin = esAdmin();
    const acciones = h('div', { class: 'dep-detalle__acciones' },
      admin ? h('button', {
        type: 'button', class: 'dep-detalle__btn', 'aria-expanded': formularioAbierto ? 'true' : 'false',
        'aria-controls': `dep-detalle-form-${id}`, onClick: () => { formularioAbierto = !formularioAbierto; pintar(); },
      }, icono('mas', 14), 'Relacionar con otro servidor') : null,
      h('a', { class: 'dep-detalle__btn dep-detalle__btn--primario', href: `/dependencias?focus=${encodeURIComponent(id)}` }, icono('enlace', 14), 'Abrir en el mapa'));

    const cabecera = h('div', { class: 'dep-detalle__cabecera' },
      h('h3', { id: `dep-detalle-titulo-${id}`, class: 'dep-detalle__titulo', tabindex: '-1' }, '🔗 Dependencias e impacto'), acciones);

    if (cargando) { seccion.replaceChildren(cabecera, h('p', { class: 'dep-detalle__vacio' }, 'Cargando dependencias…')); return; }
    if (error) { seccion.replaceChildren(cabecera, h('p', { class: 'dep-detalle__error', role: 'alert' }, error)); return; }

    const total = Number(datos.totalAffected ?? (datos.dependentsDirect.length + datos.dependentsTransitive.length));
    const resumen = h('p', { class: `dep-detalle__resumen${total ? ' dep-detalle__resumen--alerta' : ''}` },
      total
        ? ['Si este servidor cae, se ven afectados ', h('strong', {}, String(total)), ` ${total === 1 ? 'servidor' : 'servidores'}: `,
          h('strong', {}, String(datos.dependentsDirect.length)), ' directos y ', h('strong', {}, String(datos.dependentsTransitive.length)), ' en cascada.']
        : 'Ningún servidor depende de este: su caída no afecta a otros.');

    const ciclos = (datos.cycles || []).length
      ? h('p', { class: 'dep-detalle__nota' }, 'Participa en una dependencia circular: ',
        (datos.cycles || []).map((c) => c.map(nombreDe).join(' → ')).join('; '), '.')
      : null;

    seccion.replaceChildren(...[
      cabecera,
      formularioAbierto && admin ? formulario() : null,
      resumen,
      h('div', { class: 'dep-detalle__columnas' },
        columna('Depende de', 'proveedores', datos.dependsOnDirect, 'target', admin, 'No depende de otros servidores.'),
        columna('Dependen de él', 'dependientes', datos.dependentsDirect, 'source', admin, 'Ningún servidor depende de este.')),
      cascada(),
      ciclos,
    ].filter(Boolean));
  }

  function nombreDe(sid) {
    if (String(sid) === id) return datos?.server?.name || `#${sid}`;
    const todos = [...(datos?.dependsOnDirect || []), ...(datos?.dependsOnTransitive || []), ...(datos?.dependentsDirect || []), ...(datos?.dependentsTransitive || [])];
    return todos.find((s) => String(s.id) === String(sid))?.name || `#${sid}`;
  }

  function insignia(estado) {
    const e = ESTADOS[estado] || ESTADOS.UNKNOWN;
    return h('span', { class: `dep-detalle__estado dep-detalle__estado--${(estado || 'UNKNOWN').toLowerCase()}`, title: e.descripcion }, e.texto);
  }

  /** Una fila por relación concreta (un mismo par puede tener varios tipos) */
  function columna(titulo, clave, servidores, extremo, admin, vacio) {
    const filas = [];
    for (const s of servidores) {
      for (const d of s.dependencies || []) {
        filas.push(h('li', { class: 'dep-detalle__fila' },
          insignia(s.status),
          h('span', { class: 'dep-detalle__nombre' }, s.name),
          h('span', { class: 'dep-detalle__tipo' }, `${(TIPOS_SERVIDOR[s.type] || {}).badge || ''}`),
          h('span', { class: 'dep-detalle__meta' }, `${textoTipo(d.dependencyType)} · ${textoCriticidad(d.criticality)}${d.port ? ` · ${d.protocol || ''}:${d.port}` : ''}`),
          admin ? h('button', {
            type: 'button', class: 'dep-detalle__quitar', 'aria-label': `Eliminar relación con ${s.name}`, title: 'Eliminar relación',
            onClick: () => quitar(d, extremo),
          }, icono('papelera', 14)) : null));
      }
    }
    return h('div', { class: 'dep-detalle__columna', dataset: { lista: clave } },
      h('h4', { class: 'dep-detalle__subtitulo' }, `${titulo} (${servidores.length})`),
      filas.length ? h('ul', { class: 'dep-detalle__lista' }, filas) : h('p', { class: 'dep-detalle__vacio' }, vacio));
  }

  function cascada() {
    const t = datos.dependentsTransitive || [];
    if (!t.length) return null;
    return h('p', { class: 'dep-detalle__nota' }, 'Afectados en cascada: ',
      t.map((s, i) => [i ? ', ' : '', h('strong', {}, s.name), ` (nivel ${s.depth})`]), '.');
  }

  async function quitar(d, extremo) {
    const otro = extremo === 'target' ? d.targetName : d.sourceName;
    const ok = await confirmAction({
      title: 'Eliminar relación',
      message: `¿Eliminar la dependencia ${d.sourceName} → ${d.targetName} (${textoTipo(d.dependencyType)})?`,
      confirmText: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await eliminarDependencia(d.id);
      toast(`Relación con ${otro} eliminada`, 'success');
      await cargar();
    } catch (err) {
      toast(err?.status === 403 ? 'No tienes permisos para eliminar relaciones' : (err?.message || 'No se pudo eliminar'), 'error');
    }
  }

  // ── Formulario compacto (en línea, sin ventana emergente) ────────────────
  function formulario() {
    const idf = `dep-detalle-form-${id}`;
    const selServidor = h('select', { id: `${idf}-servidor`, name: 'servidor', required: true }, h('option', { value: '' }, 'Cargando servidores…'));
    const selDireccion = h('select', { id: `${idf}-direccion`, name: 'direccion' },
      h('option', { value: 'depende' }, 'Este servidor depende de…'),
      h('option', { value: 'dependiente' }, '…depende de este servidor'));
    const selTipo = h('select', { id: `${idf}-tipo`, name: 'tipo' },
      Object.entries(TIPOS_DEPENDENCIA).map(([k, v]) => h('option', { value: k, selected: k === 'SERVICE' }, v.largo)));
    const selCrit = h('select', { id: `${idf}-criticidad`, name: 'criticidad' },
      Object.entries(CRITICIDADES).map(([k, v]) => h('option', { value: k, selected: k === 'HIGH' }, v.texto)));
    const error = h('p', { class: 'dep-detalle__error', role: 'alert', hidden: true });
    const campo = (etiqueta, control) => h('div', { class: 'dep-detalle__campo' }, h('label', { for: control.id }, etiqueta), control);

    const cerrar = () => { formularioAbierto = false; pintar(); seccion.querySelector('.dep-detalle__acciones button')?.focus(); };
    const form = h('form', {
      id: idf, class: 'dep-detalle__form', novalidate: true,
      onKeydown: (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); cerrar(); } },
      onSubmit: async (ev) => {
        ev.preventDefault();
        if (!selServidor.value) { error.textContent = 'Elige un servidor.'; error.hidden = false; selServidor.focus(); return; }
        const depende = selDireccion.value === 'depende';
        const boton = form.querySelector('[type="submit"]');
        boton.disabled = true;
        try {
          await crearDependencia({
            sourceServerId: depende ? id : selServidor.value,
            targetServerId: depende ? selServidor.value : id,
            dependencyType: selTipo.value,
            criticality: selCrit.value,
          });
          toast('Relación creada', 'success');
          formularioAbierto = false;
          await cargar();
        } catch (err) {
          error.textContent = err?.status === 409 ? 'Esa relación ya existe.' : (err?.message || 'No se pudo crear la relación.');
          error.hidden = false;
          boton.disabled = false;
        }
      },
    },
    h('div', { class: 'dep-detalle__form-cabecera' },
      h('span', { class: 'dep-detalle__form-titulo' }, 'Nueva relación'),
      h('button', { type: 'button', class: 'dep-detalle__cerrar', 'aria-label': 'Cerrar formulario', title: 'Cerrar (Esc)', onClick: cerrar }, icono('cerrar', 14))),
    h('div', { class: 'dep-detalle__form-campos' },
      campo('Dirección', selDireccion), campo('Servidor', selServidor), campo('Tipo', selTipo), campo('Criticidad', selCrit),
      h('button', { type: 'submit', class: 'dep-detalle__btn dep-detalle__btn--primario' }, 'Guardar')),
    error);

    cargarCatalogo().then((lista) => {
      selServidor.replaceChildren(h('option', { value: '' }, 'Elige un servidor…'),
        ...lista.filter((s) => s.id !== id).map((s) => h('option', { value: s.id }, `${s.name}${s.ip ? ` · ${s.ip}` : ''} (${(TIPOS_SERVIDOR[s.type] || {}).texto || s.type})`)));
      selServidor.focus();
    }).catch(() => { selServidor.replaceChildren(h('option', { value: '' }, 'No se pudo cargar la lista')); });
    return form;
  }

  async function cargarCatalogo() {
    if (catalogo) return catalogo;
    const g = await obtenerGrafo({ includeIsolated: true });
    catalogo = g.nodes.map((n) => ({ id: String(n.id), name: n.name, ip: n.ip, type: n.type }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return catalogo;
  }

  cargar();
  return { recargar: cargar };
}

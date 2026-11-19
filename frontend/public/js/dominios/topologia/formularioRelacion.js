/**
 * Formulario rápido de crear / editar relación (§8): modal accesible con foco
 * atrapado, combobox buscable de origen y destino, invertir y relación mutua.
 */
import { h, atraparFoco } from './dom.js';
import { TIPOS_DEPENDENCIA, CRITICIDADES } from './constantesVisuales.js';
import { crearDependencia, editarDependencia } from './apiTopologia.js';

export function crearFormularioRelacion({ raiz, obtenerCatalogo, alGuardar }) {
  const form = raiz.querySelector('form');
  const tituloEl = raiz.querySelector('.topo-modal__titulo');
  const errorGeneral = raiz.querySelector('.topo-form__error-general');
  const campos = {
    tipo: form.elements.dependencyType,
    criticidad: form.elements.criticality,
    puerto: form.elements.port,
    protocolo: form.elements.protocol,
    etiqueta: form.elements.label,
    notas: form.elements.notes,
    mutua: form.elements.bidirectional,
  };
  // Opciones de tipo y criticidad desde las constantes
  campos.tipo.replaceChildren(...Object.entries(TIPOS_DEPENDENCIA).map(([k, v]) => h('option', { value: k }, `${v.largo} (${k})`)));
  campos.criticidad.replaceChildren(...Object.entries(CRITICIDADES).map(([k, v]) => h('option', { value: k }, v.texto)));

  const combos = {
    origen: crearCombobox(raiz.querySelector('[data-combo="origen"]')),
    destino: crearCombobox(raiz.querySelector('[data-combo="destino"]')),
  };
  let aristaEditada = null;
  let liberarFoco = null;
  let focoPrevio = null;

  raiz.querySelector('[data-accion="invertir"]').addEventListener('click', () => {
    const o = combos.origen.valor(); const d = combos.destino.valor();
    combos.origen.fijar(d); combos.destino.fijar(o);
  });
  raiz.querySelectorAll('[data-accion="cancelar"]').forEach((b) => b.addEventListener('click', cerrar));
  raiz.addEventListener('click', (ev) => { if (ev.target === raiz) cerrar(); });
  raiz.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); cerrar(); } });

  function crearCombobox(contenedor) {
    const input = contenedor.querySelector('input');
    const lista = contenedor.querySelector('[role="listbox"]');
    const error = contenedor.querySelector('.topo-form__error');
    let seleccionado = null;
    let activo = -1;
    let opciones = [];

    function pintar() {
      const q = input.value.trim().toLowerCase();
      opciones = obtenerCatalogo().filter((s) => !q || `${s.name} ${s.ip || ''} ${s.hostname || ''}`.toLowerCase().includes(q)).slice(0, 30);
      activo = Math.min(activo, opciones.length - 1);
      lista.replaceChildren(...opciones.map((s, i) => h('li', {
        role: 'option', id: `${lista.id}-op-${i}`, class: `topo-combo__op${i === activo ? ' es-activa' : ''}`, 'aria-selected': i === activo ? 'true' : 'false',
        onMousedown: (ev) => { ev.preventDefault(); elegir(s); },
      }, h('span', { class: 'topo-combo__nombre' }, s.name), h('span', { class: 'topo-combo__ip' }, s.ip || ''))));
      if (!opciones.length) lista.append(h('li', { class: 'topo-combo__vacio' }, 'Sin coincidencias'));
      input.setAttribute('aria-activedescendant', activo >= 0 ? `${lista.id}-op-${activo}` : '');
    }
    function abrir() { lista.hidden = false; input.setAttribute('aria-expanded', 'true'); pintar(); }
    function cerrarLista() { lista.hidden = true; input.setAttribute('aria-expanded', 'false'); }
    function elegir(s) {
      seleccionado = s ? String(s.id) : null;
      input.value = s ? s.name : '';
      error.textContent = '';
      cerrarLista();
    }
    input.addEventListener('focus', abrir);
    input.addEventListener('input', () => { seleccionado = null; activo = 0; abrir(); });
    input.addEventListener('blur', () => {
      cerrarLista();
      if (!seleccionado) {
        const exacto = obtenerCatalogo().find((s) => s.name.toLowerCase() === input.value.trim().toLowerCase());
        if (exacto) elegir(exacto);
      }
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (lista.hidden) abrir(); activo = Math.min(opciones.length - 1, activo + 1); pintar(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); activo = Math.max(0, activo - 1); pintar(); }
      else if (ev.key === 'Enter' && !lista.hidden && opciones[activo]) { ev.preventDefault(); elegir(opciones[activo]); }
      else if (ev.key === 'Escape' && !lista.hidden) { ev.stopPropagation(); cerrarLista(); }
    });
    return {
      valor: () => seleccionado,
      fijar(id) {
        const s = id ? obtenerCatalogo().find((x) => String(x.id) === String(id)) : null;
        seleccionado = s ? String(s.id) : null;
        input.value = s ? s.name : '';
      },
      error: (t) => { error.textContent = t || ''; },
      habilitar: (v) => { input.disabled = !v; },
      input,
    };
  }

  function limpiarErrores() {
    errorGeneral.textContent = '';
    errorGeneral.hidden = true;
    raiz.querySelectorAll('.topo-form__error').forEach((e) => { e.textContent = ''; });
  }

  function errorCampo(nombre, texto) {
    const e = raiz.querySelector(`[data-error="${nombre}"]`);
    if (e) e.textContent = texto;
  }

  /** @param {{origen?, destino?, arista?}} opciones */
  function abrir({ origen = null, destino = null, arista = null } = {}) {
    aristaEditada = arista;
    limpiarErrores();
    form.reset();
    tituloEl.textContent = arista ? 'Editar relación' : 'Nueva relación';
    combos.origen.fijar(arista ? arista.source : origen);
    combos.destino.fijar(arista ? arista.target : destino);
    combos.origen.habilitar(!arista); combos.destino.habilitar(!arista);
    raiz.querySelector('[data-accion="invertir"]').disabled = Boolean(arista);
    campos.mutua.closest('.topo-form__check').hidden = Boolean(arista);
    campos.tipo.value = arista?.dependencyType || 'SERVICE';
    campos.criticidad.value = arista?.criticality || 'CRITICAL';
    campos.puerto.value = arista?.port ?? '';
    campos.protocolo.value = arista?.protocol ?? '';
    campos.etiqueta.value = arista?.label ?? '';
    campos.notas.value = arista?.notes ?? '';
    focoPrevio = document.activeElement;
    raiz.hidden = false;
    liberarFoco = atraparFoco(raiz);
    const primero = !arista && !combos.origen.valor() ? combos.origen.input : !arista && !combos.destino.valor() ? combos.destino.input : campos.tipo;
    setTimeout(() => primero.focus(), 0);
  }

  function cerrar() {
    if (raiz.hidden) return;
    raiz.hidden = true;
    if (liberarFoco) liberarFoco();
    if (focoPrevio && document.body.contains(focoPrevio)) focoPrevio.focus();
  }

  function validar() {
    let ok = true;
    const o = combos.origen.valor(); const d = combos.destino.valor();
    if (!aristaEditada) {
      if (!o) { combos.origen.error('Elige el servidor que depende.'); ok = false; }
      if (!d) { combos.destino.error('Elige el servidor proveedor.'); ok = false; }
      if (o && d && o === d) { combos.destino.error('Un servidor no puede depender de sí mismo.'); ok = false; }
    }
    const puerto = campos.puerto.value.trim();
    if (puerto && (!/^\d+$/.test(puerto) || Number(puerto) < 1 || Number(puerto) > 65535)) { errorCampo('port', 'Puerto entre 1 y 65535.'); ok = false; }
    const proto = campos.protocolo.value.trim();
    if (proto && !/^[A-Za-z0-9._+-]{1,20}$/.test(proto)) { errorCampo('protocol', 'Solo letras, números y . _ + - (máx. 20).'); ok = false; }
    if (campos.etiqueta.value.length > 120) { errorCampo('label', 'Máximo 120 caracteres.'); ok = false; }
    if (campos.notas.value.length > 2000) { errorCampo('notes', 'Máximo 2000 caracteres.'); ok = false; }
    return ok;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limpiarErrores();
    if (!validar()) return;
    const datos = {
      dependencyType: campos.tipo.value,
      criticality: campos.criticidad.value,
      port: campos.puerto.value.trim() ? Number(campos.puerto.value) : null,
      protocol: campos.protocolo.value.trim() || null,
      label: campos.etiqueta.value.trim() || null,
      notes: campos.notas.value.trim() || null,
    };
    const boton = form.querySelector('[type="submit"]');
    boton.disabled = true;
    try {
      let res;
      if (aristaEditada) res = await editarDependencia(aristaEditada.id, datos);
      else {
        res = await crearDependencia({
          ...datos, sourceServerId: combos.origen.valor(), targetServerId: combos.destino.valor(), bidirectional: campos.mutua.checked,
        });
      }
      cerrar();
      alGuardar(res, Boolean(aristaEditada));
    } catch (err) {
      errorGeneral.textContent = err?.message || 'No se pudo guardar la relación.';
      errorGeneral.hidden = false;
    } finally {
      boton.disabled = false;
    }
  });

  return { abrir, cerrar, estaAbierto: () => !raiz.hidden };
}

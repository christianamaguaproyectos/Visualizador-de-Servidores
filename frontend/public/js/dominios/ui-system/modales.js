/**
 * Comportamiento común de las ventanas emergentes de la plataforma (marcado .modal-overlay o
 * .modal con .modal-content dentro):
 *  - toda ventana tiene un botón × (aria-label "Cerrar"); si el marcado no lo trae se añade
 *    uno que pulsa el botón de cancelar de la propia ventana;
 *  - Esc cierra la ventana superior (pulsando su ×, así se reutiliza la lógica de cierre de
 *    cada página);
 *  - el foco queda atrapado dentro de la ventana mientras está abierta y vuelve al control
 *    que la abrió al cerrarse.
 * Script clásico, sin dependencias. No toca las confirmaciones de modalConfirm.js, que
 * gestionan su propio teclado.
 */
(function () {
  'use strict';

  const SEL_VENTANA = '.modal-overlay, .modal';
  const SEL_ENFOCABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const observadas = new WeakSet();
  const abiertas = new Map(); // ventana -> elemento con foco antes de abrir

  function visible(el) {
    if (!el || !el.isConnected || el.hidden) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
  }

  function botonCancelar(ventana) {
    return ventana.querySelector('[data-modal-cancelar]') ||
      ventana.querySelector('.modal-actions .btn-cancel, .modal-actions .btn-secondary, .modal-actions [type="button"]');
  }

  function botonCerrar(ventana) {
    return ventana.querySelector('.modal-close, .ui-cerrar');
  }

  /** Normaliza o crea el botón × de la ventana */
  function prepararCierre(ventana) {
    if (ventana.dataset.uiModal === 'listo') return;
    const contenido = ventana.querySelector('.modal-content') || ventana;
    let cerrar = botonCerrar(ventana);
    if (cerrar) {
      cerrar.setAttribute('aria-label', 'Cerrar');
      cerrar.title = 'Cerrar (Esc)';
      cerrar.textContent = '×';
      if (!cerrar.getAttribute('type')) cerrar.setAttribute('type', 'button');
    } else {
      const cancelar = botonCancelar(ventana);
      if (cancelar) {
        cerrar = document.createElement('button');
        cerrar.type = 'button';
        cerrar.className = 'ui-cerrar ui-cerrar--flotante';
        cerrar.setAttribute('aria-label', 'Cerrar');
        cerrar.title = 'Cerrar (Esc)';
        cerrar.textContent = '×';
        cerrar.addEventListener('click', () => cancelar.click());
        contenido.appendChild(cerrar);
      }
    }
    ventana.dataset.uiModal = 'listo';
  }

  function enfocables(ventana) {
    return [...ventana.querySelectorAll(SEL_ENFOCABLE)].filter((el) => el.getClientRects().length > 0);
  }

  function alCambiar(ventana) {
    const abierta = visible(ventana);
    if (abierta && !abiertas.has(ventana)) {
      prepararCierre(ventana);
      abiertas.set(ventana, document.activeElement);
      requestAnimationFrame(() => {
        if (ventana.contains(document.activeElement)) return;
        const campos = enfocables(ventana);
        const primero = campos.find((el) => el.matches('input, select, textarea')) || botonCerrar(ventana) || campos[0];
        primero?.focus({ preventScroll: true });
      });
    } else if (!abierta && abiertas.has(ventana)) {
      const previo = abiertas.get(ventana);
      abiertas.delete(ventana);
      if (previo && previo.isConnected && typeof previo.focus === 'function') previo.focus({ preventScroll: true });
    }
  }

  function observar(ventana) {
    if (observadas.has(ventana)) return;
    observadas.add(ventana);
    prepararCierre(ventana);
    new MutationObserver(() => alCambiar(ventana)).observe(ventana, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    alCambiar(ventana);
  }

  function ventanaSuperior() {
    const lista = [...document.querySelectorAll(SEL_VENTANA)].filter(visible);
    if (!lista.length) return null;
    return lista.find((v) => v.contains(document.activeElement)) || lista[lista.length - 1];
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' && ev.key !== 'Tab') return;
    if (document.querySelector('.ui-confirm-overlay')) return; // la confirmación gestiona su teclado
    const ventana = ventanaSuperior();
    if (!ventana) return;
    if (ev.key === 'Escape') {
      const cerrar = botonCerrar(ventana) || botonCancelar(ventana);
      if (cerrar) { ev.preventDefault(); cerrar.click(); }
      return;
    }
    const campos = enfocables(ventana);
    if (!campos.length) return;
    const primero = campos[0];
    const ultimo = campos[campos.length - 1];
    if (!ventana.contains(document.activeElement)) { ev.preventDefault(); primero.focus(); }
    else if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus(); }
    else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
  });

  function iniciar() {
    document.querySelectorAll(SEL_VENTANA).forEach(observar);
    // Ventanas creadas después por las páginas (se añaden al body)
    new MutationObserver((registros) => {
      for (const r of registros) {
        for (const n of r.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches(SEL_VENTANA)) observar(n);
          n.querySelectorAll?.(SEL_VENTANA).forEach(observar);
        }
      }
    }).observe(document.body, { childList: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();

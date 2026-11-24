/**
 * Ventanas del sistema que sustituyen a prompt() nativo, con el mismo aspecto que
 * confirmAction (modalConfirm.js): Esc o × cancelan, Enter acepta, el foco vuelve al
 * control que la abrió. Todo el texto se asigna con textContent/value (sin HTML).
 */

function crearVentana(titulo, mensaje) {
  const overlay = document.createElement('div');
  overlay.className = 'ui-confirm-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'ui-confirm-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const idTitulo = `ui-texto-titulo-${Date.now()}`;
  dialog.setAttribute('aria-labelledby', idTitulo);
  dialog.innerHTML = `
    <div class="ui-confirm-header">
      <h3 class="ui-confirm-title" id="${idTitulo}"></h3>
      <button type="button" class="ui-confirm-close" data-accion="cerrar" aria-label="Cerrar" title="Cerrar">&times;</button>
    </div>
    <form class="ui-confirm-body ui-texto-form" novalidate>
      <p class="ui-confirm-message"></p>
      <input class="ui-texto-campo" autocomplete="off">
      <p class="ui-texto-error" role="alert" hidden></p>
      <div class="ui-confirm-actions">
        <button type="button" class="btn btn-secondary" data-accion="cancelar"></button>
        <button type="submit" class="btn btn-primary" data-accion="aceptar"></button>
      </div>
    </form>`;
  dialog.querySelector('.ui-confirm-title').textContent = titulo;
  const msg = dialog.querySelector('.ui-confirm-message');
  if (mensaje) msg.textContent = mensaje; else msg.remove();
  overlay.appendChild(dialog);
  return { overlay, dialog };
}

function abrir({ titulo, mensaje, etiqueta, valor = '', soloLectura = false, textoAceptar, textoCancelar, tipo = 'text', requerido = true, maxLength = 200 }) {
  return new Promise((resolve) => {
    const previo = document.activeElement;
    const { overlay, dialog } = crearVentana(titulo, mensaje);
    const campo = dialog.querySelector('.ui-texto-campo');
    const error = dialog.querySelector('.ui-texto-error');
    campo.type = tipo;
    campo.value = valor;
    campo.readOnly = soloLectura;
    campo.maxLength = maxLength;
    campo.setAttribute('aria-label', etiqueta || titulo);
    const btnAceptar = dialog.querySelector('[data-accion="aceptar"]');
    const btnCancelar = dialog.querySelector('[data-accion="cancelar"]');
    btnAceptar.textContent = textoAceptar;
    if (textoCancelar) btnCancelar.textContent = textoCancelar; else btnCancelar.remove();
    document.body.appendChild(overlay);

    const terminar = (v) => {
      document.removeEventListener('keydown', alTeclado, true);
      overlay.remove();
      if (previo && typeof previo.focus === 'function') previo.focus();
      resolve(v);
    };
    const alTeclado = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); terminar(null); }
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) terminar(null); });
    dialog.querySelector('[data-accion="cerrar"]').addEventListener('click', () => terminar(null));
    btnCancelar.addEventListener('click', () => terminar(null));
    dialog.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (soloLectura) {
        try {
          await navigator.clipboard.writeText(campo.value);
          btnAceptar.textContent = 'Copiado ✓';
          setTimeout(() => terminar(campo.value), 600);
        } catch {
          campo.select();
          error.textContent = 'No se pudo copiar automáticamente: el texto quedó seleccionado, use Ctrl+C.';
          error.hidden = false;
        }
        return;
      }
      const v = campo.value.trim();
      if (requerido && !v) {
        error.textContent = 'Este campo es obligatorio.';
        error.hidden = false;
        campo.focus();
        return;
      }
      terminar(v);
    });
    document.addEventListener('keydown', alTeclado, true);
    campo.focus();
    if (soloLectura) campo.select();
  });
}

/** Sustituto de prompt(): devuelve el texto escrito (recortado) o null si se cancela */
export function pedirTexto({ titulo, mensaje = '', etiqueta = '', valor = '', textoAceptar = 'Aceptar', textoCancelar = 'Cancelar', tipo = 'text', maxLength = 200 } = {}) {
  return abrir({ titulo, mensaje, etiqueta, valor, textoAceptar, textoCancelar, tipo, maxLength });
}

/** Muestra un valor para copiar (p. ej. un enlace) con botón "Copiar" */
export function mostrarParaCopiar({ titulo, mensaje = '', valor = '', textoAceptar = 'Copiar', textoCancelar = 'Cerrar' } = {}) {
  return abrir({ titulo, mensaje, valor, soloLectura: true, textoAceptar, textoCancelar, requerido: false, maxLength: 4000 });
}

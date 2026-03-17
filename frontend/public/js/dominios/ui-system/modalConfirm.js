export async function confirmAction({
  title = 'Confirmar accion',
  message = 'Esta accion requiere confirmacion.',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  tone = 'danger'
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ui-confirm-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'ui-confirm-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const titleId = `ui-confirm-title-${Date.now()}`;
    dialog.setAttribute('aria-labelledby', titleId);

    dialog.innerHTML = `
      <div class="ui-confirm-header">
        <h3 id="${titleId}" class="ui-confirm-title"></h3>
      </div>
      <div class="ui-confirm-body">
        <p class="ui-confirm-message"></p>
      </div>
      <div class="ui-confirm-actions">
        <button type="button" class="btn btn-secondary" data-action="cancel"></button>
        <button type="button" class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}" data-action="confirm"></button>
      </div>
    `;

    dialog.querySelector('.ui-confirm-title').textContent = title;
    dialog.querySelector('.ui-confirm-message').textContent = message;
    dialog.querySelector('[data-action="cancel"]').textContent = cancelText;
    dialog.querySelector('[data-action="confirm"]').textContent = confirmText;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const cleanup = (value) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(value);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') cleanup(true);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(false));
    dialog.querySelector('[data-action="confirm"]').addEventListener('click', () => cleanup(true));

    document.addEventListener('keydown', onKeyDown);
    dialog.querySelector('[data-action="cancel"]').focus();
  });
}

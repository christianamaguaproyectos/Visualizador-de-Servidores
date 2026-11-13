/**
 * Toast Notification System
 * Replaces native alert() with styled, non-blocking toast notifications.
 * Usage:
 *   showToast('Mensaje', 'success')  // Types: success, error, warning, info
 *   showToast('Error msg', 'error')
 */
(function () {
    'use strict';

    // Hoja de estilos externa (la CSP estricta bloquea los <style> creados por JS)
    if (!document.querySelector('link[data-toast-css]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/css/toast.css';
        link.dataset.toastCss = '';
        document.head.appendChild(link);
    }

    // Create container
    let container;
    function getContainer() {
        if (!container || !document.body.contains(container)) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    const ICONS = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
    };

    /** Tipos permitidos (lista blanca): cualquier otro valor se trata como 'info' */
    const TIPOS_VALIDOS = ['success', 'error', 'warning', 'info'];

    function showToast(message, type = 'info', duration = 4000) {
        const c = getContainer();

        // Compatibilidad: algunas llamadas antiguas pasaban la duración como 2.º argumento
        if (typeof type === 'number') {
            duration = type;
            type = 'info';
        }
        const tipo = TIPOS_VALIDOS.includes(type) ? type : 'info';
        const duracion = Number.isFinite(Number(duration)) ? Number(duration) : 4000;

        const toast = document.createElement('div');
        toast.className = `toast toast--${tipo}`;
        // Solo los íconos (fijos, nuestros) van como HTML
        toast.innerHTML = `
      <span class="toast__icon">${ICONS[tipo]}</span>
      <span class="toast__message"></span>
      <button class="toast__close" aria-label="Cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
        // El mensaje SIEMPRE como texto: nombres de servidores o errores de la API
        // nunca se interpretan como HTML (anti-XSS)
        toast.querySelector('.toast__message').textContent = String(message ?? '');

        const close = toast.querySelector('.toast__close');
        close.addEventListener('click', () => removeToast(toast));

        c.appendChild(toast);

        if (duracion > 0) {
            setTimeout(() => removeToast(toast), duracion);
        }

        return toast;
    }

    function removeToast(toast) {
        if (!toast || toast.classList.contains('removing')) return;
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }

    // Expose globally
    window.showToast = showToast;
})();

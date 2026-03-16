/**
 * Toast Notification System
 * Replaces native alert() with styled, non-blocking toast notifications.
 * Usage:
 *   showToast('Mensaje', 'success')  // Types: success, error, warning, info
 *   showToast('Error msg', 'error')
 */
(function () {
    'use strict';

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = `
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      border-radius: 12px;
      font-family: 'Inter', 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 500;
      color: #fff;
      min-width: 280px;
      max-width: 420px;
      box-shadow: 0 8px 32px rgba(15, 23, 42, 0.25);
      pointer-events: auto;
      animation: toastSlideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      transition: all 0.3s ease;
    }

    .toast.removing {
      animation: toastSlideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }

    .toast--success {
      background: linear-gradient(135deg, #059669, #10b981);
    }

    .toast--error {
      background: linear-gradient(135deg, #dc2626, #ef4444);
    }

    .toast--warning {
      background: linear-gradient(135deg, #d97706, #f59e0b);
    }

    .toast--info {
      background: linear-gradient(135deg, #2563eb, #3b82f6);
    }

    .toast__icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
    }

    .toast__message {
      flex: 1;
      line-height: 1.4;
    }

    .toast__close {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s;
    }

    .toast__close:hover {
      color: #fff;
    }

    @keyframes toastSlideIn {
      from {
        opacity: 0;
        transform: translateX(100px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
    }

    @keyframes toastSlideOut {
      from {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
      to {
        opacity: 0;
        transform: translateX(100px) scale(0.95);
      }
    }
  `;
    document.head.appendChild(style);

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

    function showToast(message, type = 'info', duration = 4000) {
        const c = getContainer();

        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `
      <span class="toast__icon">${ICONS[type] || ICONS.info}</span>
      <span class="toast__message">${message}</span>
      <button class="toast__close" aria-label="Cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

        const close = toast.querySelector('.toast__close');
        close.addEventListener('click', () => removeToast(toast));

        c.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => removeToast(toast), duration);
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

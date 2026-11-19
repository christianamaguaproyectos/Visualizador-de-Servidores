/**
 * Arranque de /dependencias: espera al DOM y llama a iniciarPaginaDependencias().
 */
import { iniciarPaginaDependencias } from '../dominios/topologia/paginaDependencias.js';

function arrancar() {
  iniciarPaginaDependencias().catch((err) => {
    console.error('[dependencias] Error al iniciar la página:', err);
    window.showToast?.('No se pudo iniciar el mapa de dependencias', 'error');
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
else arrancar();

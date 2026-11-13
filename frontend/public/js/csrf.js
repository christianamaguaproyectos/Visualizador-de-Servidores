/**
 * Protección CSRF del lado del navegador.
 *
 * Envuelve window.fetch para que TODA petición al mismo sitio que modifica datos
 * (POST, PUT, PATCH, DELETE) incluya automáticamente la cabecera X-CSRF-Token.
 * El token se obtiene una vez de GET /api/auth/csrf y se reutiliza.
 *
 * Debe cargarse ANTES que cualquier otro script que use fetch.
 */
(function () {
  if (window.__csrfFetchInstalado) return;
  window.__csrfFetchInstalado = true;

  const fetchOriginal = window.fetch.bind(window);
  const METODOS_QUE_MODIFICAN = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  let promesaToken = null;

  function obtenerToken(forzar) {
    if (!promesaToken || forzar) {
      promesaToken = fetchOriginal('/api/auth/csrf', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      })
        .then((res) => (res.ok ? res.json() : {}))
        .then((data) => data.csrfToken || null)
        .catch(() => null);
    }
    return promesaToken;
  }

  function esMismoSitio(url) {
    try {
      return new URL(url, window.location.href).origin === window.location.origin;
    } catch {
      return false;
    }
  }

  window.fetch = async function (input, init) {
    const opciones = init || {};
    const esRequest = typeof Request !== 'undefined' && input instanceof Request;
    const metodo = String(opciones.method || (esRequest ? input.method : 'GET')).toUpperCase();
    const url = esRequest ? input.url : String(input);

    if (!METODOS_QUE_MODIFICAN.has(metodo) || !esMismoSitio(url)) {
      return fetchOriginal(input, init);
    }

    const enviar = async (forzarToken) => {
      const token = await obtenerToken(forzarToken);
      const headers = new Headers(opciones.headers || (esRequest ? input.headers : undefined));
      if (token) headers.set('X-CSRF-Token', token);
      return fetchOriginal(input, { ...opciones, headers });
    };

    let respuesta = await enviar(false);

    // Si el token expiró (p. ej. nueva sesión), pedir uno nuevo y reintentar una vez
    if (respuesta.status === 403) {
      const datos = await respuesta.clone().json().catch(() => null);
      if (datos && datos.code === 'CSRF_INVALID') {
        respuesta = await enviar(true);
      }
    }

    return respuesta;
  };
})();

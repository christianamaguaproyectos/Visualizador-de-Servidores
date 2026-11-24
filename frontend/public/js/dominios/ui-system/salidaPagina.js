/**
 * Peticiones cortadas porque el usuario sale de la página: el navegador las aborta y fetch
 * lanza TypeError ("Failed to fetch") o AbortError. No son errores que haya que mostrar.
 */
let saliendo = false;
window.addEventListener('pagehide', () => { saliendo = true; });
window.addEventListener('beforeunload', () => { saliendo = true; });

/** true si el error se debe a que la página se está cerrando o a una cancelación */
export function esCancelacionPorSalida(error) {
  return error?.name === 'AbortError' || (saliendo && error instanceof TypeError);
}

/**
 * Respuesta 500 genérica: el detalle del error queda en el log del servidor,
 * pero NO se envía al cliente (antes se devolvía err.message crudo de PostgreSQL,
 * que revela nombres de tablas, columnas y consultas).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {import('express').Response}
 */
export function responderErrorInterno(req, res) {
  return res.status(500).json({
    error: 'Error interno del servidor',
    code: 'INTERNAL_ERROR',
    requestId: req.requestId || null,
  });
}

export default responderErrorInterno;

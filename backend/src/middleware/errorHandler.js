/**
 * Middleware centralizado de manejo de errores
 * Captura todos los errores que llegan via next(error) en los controladores.
 */

import Logger from '../utils/logger.js';

/**
 * Clase base para errores de aplicación
 */
export class AppError extends Error {
  /**
   * @param {string} message - Mensaje del error
   * @param {number} statusCode - Código HTTP
   * @param {string} [code] - Código interno del error
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(entity = 'Recurso', id = '') {
    super(`${entity}${id ? ` con ID ${id}` : ''} no encontrado`, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Datos de entrada inválidos') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'El recurso ya existe') {
    super(message, 409, 'CONFLICT');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No tienes permisos para esta acción') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Middleware de manejo de errores para Express
 * Se registra DESPUÉS de todas las rutas.
 */
export function errorHandler(err, req, res, _next) {
  // Error de Prisma: violación de unicidad
  if (err.code === 'P2002') {
    const field = err.meta?.target?.join(', ') || 'campo desconocido';
    Logger.warn(`Conflicto de unicidad en ${field}: ${err.message}`);
    return res.status(409).json({
      error: `Ya existe un registro con ese valor en: ${field}`,
      code: 'CONFLICT',
      requestId: req.requestId || null,
    });
  }

  // Error de Prisma: registro no encontrado
  if (err.code === 'P2025') {
    Logger.warn(`Registro no encontrado: ${err.message}`);
    return res.status(404).json({
      error: 'Registro no encontrado',
      code: 'NOT_FOUND',
      requestId: req.requestId || null,
    });
  }

  // Error de aplicación definido por nosotros
  if (err instanceof AppError) {
    Logger.warn(`[${err.code}] ${err.message}`);
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      requestId: req.requestId || null,
    });
  }

  // Error inesperado
  Logger.error('❌ Error no manejado:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    code: 'INTERNAL_ERROR',
    requestId: req.requestId || null,
  });
}

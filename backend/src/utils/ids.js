/**
 * Utilidades para validar identificadores numéricos (IDs de PostgreSQL BIGINT).
 *
 * Convertir con BigInt() un valor no numérico lanza SyntaxError (HTTP 500).
 * Este helper valida primero y lanza ValidationError (HTTP 400) con un mensaje claro.
 */

import { ValidationError } from '../middleware/errorHandler.js';

/** Máximo valor de un BIGINT en PostgreSQL */
const MAX_BIGINT = 9223372036854775807n;

/**
 * Convierte un valor a BigInt validando que sea un entero positivo.
 * Acepta bigint, number entero o string de solo dígitos.
 *
 * @param {bigint|number|string} value - Valor recibido (ej. req.params.id)
 * @param {string} [fieldName='id'] - Nombre del campo para el mensaje de error
 * @returns {bigint}
 * @throws {ValidationError} si el valor no es un entero positivo válido
 */
export function parsePositiveBigInt(value, fieldName = 'id') {
  let parsed = null;

  if (typeof value === 'bigint') {
    parsed = value;
  } else if (typeof value === 'number' && Number.isSafeInteger(value)) {
    parsed = BigInt(value);
  } else if (typeof value === 'string' && /^\d{1,19}$/.test(value.trim())) {
    parsed = BigInt(value.trim());
  }

  if (parsed === null || parsed <= 0n || parsed > MAX_BIGINT) {
    throw new ValidationError(`${fieldName} debe ser un número entero positivo`);
  }

  return parsed;
}

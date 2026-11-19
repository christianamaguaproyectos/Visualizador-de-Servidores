/**
 * three.js auto-alojado para el Mapa de Dependencias (/dependencias).
 *
 * Sirve una LISTA CERRADA de módulos del paquete npm `three` en /vendor/three/...
 * (nunca desde un CDN: la CSP solo permite scripts del propio origen). Cualquier
 * otra ruta responde 404, así que no hay recorrido de directorios posible.
 *
 * Los addons (OrbitControls, CSS2DRenderer) importan el especificador desnudo
 * 'three', que el navegador no sabe resolver sin import map (y un import map
 * inline violaría la CSP). Al cargar el módulo se reescribe ese especificador a
 * '/vendor/three/three.module.js' y el resultado se guarda en memoria con su ETag,
 * de modo que funciona igual con el sistema de archivos de solo lectura del
 * contenedor.
 *
 * Se monta en backend/server.js DESPUÉS de requireAuth.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import Logger from '../utils/logger.js';

const require = createRequire(import.meta.url);

/** Ruta pública (relativa a /vendor/three) -> archivo dentro del paquete three */
export const VENDOR_THREE_LISTA = Object.freeze({
  '/three.module.js': 'build/three.module.min.js',
  '/addons/controls/OrbitControls.js': 'examples/jsm/controls/OrbitControls.js',
  '/addons/renderers/CSS2DRenderer.js': 'examples/jsm/renderers/CSS2DRenderer.js',
});

const RE_THREE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])three\2/g;

/** Reescribe el especificador 'three' para que apunte al módulo auto-alojado. */
export function reescribirEspecificadorThree(codigo) {
  return codigo.replace(RE_THREE, '$1$2/vendor/three/three.module.js$2');
}

function directorioThree() {
  // three no exporta './package.json': se resuelve la entrada principal (build/three.cjs) y se sube un nivel
  return path.resolve(path.dirname(require.resolve('three')), '..');
}

function cargarModulos() {
  const cache = new Map();
  let base;
  try {
    base = directorioThree();
  } catch (err) {
    Logger.error('[vendor-three] No se encontró el paquete three:', err.message);
    return cache;
  }
  for (const [publica, real] of Object.entries(VENDOR_THREE_LISTA)) {
    try {
      const cuerpo = reescribirEspecificadorThree(fs.readFileSync(path.join(base, real), 'utf8'));
      if (/(\bfrom\s*|\bimport\s*\(?\s*)['"]three['"]/.test(cuerpo)) {
        Logger.error(`[vendor-three] Quedó un especificador 'three' sin reescribir en ${real}`);
        continue;
      }
      const buf = Buffer.from(cuerpo, 'utf8');
      cache.set(publica, { buf, etag: `"${crypto.createHash('sha256').update(buf).digest('base64url')}"` });
    } catch (err) {
      Logger.error(`[vendor-three] No se pudo cargar ${real}:`, err.message);
    }
  }
  return cache;
}

let modulos = null;

const router = express.Router();

router.get('/*', (req, res) => {
  modulos ??= cargarModulos();
  const item = Object.hasOwn(VENDOR_THREE_LISTA, req.path) ? modulos.get(req.path) : undefined;
  if (!item) return res.status(404).json({ error: 'No encontrado', code: 'NOT_FOUND' });
  res.set('ETag', item.etag);
  res.set('Cache-Control', 'private, max-age=86400');
  if (req.get('if-none-match') === item.etag) return res.status(304).end();
  res.type('text/javascript; charset=utf-8').send(item.buf);
});

export default router;

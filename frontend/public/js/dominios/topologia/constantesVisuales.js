/**
 * Fuente única de colores, tamaños y textos del mapa de dependencias (3D y 2D).
 * Las mismas cifras se reflejan en las variables --topo-* de dependencies.css.
 */

/** 1 unidad 3D = 40 px del lienzo 2D */
export const ESCALA_3D = 1 / 40;

export const ESCENARIO = Object.freeze({
  fondo: 0x0a1222,
  niebla: [70, 190],
  suelo: 0x0e1a2f,
  rejillaMayor: 0x1d5ed8,
  rejillaMenor: 0x1a2742,
  chasis: 0x2a3852, // algo más claro que #1f2a3d: con ACES el chasis se perdía en el fondo
  bahia: 0x3a4a66,
  rejillaSuperior: 0x121b2c,
  pedestal: 0x16223a,
  vm: 0x2f6fe6,
  vmAristas: 0x7cb4ff,
  seleccion: 0xffffff,
});

export const ESTADOS = Object.freeze({
  UP: { color: '#12b76a', texto: 'UP', descripcion: 'Operativo' },
  DOWN: { color: '#f04438', texto: 'DOWN', descripcion: 'Caído' },
  DEGRADED: { color: '#f59e0b', texto: 'DEGRADED', descripcion: 'Degradado' },
  MAINTENANCE: { color: '#8b5cf6', texto: 'MAINT', descripcion: 'Mantenimiento' },
  UNKNOWN: { color: '#98a2b3', texto: 'UNKNOWN', descripcion: 'Sin monitoreo' },
});

export const IMPACTO = Object.freeze({
  DIRECT_IMPACT: { color: '#f97316', texto: 'Impacto directo' },
  TRANSITIVE_IMPACT: { color: '#fbbf24', texto: 'En cascada' },
});

export const COLOR_CAIDA = '#f04438';

/** Tipos de dependencia: color en 3D (fondo oscuro) y variante -700 para el 2D (fondo claro) */
export const TIPOS_DEPENDENCIA = Object.freeze({
  DATABASE: { color: '#5b9cf6', color2d: '#1d5ed8', corto: 'BD', largo: 'Base de datos' },
  NETWORK: { color: '#22c4d8', color2d: '#0e7490', corto: 'Red', largo: 'Red' },
  STORAGE: { color: '#c084fc', color2d: '#7e22ce', corto: 'Storage', largo: 'Almacenamiento' },
  API: { color: '#2dd4a6', color2d: '#047857', corto: 'API', largo: 'API' },
  AUTH: { color: '#fbbf24', color2d: '#b45309', corto: 'Auth', largo: 'Autenticación' },
  HYPERVISOR: { color: '#fb923c', color2d: '#c2410c', corto: 'Hipervisor', largo: 'Hipervisor' },
  BACKUP: { color: '#94a3b8', color2d: '#475569', corto: 'Backup', largo: 'Respaldo' },
  DNS_INFRA: { color: '#a3e635', color2d: '#4d7c0f', corto: 'DNS/Infra', largo: 'DNS / Infraestructura' },
  SERVICE: { color: '#cbd5e1', color2d: '#334155', corto: 'Servicio', largo: 'Servicio' },
});

export const CRITICIDADES = Object.freeze({
  CRITICAL: { texto: 'Crítica', radio: 0.075, opacidad: 0.95, trazo2d: 3, discontinuo: false, particulas: 2 },
  HIGH: { texto: 'Alta', radio: 0.058, opacidad: 0.85, trazo2d: 2.5, discontinuo: false, particulas: 2 },
  MEDIUM: { texto: 'Media', radio: 0.042, opacidad: 0.75, trazo2d: 2, discontinuo: false, particulas: 1 },
  LOW: { texto: 'Baja', radio: 0.03, opacidad: 0.6, trazo2d: 1.5, discontinuo: true, particulas: 1 },
});

export const TIPOS_SERVIDOR = Object.freeze({
  fisicos: { badge: 'FÍSICO', texto: 'Físico', ruta: '/fisicos' },
  virtuales: { badge: 'VM', texto: 'Virtual', ruta: '/virtuales' },
});

/** Separación de curvas: en unidades 3D y su equivalente en px 2D */
export const SEPARACION = Object.freeze({
  bidireccional3d: 0.9,
  bidireccional2d: 28,
  paralela3d: 0.45,
  paralela2d: 14,
  alturaParalela3d: 0.4,
});

export const TARJETA = Object.freeze({ ancho: 220, alto: 96, radio: 12, rejilla: 10 });

export const LAYOUT = Object.freeze({ separacionNivel: 150, separacionX: 280, radioAnillo: 320, factorZ3d: 1.6 });

export const LIMITE_SIMULACION = 200;

export function colorEstado(status) {
  return (ESTADOS[status] || ESTADOS.UNKNOWN).color;
}

export function textoCriticidad(c) {
  return CRITICIDADES[c]?.texto || c || '—';
}

export function textoTipo(t) {
  return TIPOS_DEPENDENCIA[t]?.corto || t || '—';
}

/** "API · TCP:8443 · Crítica" */
export function resumenArista(e) {
  const partes = [textoTipo(e.dependencyType)];
  if (e.port || e.protocol) partes.push(`${e.protocol || ''}${e.port ? `:${e.port}` : ''}`);
  partes.push(textoCriticidad(e.criticality));
  return partes.join(' · ');
}

/** Color del anillo, núcleo, halo y borde según estado e impacto (3D y 2D) */
export function colorDeNodo(n) {
  if (n.isDown) {
    if (n.downSource === 'MONITORING' && n.status === 'DEGRADED') return ESTADOS.DEGRADED.color;
    return COLOR_CAIDA;
  }
  if (n.cascadeStatus === 'DIRECT_IMPACT') return IMPACTO.DIRECT_IMPACT.color;
  if (n.cascadeStatus === 'TRANSITIVE_IMPACT') return IMPACTO.TRANSITIVE_IMPACT.color;
  return (ESTADOS[n.status] || ESTADOS.UNKNOWN).color;
}

/** Píldora de impacto según los campos de la API (etiqueta 3D, tarjeta 2D e inspector) */
export function pildoraImpacto(n, nombreDe) {
  if (n.isDown) {
    if (n.downSource === 'SIMULATED') return { clase: 'simulado', texto: 'SIMULADO' };
    if (n.downSource === 'BOTH') return { clase: 'caido', texto: 'CAÍDO · SIMULADO' };
    if (n.status === 'DEGRADED') return { clase: 'degradado', texto: 'DEGRADADO' };
    return { clase: 'caido', texto: 'CAÍDO' };
  }
  if (n.cascadeStatus === 'DIRECT_IMPACT') {
    const [primero, ...resto] = n.impactedByServers || [];
    return { clase: 'directo', texto: `Impacto directo · por ${nombreDe(primero)}${resto.length ? ` +${resto.length}` : ''}` };
  }
  if (n.cascadeStatus === 'TRANSITIVE_IMPACT') return { clase: 'transitivo', texto: `En cascada · nivel ${n.impactLevel}` };
  return null;
}

# Plan de Implementacion Priorizado

Fecha: 2026-03-17
Base: auditoria tecnica + especificacion UX/UI + hardening ya implementado

Estado actual (2026-03-17):
- P0 completado
- P1 completado
- P2 completado
- P3 completado

## 1. Resumen ejecutivo
Objetivo: implementar mejoras UX/UI sin perder el progreso de seguridad y confiabilidad.
Estrategia: fases cortas, bajo riesgo, con validacion continua en contenedores.

## 2. Priorizacion (Critico -> Opcional)

### Critico (P0)
1. Estabilizacion funcional y de seguridad en frontend
- Corregir cualquier regresion de parseo/render.
- Mantener sanitizacion, encode/decode seguro en `data-*`.
- Confirmacion modal obligatoria para acciones destructivas.

2. Unificacion de estilos base
- Implementar tokens globales de color/tipografia/espaciado.
- Unificar botones primario/secundario/destructivo.

3. Flujo clusters: resumen -> detalle
- Tarjeta completa clicable + boton "Ver detalle".
- Estructura de detalle con gestion de hosts estandarizada.

### Alto (P1)
4. Rediseño de racks fisicos
- Bloques de servidor con limites claros.
- Hover contextual con info tecnica.
- KPI cards con iconos.

5. Filtros avanzados
- Estado, rack/cluster, tipo VM, texto libre.
- Debounce y chips de filtros activos.

### Medio (P2)
6. Rendimiento de listados grandes
- Paginacion configurable en racks.
- Evaluacion de virtualizacion para grids muy densos.

7. Accesibilidad base
- Contraste AA, foco visible, navegacion por teclado.

### Opcional (P3)
8. Telemetria UX extendida
- Eventos UI para analitica de uso y tiempos de tarea.

## 3. Roadmap por sprints (2 semanas)

## Sprint 1 - Foundation + Riesgo (P0)
Entregables:
- Sistema de tokens (`tokens.css`) y botones unificados.
- Modal de confirmacion reutilizable para acciones destructivas.
- Flujo de clusters estable y consistente.
- QA smoke publico + autenticado.

Tareas tecnicas:
- Crear modulo `frontend/public/js/dominios/ui-system/`.
- Aplicar estilos base en:
  - fisicos (`index/home/app`)
  - virtuales (`virtual/app`)
  - monitoreo (`monitoring`)
- Integrar `confirmAction()` en:
  - eliminar cluster
  - quitar host de cluster
  - eliminar host/check/incidente (cuando aplique)

Criterio de salida:
- Sin errores de sintaxis.
- Contenedores healthy.
- Smoke autenticado PASS.

## Sprint 2 - Racks fisicos + UX de densidad (P1)
Entregables:
- Bloques de servidor rediseñados.
- Hovers contextuales con detalle tecnico.
- KPI cards con iconos.
- Etiqueta "Ocultar detalles tecnicos".

Tareas:
- Refactor de render fisico en `app.js` hacia modulo de presentacion.
- Ajuste CSS de cards, espaciado y linea de estado.
- A/B rapido interno con operadores.

Criterio de salida:
- Legibilidad mejorada validada por usuarios internos.

## Sprint 3 - Filtros avanzados + accesibilidad (P1/P2)
Entregables:
- Filtros combinables y chips activos.
- Base WCAG AA en componentes principales.

Tareas:
- Consolidar estado de filtros en store ligero (objeto de estado central).
- Teclado y focus ring en tarjetas clicables y modales.
- Validacion contraste en temas de estado.

Criterio de salida:
- Navegacion por teclado funcional en flujos clave.

## Sprint 4 - Performance y cierre (P2/P3)
Entregables:
- Paginacion configurable completa.
- Documento de cierre tecnico y UX.

Tareas:
- Medicion de render en listados grandes.
- Ajuste final de estrategia paginacion/virtualizacion.
- Hardening de detalles pendientes de deuda tecnica.

## 4. Mapa de trabajo por archivo/modulo

Frontend:
- `frontend/public/app.js` (seguir extraccion por dominios)
- `frontend/public/monitoring.js`
- `frontend/public/users.js`
- `frontend/public/home-styles.css`
- `frontend/public/styles.css`
- Nuevos:
  - `frontend/public/js/dominios/ui-system/modalConfirm.js`
  - `frontend/public/js/dominios/ui-system/feedback.js`
  - `frontend/public/css/tokens.css`

Backend (alineacion seguridad ya aplicada):
- `backend/server.js` (sesion y middleware)
- `backend/src/middleware/securityHeadersMiddleware.js`
- `backend/src/middleware/requestContextMiddleware.js`

Docs y QA:
- `docs/ESPECIFICACION-DISENO-UX-UI-2026.md`
- `docs/MOCKUPS-UX-UI-2026.md`
- `docs/QA-SMOKE-CHECKLIST.md`

## 5. Integracion con Well-Architected (6 pilares)

1. Excelencia operacional
- Runbook + checklist smoke + despliegues reproducibles en Docker.

2. Seguridad
- Confirmaciones destructivas, sanitizacion frontend, session handling seguro, headers.

3. Confiabilidad
- Flujos estables, manejo consistente de errores, requestId para trazabilidad.

4. Eficiencia de rendimiento
- Paginacion y virtualizacion en vistas densas.

5. Optimizacion de costos (on-prem)
- Menor retrabajo operativo por UX clara y menos errores de operacion.

6. Sostenibilidad
- Menos acciones fallidas/reintentos y menor friccion operativa.

## 6. Riesgos y dependencias
- Dependencia: validacion con usuarios de operacion para priorizar filtros.
- Riesgo: tocar CSS global puede impactar vistas no auditadas.
- Mitigacion: feature flags visuales por modulo si es necesario.

## 7. Definicion de terminado
- Entregables P0 y P1 en produccion interna.
- QA smoke (publico + autenticado) PASS.
- Sin regresiones de seguridad conocidas.
- Documentacion actualizada y publicada en `/docs`.

# Jira Board - Sprint 1 (Copiar/Pegar)

Proyecto: Visualizador de Servidores  
Sprint: 1 - Foundation UX/UI + Confirmaciones destructivas  
Objetivo: Base visual unificada, seguridad UX en acciones destructivas, y artefactos de diseno listos.

## EPIC UI-100 - UI System Foundation

### Story UI-101 - Definir tokens globales
Tipo: Story  
Prioridad: Alta  
Descripcion: Crear y publicar tokens de color, tipografia y espaciado para toda la app.

Criterios de aceptacion:
- Existe archivo de tokens con paleta unificada.
- Colores primario/activo/inactivo/destructivo estan definidos.
- Tipografia global usa familia consistente.

Subtareas:
- Crear `frontend/public/css/tokens.css`.
- Integrar tokens en estilos existentes.

### Story UI-102 - Crear botones base unificados
Tipo: Story  
Prioridad: Alta  
Descripcion: Estandarizar botones primario/secundario/destructivo y estados foco/hover.

Criterios de aceptacion:
- Clases `btn`, `btn-primary`, `btn-secondary`, `btn-danger` disponibles.
- Botones en index/virtual/monitoring usan taxonomia unificada.

Subtareas:
- Crear `frontend/public/css/ui-system.css`.
- Integrar en `frontend/public/styles.css`.
- Ajustar clases en `index.html`, `virtual.html`, `monitoring.html`.

## EPIC UI-200 - Prevencion de errores en UX

### Story UI-201 - Modal de confirmacion reutilizable
Tipo: Story  
Prioridad: Critica  
Descripcion: Reemplazar confirmaciones nativas por modal consistente con teclado.

Criterios de aceptacion:
- Existe modulo reusable Promise<boolean>.
- Soporta Enter/Esc y click fuera para cancelar.
- Se usa en eliminar servidor/rack/cluster/vista/quitar host.

Subtareas:
- Crear `frontend/public/js/dominios/ui-system/modalConfirm.js`.
- Integrar en `frontend/public/app.js`.

### Story UI-202 - Validar seguridad UX destructiva
Tipo: Task  
Prioridad: Alta  
Descripcion: Revisar que todas las acciones destructivas tengan confirmacion y mensajes claros.

Criterios de aceptacion:
- Ninguna accion destructiva ejecuta sin confirmacion explicita.
- Mensajes describen impacto de la accion.

## EPIC UI-300 - Mockups y alineacion de diseno

### Story UI-301 - Publicar mockups navegables
Tipo: Story  
Prioridad: Alta  
Descripcion: Publicar mockups HTML para revision de stakeholders.

Criterios de aceptacion:
- Mockup de racks fisicos disponible.
- Mockup de clusters general disponible.
- Mockup de detalle de cluster disponible.

Subtareas:
- Crear `docs/mockups/rack-fisicos-v2.html`.
- Crear `docs/mockups/clusters-general-v2.html`.
- Crear `docs/mockups/cluster-detalle-v2.html`.

### Story UI-302 - Especificacion y plan implementacion
Tipo: Task  
Prioridad: Alta  
Descripcion: Documentar especificacion UX/UI y roadmap tecnico priorizado.

Criterios de aceptacion:
- Existe documento de especificacion completo.
- Existe plan de implementacion por sprint.
- Existe backlog tecnico operativo.

Subtareas:
- `docs/ESPECIFICACION-DISENO-UX-UI-2026.md`
- `docs/PLAN-IMPLEMENTACION-PRIORIZADO-2026.md`
- `docs/BACKLOG-TECNICO-SPRINT1.md`

## EPIC QA-100 - Cierre tecnico de sprint

### Story QA-101 - Smoke tecnico de frontend
Tipo: Task  
Prioridad: Alta  
Descripcion: Validar sintaxis y errores en archivos modificados.

Criterios de aceptacion:
- `node --check` pasa en archivos JS clave.
- Problemas del editor en archivos tocados: 0 errores.

### Story QA-102 - Verificacion de despliegue
Tipo: Task  
Prioridad: Alta  
Descripcion: Confirmar que contenedores suben con cambios.

Criterios de aceptacion:
- `docker compose ps` muestra `app` y `postgres` healthy.

## Definition of Done del Sprint
- Base visual de botones unificada aplicada en index/virtual/monitoring.
- Confirmaciones destructivas migradas a modal reusable.
- Mockups y documentacion listos para validacion de negocio.
- Build/deploy local sin errores criticos.

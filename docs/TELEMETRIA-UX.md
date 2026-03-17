# Telemetria UX

Fecha: 2026-03-17
Alcance: instrumentacion ligera de eventos de interfaz para analitica operativa.

## 1. Modulo base
- Archivo: `frontend/public/js/dominios/ui-system/uxTelemetry.js`
- API publica:
  - `trackUIEvent(eventName, data)`
  - `readUIEvents()`
  - `clearUIEvents()`

## 2. Persistencia local
- Clave: `localStorage['uxTelemetryEvents']`
- Politica de retencion: ventana circular de maximo 200 eventos.

## 3. Eventos instrumentados
### Fisicos (`frontend/public/app.js`)
- `physical.labels.toggle`
- `physical.pagination.navigate`
- `physical.pagination.page_size_change`
- `physical.racks.render`

### Monitoreo (`frontend/public/monitoring.js`)
- `monitoring.tab.switch`
- `monitoring.dashboard.refresh`
- `monitoring.host_filters.change`
- `monitoring.host_filters.clear`
- `monitoring.incident_filters.change`
- `monitoring.confirm`

## 4. Envio opcional a backend
- Si existe `window.__UX_TELEMETRY_ENDPOINT`, el modulo intenta enviar cada evento con `navigator.sendBeacon`.
- Si el endpoint no existe, la telemetria queda en modo local sin romper flujos.

## 5. Notas operativas
- La telemetria esta pensada para metricas de uso y tiempos de tarea, no para datos sensibles.
- Se recomienda anonimizar cualquier dato adicional antes de ampliar el payload.

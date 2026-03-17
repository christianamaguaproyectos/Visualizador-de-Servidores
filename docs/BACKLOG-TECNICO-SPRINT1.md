# Backlog Tecnico Sprint 1

Estado: listo para Jira/Trello
Objetivo sprint: foundation UI system + confirmaciones destructivas + flujo clusters estable

## EPIC 1 - UI System Foundation

1. Crear tokens globales
- Archivo: frontend/public/css/tokens.css
- Criterio: variables de color/tipografia/espaciado disponibles globalmente
- Estado: DONE

2. Crear componentes base UI
- Archivo: frontend/public/css/ui-system.css
- Criterio: clases btn-primary/btn-secondary/btn-danger y estilos modal
- Estado: DONE

3. Cargar UI system en estilos principales
- Archivo: frontend/public/styles.css
- Criterio: imports al inicio sin romper estilos existentes
- Estado: DONE

## EPIC 2 - Confirmaciones destructivas

4. Crear modulo reutilizable de confirmacion
- Archivo: frontend/public/js/dominios/ui-system/modalConfirm.js
- Criterio: Promise<boolean>, teclado Esc/Enter, overlay accesible
- Estado: DONE

5. Reemplazar confirm() en flujos criticos de app
- Archivo: frontend/public/app.js
- Criterio: eliminar servidor/rack/cluster/vista/quitar host usan modalConfirm
- Estado: DONE

## EPIC 3 - Clusters UX baseline

6. Ajustar tarjetas clicables y boton ver detalle
- Archivo: frontend/public/app.js
- Criterio: click en tarjeta y boton llevan a detalle de cluster
- Estado: DONE

7. Estandarizar lista de hosts asignados
- Archivo: frontend/public/app.js + styles.css
- Criterio: items no parecen botones, solo accion Quitar destructiva
- Estado: DONE

## EPIC 4 - QA y artefactos

8. Crear mockups HTML navegables para validacion
- Archivos:
  - docs/mockups/rack-fisicos-v2.html
  - docs/mockups/clusters-general-v2.html
  - docs/mockups/cluster-detalle-v2.html
- Criterio: stakeholders pueden revisar visual sin ejecutar app
- Estado: DONE

9. Verificacion syntax + smoke
- Comando: node --check frontend/public/app.js
- Comando: docker compose ps
- Criterio: sin errores de parseo y contenedores healthy
- Estado: DONE

10. Filtros avanzados en monitoreo (estado/rack/tipo + chips + limpiar)
- Archivo: frontend/public/monitoring.html + monitoring.js + monitoring-styles.css
- Criterio: filtros combinables con chips activos removibles y boton limpiar
- Estado: DONE

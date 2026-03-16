# Glosario Ubicuo del Dominio

Ultima actualizacion: 2026-03-16

## Objetivo
Este glosario es el estandar estricto de nombres para el proyecto. Debe aplicarse a clases, variables, metodos, servicios, modulos y tablas nuevas o refactorizadas durante la Fase 2.

Reglas:
- Usar espanol en codigo interno de aplicacion.
- Mantener contratos externos actuales (API publica y columnas existentes) hasta plan de migracion.
- Evitar sinonimos para el mismo concepto.

## Dominios
- Monitoreo: chequeos, estado, incidentes, alertas, ventanas de mantenimiento.
- Hosts: equipos fisicos o virtuales monitoreados.
- Usuarios: autenticacion, autorizacion, gestion de cuentas.

## Terminos canonicos
- host: entidad principal monitoreada.
- chequeo: ejecucion tecnica sobre host (icmp, tcp, http).
- ejecucion de chequeo: registro historico de resultado de chequeo.
- estado de host: valor calculado por reglas de evaluacion.
- incidente: evento operativo abierto/cerrado por cambio de estado.
- severidad: criticidad del incidente.
- mantenimiento: ventana temporal para pausar alertamiento.
- notificacion: envio de alerta a destinatarios.

## Estados canonicos
- EstadoHost: UP, DOWN, DEGRADED, MAINTENANCE
- EstadoChequeo: ok, fail, timeout, degraded
- SeveridadIncidente: critical, warning

## Estandar de nombres internos
- Clases/servicios: CheckExecutorService -> ServicioEjecucionChequeos (nuevo codigo)
- Variables: check -> chequeo, hostId -> idHost, prevState -> estadoAnterior
- Funciones: execute -> ejecutarChequeo, reloadChecks -> recargarChequeos
- Modulos frontend: agrupar por dominio en frontend/public/js/dominios/{hosts,monitoreo,usuarios}

## Convencion de transicion
- Si un simbolo existente se mantiene por compatibilidad, usar alias temporal y marcar TODO de migracion.
- Todo modulo nuevo debe importar constantes de dominio para evitar literales repetidos.

## Relacion con tablas
- No renombrar tablas/columnas existentes sin migracion.
- Para nuevas tablas, usar nombres coherentes con el glosario.

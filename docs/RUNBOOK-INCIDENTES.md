# Runbook de Incidentes Operativos

Ultima actualizacion: 2026-03-16

## Objetivo
Reducir MTTR en incidentes de la plataforma DiagramaServers usando trazabilidad por `requestId`, logs estructurados y acciones operativas estandar.

## Severidades
- Critica: caida de servicio, error masivo de autenticacion o perdida de datos.
- Alta: degradacion visible en monitoreo o endpoints criticos.
- Media: error funcional acotado.
- Baja: issue cosmetico o no bloqueante.

## Flujo de respuesta
1. Detectar el incidente (alerta o reporte de usuario).
2. Identificar `x-request-id` del request fallido.
3. Correlacionar en logs PM2 por `requestId` y `evento=http.request`.
4. Confirmar alcance: endpoint, usuario, dominio y status code.
5. Aplicar mitigacion de corto plazo.
6. Validar recuperacion y cerrar incidente.
7. Registrar postmortem breve.

## Comandos utiles (Windows + PM2)
```powershell
cmd /c "pm2 status"
cmd /c "pm2 logs diagrama-servidores --lines 500"
cmd /c "pm2 logs diagrama-servidores --lines 500 | findstr /i \"requestId\""
cmd /c "pm2 logs diagrama-servidores --lines 500 | findstr /i \"nivel\":\"error\""
```

## Correlacion por requestId
1. Captura `x-request-id` desde respuesta API.
2. Buscar el id en logs.
3. Revisar metadatos clave:
- `metadatos.path`
- `metadatos.statusCode`
- `metadatos.usuario`
- `metadatos.durationMs`

## Mitigaciones rapidas
- Errores 401/403 masivos: verificar sesion, cookies y cambios recientes de auth.
- Errores 429: revisar rate limiting y picos de trafico.
- Errores 5xx en monitoreo: validar Postgres/worker/scheduler.
- Falla de sincronizacion: detener ejecuciones repetidas y relanzar `POST /api/monitoring/sync` una sola vez.

## Checklist de cierre
- [ ] Servicio estable al menos 15 minutos.
- [ ] Dashboard de monitoreo sin errores activos no esperados.
- [ ] No hay crecimiento anomalo de logs de error.
- [ ] Se documento causa raiz y accion preventiva.

## Postmortem minimo
- Fecha/hora inicio-fin
- Severidad
- Impacto
- Causa raiz
- Mitigacion aplicada
- Accion preventiva (owner + fecha objetivo)

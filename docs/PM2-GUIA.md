# 🔄 Gestión del Servidor con PM2

Esta guía te ayuda a gestionar el servidor DiagramaServers usando PM2 (Process Manager 2), una herramienta profesional para aplicaciones Node.js en producción.

## 📦 Instalación Inicial

### 1. Instalar PM2 globalmente
```powershell
cmd /c "npm install -g pm2"
```

### 2. Verificar instalación
```powershell
cmd /c "pm2 --version"
```

## 🚀 Comandos Principales

### Iniciar el servidor
```powershell
cmd /c "pm2 start ecosystem.config.cjs"
```

**Nota**: El archivo es `.cjs` (CommonJS) porque el proyecto usa ES modules.

### Ver estado del servidor
```powershell
cmd /c "pm2 status"
# O más detallado:
cmd /c "pm2 show diagrama-servidores"
```

### Ver logs en tiempo real
```powershell
cmd /c "pm2 logs diagrama-servidores"
# Solo errores:
cmd /c "pm2 logs diagrama-servidores --err"
```

### Monitorear recursos (CPU, RAM)
```powershell
cmd /c "pm2 monit"
```

### Reiniciar el servidor
```powershell
cmd /c "pm2 restart diagrama-servidores"
```

### Detener el servidor
```powershell
cmd /c "pm2 stop diagrama-servidores"
```

### Eliminar del PM2
```powershell
cmd /c "pm2 delete diagrama-servidores"
```

## ⚙️ Inicio Automático con Windows

### Configurar inicio automático (UNA SOLA VEZ)

**IMPORTANTE**: En Windows necesitas un paquete adicional.

1. **Instalar pm2-windows-startup**:
```powershell
cmd /c "npm install -g pm2-windows-startup"
```

2. **Instalar el servicio de inicio**:
```powershell
cmd /c "pm2-startup install"
```

3. **Guardar la configuración actual de PM2**:
```powershell
cmd /c "pm2 save"
```

4. **Verificar que está configurado**:
```powershell
cmd /c "pm2 list"
```

Ahora cada vez que reinicies Windows, el servidor se iniciará automáticamente.

### Desactivar inicio automático
```powershell
cmd /c "pm2-startup uninstall"
cmd /c "pm2 delete diagrama-servidores"
cmd /c "pm2 save"
```

## 📊 Monitoreo y Logs

### Logs estructurados JSON para monitoreo

El backend ahora emite eventos JSON en una sola linea para ingestion automatica (alertas y dashboards).

Campos principales por evento:
- `timestamp`
- `nivel`
- `evento`
- `dominio`
- `servicio`
- `metadatos`
- `error`

Trazabilidad por request:
- Cada request API ahora incluye `x-request-id` en respuesta.
- El mismo `requestId` se registra en `metadatos.requestId` para correlacionar errores y latencia.
- Recomendado: propagar `x-request-id` desde clientes o balanceador para trazas extremo a extremo.

Variables de entorno recomendadas en PM2:
- `SERVICE_NAME=diagrama-servidores`
- `LOG_FORMAT=json`

Ejemplo de evento esperado en `pm2-out.log`:

```json
{"timestamp":"2026-03-16T20:10:00.000Z","nivel":"info","evento":"scheduler.iniciado","dominio":"monitoreo","servicio":"diagrama-servidores","metadatos":{"intervaloMs":5000,"recargaMs":30000}}
```

Recomendacion operativa:
- Configurar el colector de logs para parsear JSON lineal.
- Crear alertas por `evento` y `nivel`.
- Priorizar alertas de `nivel=error` en dominio `monitoreo`.

### Ver información detallada
```powershell
cmd /c "pm2 show diagrama-servidores"
```

Muestra:
- ✅ Uptime (tiempo activo)
- ✅ Reinicios
- ✅ CPU y RAM actual
- ✅ Rutas de logs
- ✅ PID del proceso

### Limpiar logs antiguos
```powershell
cmd /c "pm2 flush"
```

### Rotar logs (crear nuevos archivos)
```powershell
cmd /c "pm2 install pm2-logrotate"
```

## 🔧 Comandos Útiles

### Reiniciar si hay cambios en el código
```powershell
cmd /c "pm2 restart diagrama-servidores --update-env"
```

### Ver tabla de procesos
```powershell
cmd /c "pm2 list"
```

### Actualizar PM2
```powershell
cmd /c "npm install -g pm2@latest"
cmd /c "pm2 update"
```

## 🎯 Flujo de Trabajo Recomendado

### Desarrollo (inicio manual)
```powershell
npm start
# O con nodemon:
npm run dev
```

### Producción (con PM2)
```powershell
# Primera vez
cmd /c "pm2 start ecosystem.config.js"
cmd /c "pm2 save"

# Luego solo:
cmd /c "pm2 status"
cmd /c "pm2 logs diagrama-servidores"
```

## ⚠️ Solución de Problemas

### El servidor no inicia
```powershell
# Ver logs de error
cmd /c "pm2 logs diagrama-servidores --err --lines 50"
```

### Consumo alto de memoria
```powershell
# Ver consumo actual
cmd /c "pm2 monit"

# Reiniciar para liberar memoria
cmd /c "pm2 restart diagrama-servidores"
```

### Puerto 3050 ocupado
```powershell
# Ver qué proceso usa el puerto
Get-NetTCPConnection -LocalPort 3050 | Select-Object OwningProcess

# Detener PM2
cmd /c "pm2 stop diagrama-servidores"
```

### Trazar un incidente con requestId
1. Captura el valor `x-request-id` desde la respuesta HTTP del cliente.
1. Busca el request en logs PM2:
```powershell
cmd /c "pm2 logs diagrama-servidores --lines 300 | findstr /i \"requestId\""
```
1. Filtra por el id exacto (ejemplo):
```powershell
cmd /c "pm2 logs diagrama-servidores --lines 500 | findstr /i \"9d8f7e6c-...\""
```
1. Correlaciona:
- `evento=http.request` para latencia y status final.
- `nivel=error` y `dominio` para localizar modulo afectado.
- `metadatos.path` y `metadatos.usuario` para reproducir el flujo.

## 📋 Configuración del Archivo ecosystem.config.cjs

El archivo `ecosystem.config.cjs` en la raíz del proyecto define:
- ✅ Nombre de la aplicación: `diagrama-servidores`
- ✅ Script de inicio: `./backend/server.js`
- ✅ Auto-restart: Habilitado
- ✅ Límite de memoria: 200MB (reinicia si excede)
- ✅ Logs: Se guardan en `./logs/`
- ✅ Modo: Fork (1 instancia)

Para modificar la configuración, edita `ecosystem.config.cjs` y ejecuta:
```powershell
cmd /c "pm2 restart diagrama-servidores --update-env"
```

## 🔗 Recursos

- [Documentación oficial de PM2](https://pm2.keymetrics.io/)
- [Guía de comandos PM2](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [PM2 con Windows](https://pm2.keymetrics.io/docs/usage/startup/)

---

**💡 Tip**: Usa `cmd /c "pm2 monit"` para ver en tiempo real el consumo de recursos del servidor.

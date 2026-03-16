# 🔒 Guía de Seguridad en Redes

## ⚠️ Problema: Exposición en Redes Públicas

### Escenario de Riesgo

Cuando tu PC con el servidor se conecta a una **red pública o abierta** (café, aeropuerto, hotel, etc.):

```
❌ VULNERABLE (Antes):
Tu PC en red pública (192.168.1.X)
  ↓
Puerto 3050 ABIERTO a toda la red
  ↓
Cualquiera en esa red puede:
  - Acceder a http://192.168.1.X:3050
  - Ver datos sensibles de Grupo Danec
  - Ver IPs de servidores corporativos
  - Información de infraestructura VMware
```

### Datos en Riesgo

1. **Información de Servidores Físicos**:
   - IPs de producción
   - Nombres de servidores
   - Configuraciones de hardware
   - Ubicaciones físicas

2. **Información de Servidores Virtuales**:
   - Estructura VMware vSphere
   - Distribución de VMs
   - Recursos asignados
   - Topología de red interna

3. **Metadata Corporativa**:
   - Nombres de racks
   - Arquitectura de red
   - Distribución de servicios

---

## ✅ Solución Implementada: Detección Automática de Red

### Cómo Funciona

El servidor **detecta automáticamente** el tipo de red y ajusta su comportamiento:

#### 🏢 **Red Corporativa Detectada** (192.168.100.x):
```bash
✅ Servidor iniciado en http://localhost:3050
🌐 Accesible en red local: http://192.168.100.20:3050
   Otros dispositivos pueden acceder desde http://192.168.100.20:3050
```

**Comportamiento**:
- ✅ Puerto abierto a toda la red local
- ✅ Compañeros pueden acceder desde sus PCs
- ✅ Sin restricciones de IP
- ✅ Modo colaborativo

#### 🔒 **Red Pública Detectada** (192.168.1.x, 10.x.x.x, etc.):
```bash
⚠️  Red pública/no confiable detectada: 192.168.1.45
🔒 Modo SEGURO: Solo acceso local (red pública detectada)
✅ Servidor iniciado en http://localhost:3050
   Conéctate a la red corporativa (192.168.100.x) para acceso en red
```

**Comportamiento**:
- 🔒 Puerto cerrado a la red externa
- 🔒 Solo accesible desde localhost (tu PC)
- 🔒 Bloqueados intentos de acceso remoto
- 🔒 Modo seguro automático

---

## 🛡️ Capas de Protección Implementadas

### 1. **Detección de Red Confiable**

El servidor identifica redes corporativas de Grupo Danec:

```javascript
// Redes corporativas configuradas
trustedNetworks = [
  '192.168.100.', // Red corporativa principal
  '10.0.',        // VPN corporativa
]
```

### 2. **Binding Dinámico**

El servidor cambia la dirección de escucha según la red:

| Red Detectada | Binding Address | Acceso Remoto |
|---------------|----------------|---------------|
| Corporativa (192.168.100.x) | `0.0.0.0` (todas las interfaces) | ✅ Permitido |
| Pública/No confiable | `localhost` (solo local) | 🚫 Bloqueado |

### 3. **Middleware de Validación**

Si alguien intenta acceder remotamente en red pública:

```json
HTTP 403 Forbidden
{
  "error": "Acceso denegado",
  "message": "El servidor está en modo seguro (red pública). Solo se permite acceso local.",
  "hint": "Conéctate a la red corporativa para acceder remotamente."
}
```

### 4. **Reinicio Automático con PM2**

El servidor se reinicia **cada hora** para detectar cambios de red:

```javascript
// ecosystem.config.cjs
cron_restart: '0 * * * *' // Reinicia a las 00:00, 01:00, 02:00, etc.
```

**¿Por qué?**  
Si cambias de red Wi-Fi (corporativa → pública o viceversa), el servidor se reinicia en la próxima hora y ajusta la seguridad automáticamente.

---

## 🔍 Verificar Estado de Seguridad

### Ver Logs de Seguridad

```powershell
# Ver logs en tiempo real
cmd /c "pm2 logs diagrama-servidores"

# Ver últimos 50 logs
cmd /c "pm2 logs diagrama-servidores --lines 50"
```

**Buscar**:
```
🔒 ESTADO DE SEGURIDAD DE RED
═══════════════════════════════════════════════════════
✅ Red Corporativa Detectada
   IP: 192.168.100.20
   Interfaz: Wi-Fi
   Modo: Acceso en red local HABILITADO
═══════════════════════════════════════════════════════
```

o

```
⚠️  Red Pública/No Confiable Detectada
   IP: 192.168.1.45
   Interfaz: Wi-Fi
   Modo: SOLO LOCALHOST (seguridad activada)
```

### Comprobar Red Actual

```powershell
# Ver tu IP actual
ipconfig | Select-String "IPv4"

# Ver interfaces de red
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*"}
```

### Forzar Reinicio para Re-detectar Red

Si cambiaste de red y quieres que se re-detecte inmediatamente:

```powershell
cmd /c "pm2 restart diagrama-servidores"
```

El servidor detectará la nueva red y ajustará la seguridad en ~2 segundos.

---

## ⚙️ Configuración Avanzada

### Agregar Más Redes Confiables

Edita `backend/src/services/networkSecurityService.js`:

```javascript
this.trustedNetworks = [
  '192.168.100.', // Red corporativa principal
  '10.0.',        // VPN corporativa
  '172.16.',      // Nueva red corporativa (ejemplo)
  '192.168.50.',  // Sucursal (ejemplo)
];
```

**Luego reinicia**:
```powershell
cmd /c "pm2 restart diagrama-servidores"
```

### Cambiar Frecuencia de Reinicio

Edita `ecosystem.config.cjs`:

```javascript
// Cada 30 minutos
cron_restart: '*/30 * * * *',

// Cada 2 horas
cron_restart: '0 */2 * * *',

// Cada día a las 3 AM
cron_restart: '0 3 * * *',

// Desactivar reinicios automáticos
// cron_restart: null,
```

---

## 📊 Escenarios de Uso

### Escenario 1: Trabajo Normal en Oficina

**Red**: 192.168.100.20 (Wi-Fi Grupo Danec)

```bash
✅ Red Corporativa Detectada
🌐 Accesible en http://192.168.100.20:3050
```

**Resultado**:
- ✅ Tú y tus compañeros pueden acceder
- ✅ Modo colaborativo activado
- ✅ Sin restricciones

### Escenario 2: Trabajando desde Casa (VPN)

**Red**: 10.0.2.45 (VPN corporativa)

```bash
✅ Red Corporativa Detectada
🌐 Accesible en http://10.0.2.45:3050
```

**Resultado**:
- ✅ Red VPN reconocida como confiable
- ✅ Acceso habilitado dentro de VPN
- ✅ Seguro para trabajo remoto

### Escenario 3: Café Público

**Red**: 192.168.1.123 (Wi-Fi abierta)

```bash
⚠️  Red Pública Detectada
🔒 Modo SEGURO: Solo localhost
```

**Resultado**:
- 🔒 Puerto cerrado a la red
- 🔒 Solo tú puedes acceder (localhost)
- 🔒 Nadie en el café puede ver el servidor
- ✅ Datos protegidos

### Escenario 4: Hotel/Aeropuerto

**Red**: 10.45.3.88 (Wi-Fi hotel)

```bash
⚠️  Red Pública Detectada
🔒 Modo SEGURO: Solo localhost
```

**Resultado**:
- 🔒 Modo seguro automático
- 🔒 Acceso bloqueado desde otras habitaciones
- ✅ Información corporativa protegida

---

## 🚨 Qué Hacer Si...

### ... Olvido cambiar de red y el servidor está expuesto?

**No te preocupes**: El servidor se reinicia automáticamente cada hora y re-detecta la red.

**Acción inmediata**:
```powershell
cmd /c "pm2 restart diagrama-servidores"
```

### ... Quiero desactivar la detección automática?

**Opción A**: Forzar modo seguro siempre (solo localhost):

Edita `backend/server.js`:
```javascript
// Línea ~160, cambiar:
const bindAddress = secureBinding.bindAddress;

// Por:
const bindAddress = 'localhost'; // Forzar solo local
```

**Opción B**: Forzar modo abierto siempre (⚠️ NO RECOMENDADO):
```javascript
const bindAddress = '0.0.0.0'; // ⚠️ Siempre abierto
```

### ... La red corporativa no es detectada?

1. **Verifica tu IP**:
```powershell
ipconfig | Select-String "IPv4"
```

2. **Agrega el prefijo a redes confiables** en `networkSecurityService.js`:
```javascript
'192.168.X.', // Reemplaza X con tu red
```

3. **Reinicia**:
```powershell
cmd /c "pm2 restart diagrama-servidores"
```

---

## 🎯 Mejores Prácticas

### ✅ Recomendaciones

1. **Mantén las redes confiables actualizadas**:
   - Solo agrega redes corporativas conocidas
   - No agregues redes de casa/hoteles

2. **Revisa logs después de cambiar de red**:
   ```powershell
   cmd /c "pm2 logs diagrama-servidores --lines 20"
   ```

3. **No desactives la detección automática** a menos que sea absolutamente necesario

4. **Si trabajas remoto con frecuencia**:
   - Usa VPN corporativa (10.0.x.x ya está configurada)
   - Verifica que VPN esté en `trustedNetworks`

### ❌ Evita

1. **No agregues redes públicas a `trustedNetworks`**:
   ```javascript
   // ❌ MAL
   '192.168.1.', // Red de café/hotel
   
   // ✅ BIEN
   '192.168.100.', // Solo red corporativa
   ```

2. **No fuerces binding a 0.0.0.0 permanentemente**:
   - Pierdes toda la protección automática

3. **No desactives `cron_restart` si cambias de red frecuentemente**:
   - Necesitas el reinicio para re-detectar red

---

## 📈 Monitoreo de Seguridad

### Comando de Diagnóstico Rápido

Crea un script `check-security.ps1`:

```powershell
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🔒 ESTADO DE SEGURIDAD DIAGRAMA SERVERS" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan

Write-Host "`n📍 Tu IP actual:" -ForegroundColor Yellow
ipconfig | Select-String "IPv4" | Where-Object {$_ -notlike "*127.0.0.1*"}

Write-Host "`n📊 Estado PM2:" -ForegroundColor Yellow
cmd /c "pm2 status"

Write-Host "`n🔍 Últimos 10 logs (busca 'SEGURIDAD'):" -ForegroundColor Yellow
cmd /c "pm2 logs diagrama-servidores --lines 10 --nostream"

Write-Host "`n🌐 Conexiones activas al puerto 3050:" -ForegroundColor Yellow
Get-NetTCPConnection -LocalPort 3050 -ErrorAction SilentlyContinue | Format-Table
```

**Ejecutar**:
```powershell
.\check-security.ps1
```

---

## 🔐 Resumen de Seguridad

| Aspecto | Antes (Vulnerable) | Ahora (Protegido) |
|---------|-------------------|-------------------|
| **Red Corporativa** | Abierto | ✅ Abierto (modo colaborativo) |
| **Red Pública** | ⚠️ Expuesto | 🔒 Bloqueado (solo localhost) |
| **Detección** | Manual | ✅ Automática |
| **Reinicio** | Manual | ✅ Cada hora (auto-detect) |
| **Logs** | Básicos | ✅ Detallados con red detectada |
| **Protección Datos** | ❌ Ninguna | ✅ Automática por red |

---

## 📚 Referencias

- [PM2 Cron Restart](https://pm2.keymetrics.io/docs/usage/restart-strategies/#cron-restart)
- [Node.js os.networkInterfaces()](https://nodejs.org/api/os.html#os_os_networkinterfaces)
- [Express Middleware](https://expressjs.com/en/guide/using-middleware.html)

---

**Última actualización**: 30 de octubre de 2025  
**Mantenedor**: Equipo TI Grupo Danec

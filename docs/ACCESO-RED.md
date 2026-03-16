# 🌐 Acceso en Red Local - DiagramaServidores

## 📍 Direcciones de Acceso

### Tu PC (Local)
```
http://localhost:3050
http://127.0.0.1:3050
http://192.168.100.20:3050  (Tu IP actual)
```

### Otros usuarios en la red
```
http://192.168.100.20:3050
```

**Nota**: La IP `192.168.100.20` puede cambiar si usas DHCP. Para verificar tu IP actual, ejecuta:
```powershell
ipconfig | Select-String "IPv4"
```

## 👥 Quién Puede Acceder

### ✅ Pueden acceder:
- **Tú** desde tu PC
- **Cualquier persona** conectada a la misma red Wi-Fi/LAN (oficina Grupo Danec)
- **Dispositivos móviles** en la misma red (tablets, celulares)

### ❌ NO pueden acceder:
- Personas **fuera de tu red local**
- Usuarios de **Internet** (sin configuración adicional)
- Personas en **otras sucursales** (sin VPN)

## 🔍 Verificar Conexiones Activas

### Ver quién está conectado ahora:
```powershell
# Ver conexiones TCP al puerto 3050
Get-NetTCPConnection -LocalPort 3050 -State Established | Select-Object RemoteAddress, RemotePort, State
```

### Ver logs de acceso en PM2:
```powershell
# Ver logs de peticiones HTTP
cmd /c "pm2 logs diagrama-servidores | Select-String 'API'"
```

### Estadísticas en tiempo real:
```powershell
cmd /c "pm2 show diagrama-servidores"
```

Busca la sección "Code metrics value" → "HTTP" para ver peticiones por minuto.

## 🛡️ Opciones de Seguridad

### 1. Sin Restricciones (Estado Actual)
- ✅ Cualquiera en la red puede acceder
- ✅ Fácil de usar
- ⚠️ Sin control de acceso

**Ideal para:** Entorno de oficina confiable.

### 2. Firewall de Windows (Filtro por IP)

Permite solo ciertos rangos de IP:

```powershell
# Permitir solo IPs de la red corporativa (192.168.100.x)
New-NetFirewallRule -DisplayName "DiagramaServidores - Red Local" `
  -Direction Inbound `
  -LocalPort 3050 `
  -Protocol TCP `
  -Action Allow `
  -RemoteAddress 192.168.100.0/24
```

**Ventajas:**
- ✅ Control por red
- ✅ No requiere cambios en el código

**Desventajas:**
- ⚠️ Requiere permisos de administrador
- ⚠️ Configuración manual

### 3. Solo Localhost (Solo Tú)

Edita `backend/server.js`:

```javascript
// Cambiar esta línea:
app.listen(PORT, '0.0.0.0', () => {
  
// Por esta:
app.listen(PORT, 'localhost', () => {
```

Luego reinicia:
```powershell
cmd /c "pm2 restart diagrama-servidores"
```

**Ventajas:**
- ✅ Máxima privacidad
- ✅ Solo tú accedes

**Desventajas:**
- ❌ Otros usuarios NO pueden acceder
- ❌ No apto para uso compartido

### 4. Autenticación Básica (Usuario/Contraseña)

Requiere modificar el código. Ejemplo con express-basic-auth:

```javascript
// backend/server.js
import basicAuth from 'express-basic-auth';

app.use(basicAuth({
  users: { 'admin': 'password123' },
  challenge: true,
  realm: 'DiagramaServidores'
}));
```

**Ventajas:**
- ✅ Control de acceso
- ✅ Registro de quién accede

**Desventajas:**
- ⚠️ Requiere compartir credenciales
- ⚠️ Modificación de código

## 📊 Monitoreo de Acceso

### Ver IPs que accedieron recientemente

El servidor registra cada petición. Para ver las IPs:

```powershell
# Ver logs con IPs de clientes
cmd /c "pm2 logs diagrama-servidores --lines 100" | Select-String "API"
```

### Crear archivo de log personalizado

Edita `backend/src/controllers/dataController.js` para agregar:

```javascript
import { Logger } from '../utils/logger.js';

// En cada endpoint:
Logger.info(`Acceso desde ${req.ip} - Endpoint: ${req.path}`);
```

## 🔐 Mejores Prácticas

### Para Uso en Oficina (Recomendado Actual)
1. ✅ Dejar abierto en red local (sin autenticación)
2. ✅ Usar firewall de Windows si es necesario
3. ✅ Monitorear logs ocasionalmente
4. ✅ Comunicar la URL a usuarios autorizados

### Para Uso Personal
1. ✅ Cambiar a `localhost` solo
2. ✅ Sin necesidad de firewall

### Para Producción Crítica
1. ✅ Implementar autenticación
2. ✅ Usar HTTPS (certificado SSL)
3. ✅ Rate limiting (limitar peticiones por IP)
4. ✅ Logs detallados de acceso

## 🌍 Acceso desde Internet (NO Recomendado)

Si necesitas que sea accesible desde fuera de tu red local, requieres:

1. **Port Forwarding** en el router (redirigir puerto 3050 a tu IP local)
2. **IP Pública Estática** o servicio como DynDNS
3. **HTTPS** con certificado SSL (Let's Encrypt)
4. **Autenticación robusta**
5. **Firewall y seguridad adicional**

⚠️ **NO se recomienda exponer el servidor a Internet sin medidas de seguridad profesionales.**

## 📱 Acceso desde Dispositivos Móviles

Si quieres acceder desde tu celular o tablet en la misma red:

1. Conecta el dispositivo a la misma Wi-Fi (Grupo Danec)
2. Abre el navegador
3. Visita: `http://192.168.100.20:3050`

## 🔄 IP Dinámica vs Estática

### Si tu IP cambia frecuentemente:

**Opción 1: IP Estática Manual**
1. Configurar IP fija en Windows
2. Asegurarte de que no haya conflictos en la red

**Opción 2: Reserva DHCP**
1. Configurar en el router
2. Asignar siempre la misma IP a tu PC (por MAC address)

**Opción 3: mDNS (Avahi/Bonjour)**
```powershell
# Instalar módulo mDNS (opcional)
npm install mdns
```

Permite acceso por nombre: `http://diagrama-servidores.local:3050`

## 🆘 Solución de Problemas

### No puedo acceder desde otra PC

1. **Verificar firewall**:
```powershell
Get-NetFirewallRule -DisplayName "*3050*"
```

2. **Verificar que el servidor está escuchando en todas las interfaces**:
```powershell
Get-NetTCPConnection -LocalPort 3050 | Select-Object LocalAddress
```

Debe mostrar `0.0.0.0` o `::` (todas las interfaces).

3. **Ping a tu PC**:
```powershell
# Desde otra PC:
ping 192.168.100.20
```

4. **Verificar puerto abierto**:
```powershell
# Desde otra PC:
Test-NetConnection -ComputerName 192.168.100.20 -Port 3050
```

### El servidor está corriendo pero no responde

1. **Ver estado PM2**:
```powershell
cmd /c "pm2 status"
```

2. **Ver logs de error**:
```powershell
cmd /c "pm2 logs diagrama-servidores --err"
```

3. **Reiniciar servidor**:
```powershell
cmd /c "pm2 restart diagrama-servidores"
```

## 📋 Resumen de URLs

| Usuario | URL | Descripción |
|---------|-----|-------------|
| Tú (local) | `http://localhost:3050` | Acceso desde tu PC |
| Tú (IP) | `http://192.168.100.20:3050` | Acceso por IP (mismo resultado) |
| Compañeros | `http://192.168.100.20:3050` | Acceso desde otras PCs en la red |
| Móviles | `http://192.168.100.20:3050` | Desde celulares/tablets en Wi-Fi |

---

💡 **Consejo**: Comparte la URL `http://192.168.100.20:3050` con tus compañeros por email o chat interno para que puedan acceder al sistema de visualización de servidores.

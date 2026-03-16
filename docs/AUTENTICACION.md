# 🔐 Guía de Autenticación - Sistema de Diagramas de Servidores

## 📋 Tabla de Contenidos

1. [Introducción](#introducción)
2. [Usuarios por Defecto](#usuarios-por-defecto)
3. [Inicio de Sesión](#inicio-de-sesión)
4. [Roles y Permisos](#roles-y-permisos)
5. [Gestión de Usuarios](#gestión-de-usuarios)
6. [Cambiar Contraseñas](#cambiar-contraseñas)
7. [Cierre de Sesión](#cierre-de-sesión)
8. [Seguridad](#seguridad)
9. [Troubleshooting](#troubleshooting)

---

## 🎯 Introducción

El sistema implementa **autenticación con sesiones** para proteger el acceso a los datos de servidores. Características principales:

✅ **Login con usuario y contraseña**  
✅ **Sesiones persistentes** (24 horas)  
✅ **2 roles**: Admin (modificar) y Viewer (solo lectura)  
✅ **Contraseñas hasheadas** con bcrypt  
✅ **Redirección automática** si no estás autenticado  
✅ **Protección de APIs** y páginas  
✅ **Gestión de usuarios** por línea de comandos  

---

## 👥 Usuarios por Defecto

Al inicializar el sistema, se crean 2 usuarios:

### 🔑 Usuario Administrador

```
Usuario: admin
Contraseña: Admin2025!
Rol: admin
```

**Permisos**:
- ✅ Visualizar servidores físicos y virtuales
- ✅ Subir archivos Excel
- ✅ Configurar rutas de origen
- ✅ Recargar datos
- ✅ Acceso a todas las funcionalidades

### 👁️ Usuario Viewer

```
Usuario: viewer
Contraseña: Viewer2025!
Rol: viewer
```

**Permisos**:
- ✅ Visualizar servidores físicos y virtuales
- ❌ NO puede subir archivos
- ❌ NO puede configurar rutas
- ❌ NO puede recargar datos
- ✅ Solo lectura

---

## 🚪 Inicio de Sesión

### Acceder al Sistema

1. **Abrir navegador** en:
   ```
   http://localhost:3050
   ```
   O desde otro dispositivo en la red:
   ```
   http://192.168.100.20:3050
   ```

2. **Página de login aparece automáticamente**:
   - Si no estás autenticado, cualquier URL te redirige al login
   - Ejemplo: intentar ir a `/fisicos` → redirige a `/login`

3. **Ingresar credenciales**:
   - Usuario: `admin` o `viewer`
   - Contraseña: tu contraseña
   - Click en "Iniciar Sesión"

4. **Redirección automática**:
   - Login exitoso → Home del sistema
   - Credenciales incorrectas → Mensaje de error

### Duración de la Sesión

- **24 horas** de duración
- La sesión se mantiene aunque cierres el navegador
- Después de 24 horas, debes iniciar sesión nuevamente
- Se verifica la sesión cada 5 minutos automáticamente

---

## 🎭 Roles y Permisos

### Admin (Administrador)

| Acción | Permiso |
|--------|---------|
| Ver servidores físicos | ✅ Permitido |
| Ver servidores virtuales | ✅ Permitido |
| Subir archivo Excel | ✅ Permitido |
| Configurar ruta de origen | ✅ Permitido |
| Recargar datos manualmente | ✅ Permitido |
| Eliminar ruta de origen | ✅ Permitido |
| Acceder a todas las APIs | ✅ Permitido |

### Viewer (Solo Lectura)

| Acción | Permiso |
|--------|---------|
| Ver servidores físicos | ✅ Permitido |
| Ver servidores virtuales | ✅ Permitido |
| Subir archivo Excel | ❌ Bloqueado |
| Configurar ruta de origen | ❌ Bloqueado |
| Recargar datos manualmente | ❌ Bloqueado |
| Eliminar ruta de origen | ❌ Bloqueado |
| Modificar datos | ❌ Bloqueado |

### Diferencias Visuales

**Usuario Admin** verá:
- Botón "Subir Excel" visible
- Botones de configuración habilitados
- Todas las opciones del menú

**Usuario Viewer** verá:
- Botón "Subir Excel" oculto
- Solo opciones de visualización
- Mensaje de "Sin permisos" si intenta acciones de admin

---

## 🛠️ Gestión de Usuarios

### Ver Usuarios Actuales

```powershell
node scripts/manage-users.js list
```

**Salida**:
```
═══════════════════════════════════════════════════════
📋 USUARIOS REGISTRADOS
═══════════════════════════════════════════════════════

1. admin
   Nombre: Administrador
   Rol: admin

2. viewer
   Nombre: Usuario Lectura
   Rol: viewer

Total: 2 usuario(s)
═══════════════════════════════════════════════════════
```

### Agregar Nuevo Usuario

```powershell
node scripts/manage-users.js add --username USUARIO --password CONTRASEÑA --role ROLE --name "Nombre Completo"
```

**Parámetros**:
- `--username`: Nombre de usuario (requerido, único)
- `--password`: Contraseña (requerido, mínimo 8 caracteres recomendado)
- `--role`: `admin` o `viewer` (requerido)
- `--name`: Nombre completo (opcional, por defecto = username)

**Ejemplos**:

```powershell
# Agregar administrador
node scripts/manage-users.js add --username carlos --password Carlos2025! --role admin --name "Carlos Pérez"

# Agregar viewer
node scripts/manage-users.js add --username maria --password Maria2025! --role viewer --name "María García"

# Usuario sin nombre completo
node scripts/manage-users.js add --username tech1 --password Tech123! --role viewer
```

**Salida exitosa**:
```
✅ Usuario creado exitosamente:
   Username: carlos
   Nombre: Carlos Pérez
   Rol: admin
   Contraseña: ******** (hasheada con bcrypt)
```

### Eliminar Usuario

```powershell
node scripts/manage-users.js remove --username USUARIO
```

**Ejemplo**:
```powershell
node scripts/manage-users.js remove --username carlos
```

**Salida**:
```
✅ Usuario 'carlos' eliminado exitosamente
```

**⚠️ Advertencia**: No puedes recuperar un usuario eliminado. Deberás crearlo nuevamente.

---

## 🔑 Cambiar Contraseñas

### Cambiar Contraseña de Cualquier Usuario

```powershell
node scripts/manage-users.js change-password --username USUARIO --password NUEVA_CONTRASEÑA
```

**Ejemplos**:

```powershell
# Cambiar contraseña de admin
node scripts/manage-users.js change-password --username admin --password MiNuevaContraseña2025!

# Cambiar contraseña de viewer
node scripts/manage-users.js change-password --username viewer --password NuevoViewer2025!

# Cambiar contraseña de usuario personalizado
node scripts/manage-users.js change-password --username carlos --password NuevoCarlos123!
```

**Salida**:
```
✅ Contraseña de 'admin' actualizada
```

### Recomendaciones de Contraseñas

✅ **Buenas prácticas**:
- Mínimo 8 caracteres
- Incluir mayúsculas y minúsculas
- Incluir números
- Incluir símbolos especiales (!@#$%^&*)
- No usar contraseñas obvias

❌ **Evitar**:
- Contraseñas cortas (< 8 caracteres)
- Contraseñas comunes (123456, password, admin)
- Información personal (fecha de nacimiento, nombre)
- Misma contraseña para todos los usuarios

**Ejemplos de buenas contraseñas**:
```
GrupoDanec2025!
Servidores$2025
Admin@Danec2025
```

---

## 🚪 Cierre de Sesión

### Desde la Interfaz

1. **Botón "Cerrar Sesión"** visible en todas las páginas
2. Click en el botón
3. Sesión destruida automáticamente
4. Redirige al login

### Automático

La sesión se cierra automáticamente si:
- Pasan 24 horas desde el login
- El servidor se reinicia (sesiones en memoria se pierden)
- Se detecta sesión expirada (verificación cada 5 minutos)

---

## 🔒 Seguridad

### Contraseñas Hasheadas

Las contraseñas **NO se guardan en texto plano**:

```javascript
// ❌ NUNCA guardamos así:
"password": "Admin2025!"

// ✅ Se guardan hasheadas con bcrypt:
"password": "$2b$10$xK2.wNZYq8RfEoO8h9.4vu8FxYz9..."
```

**Características de bcrypt**:
- Algoritmo de hashing robusto
- Salt automático (protección contra rainbow tables)
- 10 rounds de hashing (lento para fuerza bruta)
- Irreversible (no se puede obtener contraseña original)

### Archivo users.json

**⚠️ IMPORTANTE**: El archivo `backend/config/users.json` contiene las contraseñas hasheadas.

**Protección**:
```
✅ Excluido de Git (.gitignore)
✅ Solo administrador del sistema puede ver
✅ Contraseñas hasheadas (no texto plano)
✅ Ubicación: backend/config/users.json
```

**NO subir a GitHub/repositorio público**:
- El archivo está en `.gitignore`
- Aunque las contraseñas estén hasheadas, exponer usernames es riesgo
- Mantener el archivo en el servidor únicamente

### Sesiones

**Configuración actual**:
```javascript
{
  secret: 'GrupoDanec-DiagramaServidores-2025-SecretKey',
  maxAge: 24 * 60 * 60 * 1000, // 24 horas
  httpOnly: true,              // No accesible desde JavaScript
  secure: false                // Cambiar a true con HTTPS
}
```

**Para producción con HTTPS**:
Editar `backend/server.js`:
```javascript
cookie: {
  secure: true  // Solo funciona con HTTPS
}
```

### Protección de Rutas

**Rutas públicas** (sin autenticación):
- `/login` - Página de login
- `/login-styles.css` - Estilos del login
- `/api/auth/login` - Endpoint de login
- `/api/auth/logout` - Endpoint de logout

**Rutas protegidas** (requieren login):
- `/` - Home
- `/fisicos` - Servidores físicos
- `/virtuales` - Servidores virtuales
- `/api/data` - Datos de servidores
- `/api/racks` - Información de racks
- Todas las demás rutas

**Rutas de admin** (requieren rol admin):
- `/api/upload` - Subir Excel
- `/api/reload` - Recargar datos
- `/api/source-path` (POST/DELETE) - Configurar rutas

---

## 🔧 Troubleshooting

### Problema: "Usuario o contraseña incorrectos"

**Causas**:
1. Usuario no existe
2. Contraseña incorrecta
3. Mayúsculas/minúsculas en contraseña

**Solución**:
```powershell
# Verificar que el usuario existe
node scripts/manage-users.js list

# Si existe, cambiar contraseña
node scripts/manage-users.js change-password --username admin --password Admin2025!

# Si no existe, crearlo
node scripts/manage-users.js init
```

---

### Problema: "No hay usuarios registrados"

**Causa**: Archivo `users.json` vacío o no existe

**Solución**:
```powershell
# Crear usuarios por defecto
node scripts/manage-users.js init
```

Esto crea:
- admin / Admin2025!
- viewer / Viewer2025!

---

### Problema: Sesión expira constantemente

**Causas**:
1. Servidor se reinicia frecuentemente
2. Sesiones en memoria (MemoryStore)

**Solución temporal**:
- Las sesiones se guardan en memoria
- Al reiniciar servidor, se pierden
- Esto es normal para desarrollo

**Solución permanente** (producción):
- Usar session store persistente (Redis, MongoDB)
- Editar `backend/server.js` para usar otro store

---

### Problema: No puedo subir Excel siendo admin

**Verificar**:
1. ¿Iniciaste sesión como admin?
2. ¿El botón "Subir Excel" está visible?

**Solución**:
```powershell
# Verificar tu usuario
# En navegador, abre consola (F12) y ejecuta:
console.log(window.currentUser);

# Debe mostrar:
# { username: "admin", role: "admin", ... }
```

Si muestra `viewer`, cierra sesión e inicia con admin.

---

### Problema: "Error al cargar usuario"

**Causa**: Sesión expirada o inválida

**Solución**:
1. Cerrar sesión (botón "Cerrar Sesión")
2. Volver a iniciar sesión
3. Si persiste, reiniciar servidor:
   ```powershell
   cmd /c "pm2 restart diagrama-servidores"
   ```

---

### Problema: Warning "MemoryStore is not designed for production"

**Explicación**:
- Es un warning normal
- Las sesiones se guardan en memoria
- Funciona bien para equipos pequeños
- Para producción grande, usar Redis o MongoDB

**Solución** (opcional, para producción):
```powershell
# Instalar connect-redis
npm install connect-redis redis

# Configurar en server.js
# (requiere servidor Redis corriendo)
```

Para desarrollo y equipos pequeños (< 20 usuarios), **ignorar este warning**.

---

## 📚 Comandos de Referencia Rápida

### Gestión de Usuarios

```powershell
# Listar usuarios
node scripts/manage-users.js list

# Crear usuarios por defecto
node scripts/manage-users.js init

# Agregar usuario
node scripts/manage-users.js add --username USER --password PASS --role ROLE --name "Nombre"

# Cambiar contraseña
node scripts/manage-users.js change-password --username USER --password NUEVA_PASS

# Eliminar usuario
node scripts/manage-users.js remove --username USER

# Ayuda
node scripts/manage-users.js help
```

### Gestión del Servidor

```powershell
# Ver estado
cmd /c "pm2 status"

# Ver logs
cmd /c "pm2 logs diagrama-servidores"

# Reiniciar servidor
cmd /c "pm2 restart diagrama-servidores"

# Guardar configuración
cmd /c "pm2 save"
```

---

## 🎯 Casos de Uso Comunes

### Caso 1: Nuevo Empleado en TI

**Crear usuario viewer**:
```powershell
node scripts/manage-users.js add --username jperez --password JuanPerez2025! --role viewer --name "Juan Pérez"
```

**Compartir credenciales**:
```
URL: http://192.168.100.20:3050
Usuario: jperez
Contraseña: JuanPerez2025!
Rol: Viewer (solo lectura)
```

---

### Caso 2: Promover Viewer a Admin

```powershell
# Eliminar usuario actual
node scripts/manage-users.js remove --username jperez

# Crear nuevamente como admin
node scripts/manage-users.js add --username jperez --password JuanPerez2025! --role admin --name "Juan Pérez"
```

**Nota**: No hay comando para cambiar rol directamente. Debes eliminar y recrear.

---

### Caso 3: Olvidé la Contraseña de Admin

```powershell
# Resetear contraseña de admin
node scripts/manage-users.js change-password --username admin --password NuevaClave2025!
```

---

### Caso 4: Necesito Muchos Usuarios Viewer

**Script batch** (crear varios):
```powershell
# crear-viewers.ps1
$usuarios = @(
    @{user="viewer1"; pass="Viewer1_2025!"; nombre="Usuario 1"},
    @{user="viewer2"; pass="Viewer2_2025!"; nombre="Usuario 2"},
    @{user="viewer3"; pass="Viewer3_2025!"; nombre="Usuario 3"}
)

foreach ($u in $usuarios) {
    node scripts/manage-users.js add --username $u.user --password $u.pass --role viewer --name $u.nombre
}
```

Ejecutar:
```powershell
.\crear-viewers.ps1
```

---

## 🔐 Mejores Prácticas

### ✅ Recomendaciones

1. **Cambiar contraseñas por defecto**:
   ```powershell
   node scripts/manage-users.js change-password --username admin --password TuContraseñaSegura2025!
   node scripts/manage-users.js change-password --username viewer --password OtraContraseñaSegura2025!
   ```

2. **Usar contraseñas robustas**:
   - Mínimo 12 caracteres
   - Mezcla de mayúsculas, minúsculas, números, símbolos
   - No reutilizar contraseñas

3. **Crear usuarios individuales**:
   - No compartir credenciales
   - Un usuario por persona
   - Facilita auditoría de accesos

4. **Roles apropiados**:
   - Solo dar rol admin a quienes lo necesiten
   - Mayoría de usuarios deben ser viewer
   - Revisar permisos periódicamente

5. **Backup de users.json**:
   ```powershell
   # Hacer backup
   Copy-Item backend\config\users.json backend\config\users.backup.json
   ```

6. **No subir a Git**:
   - Verificar que `.gitignore` excluye `users.json`
   - Nunca hacer commit del archivo de usuarios

---

## 📊 Arquitectura de Autenticación

### Flujo de Login

```
1. Usuario → /login
2. Ingresa credenciales
3. POST /api/auth/login
4. authService.validateUser()
5. bcrypt.compare(password, hash)
6. ✅ Válido → req.session.user = {...}
7. Redirige a /
8. requireAuth middleware verifica sesión
9. ✅ Autenticado → Acceso permitido
```

### Flujo de Protección de Rutas

```
1. Usuario → /fisicos
2. requireAuth middleware
3. ¿req.session.user existe?
   ├─ ✅ Sí → next() → Muestra página
   └─ ❌ No → redirect('/login')
```

### Flujo de Protección Admin

```
1. Usuario → POST /api/upload
2. requireAdmin middleware
3. ¿req.session.user.role === 'admin'?
   ├─ ✅ Sí → next() → Permite upload
   └─ ❌ No → 403 Forbidden
```

---

## 🔗 Referencias

- **Archivos de autenticación**:
  - `backend/src/services/authService.js` - Lógica de autenticación
  - `backend/src/middleware/authMiddleware.js` - Middleware de protección
  - `backend/src/controllers/authController.js` - Endpoints de login/logout
  - `backend/config/users.json` - Base de datos de usuarios
  - `scripts/manage-users.js` - CLI de gestión

- **Frontend**:
  - `frontend/public/login.html` - Página de login
  - `frontend/public/login-styles.css` - Estilos
  - `frontend/public/auth.js` - JavaScript de autenticación

- **Documentación relacionada**:
  - [README.md](../README.md) - Documentación principal
  - [SEGURIDAD-RED.md](./SEGURIDAD-RED.md) - Seguridad de red
  - [PM2-GUIA.md](./PM2-GUIA.md) - Gestión con PM2

---

**Última actualización**: 31 de octubre de 2025  
**Versión**: 0.3.0 (con autenticación completa)  
**Mantenedor**: Equipo TI - Grupo Danec

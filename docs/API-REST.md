# API REST - Sistema de Gestión de Servidores

**Versión:** 1.0.0  
**Fecha:** 21 de noviembre de 2025  
**Base URL:** `http://localhost:3050` o `http://192.168.100.20:3050`

---

## 📋 Tabla de Contenidos

1. [Autenticación](#autenticación)
2. [API de Servidores](#api-de-servidores)
3. [API de Racks](#api-de-racks)
4. [Impacto de servicios](#️-impacto-de-servicios)
5. [Telemetría de Monitoreo](#-telemetría-de-monitoreo)
6. [Eventos en Tiempo Real (SSE)](#eventos-en-tiempo-real-sse)
7. [Ejemplos de Uso](#ejemplos-de-uso)
8. [Códigos de Error](#códigos-de-error)

---

## 🔐 Autenticación

Todas las rutas (excepto `/login`) requieren autenticación mediante sesiones.

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "<CONTRASEÑA_SEGURA>"
}
```

**Respuesta exitosa:**
```json
{
  "ok": true,
  "user": {
    "username": "admin",
    "role": "admin",
    "name": "Administrador"
  }
}
```

### Logout

```http
POST /api/auth/logout
```

### Verificar Sesión

```http
GET /api/auth/session
```

---

## 🖥️ API de Servidores

### 📖 Listar Todos los Datos (Racks + Servidores)

```http
GET /api/data?type=fisicos
GET /api/data?type=virtuales
```

**Parámetros:**
- `type`: `fisicos` o `virtuales` (requerido)

**Respuesta:**
```json
{
  "racks": [
    {
      "name": "Rack 1",
      "servers": [...]
    }
  ],
  "servers": [
    {
      "id": "123",
      "nombre": "SERVIDOR-01",
      "ip": "192.168.1.10",
      "hostname": "srv01",
      "marca": "DELL",
      "modelo": "PowerEdge R740",
      "rack_norm": "Rack 1",
      "estado": "ACTIVO",
      "activo": "SI"
    }
  ],
  "meta": {
    "type": "fisicos",
    "source": "db",
    "updatedAt": "2025-11-21T10:30:00Z"
  }
}
```

---

### 📖 Listar Solo Servidores

```http
GET /api/servers?type=fisicos
GET /api/servers?type=virtuales
```

---

### ➕ Crear Servidor (Solo Admin)

```http
POST /api/servers
Content-Type: application/json

{
  "type": "fisicos",
  "nombre": "SERVIDOR-NUEVO",
  "rack_norm": "Rack 1",
  "ip": "192.168.1.50",
  "hostname": "srv-nuevo",
  "marca": "DELL",
  "modelo": "PowerEdge R740",
  "ram_gb": "64",
  "estado": "ACTIVO",
  "activo": "SI"
}
```

**Campos requeridos:**
- `type`: `fisicos` o `virtuales`
- `nombre`: Nombre del servidor
- `rack_norm`: Nombre del rack

**Campos opcionales:**
- `ip`, `hostname`, `usuario`, `marca`, `modelo`, `tipo`, `hardware`, `serie`
- `socket`, `no_por_socket`, `procesadores_logicos`, `ram_gb`
- `discos`, `datastore`, `conexion`, `software`, `so`
- `fecha_instalacion`, `fecha_mantenimiento`, `estado`
- `backup`, `fecha_backup`, `activo`

**Respuesta:**
```json
{
  "ok": true,
  "id": "145",
  "message": "Servidor creado exitosamente"
}
```

---

### ✏️ Actualizar Servidor (Solo Admin)

```http
PUT /api/servers/145
Content-Type: application/json

{
  "nombre": "SERVIDOR-ACTUALIZADO",
  "ip": "192.168.1.51",
  "ram_gb": "128",
  "estado": "MANTENIMIENTO"
}
```

**Nota:** Solo se actualizan los campos enviados.

**Respuesta:**
```json
{
  "ok": true,
  "message": "Servidor actualizado exitosamente"
}
```

---

### 🔄 Mover Servidor a Otro Rack (Solo Admin)

```http
PUT /api/servers/145/move
Content-Type: application/json

{
  "rack_norm": "Rack 2",
  "rack_raw": "RACK 2"
}
```

**Respuesta:**
```json
{
  "ok": true,
  "message": "Servidor movido a Rack 2 exitosamente"
}
```

---

### 🗑️ Eliminar Servidor (Solo Admin)

```http
DELETE /api/servers/145
```

**Respuesta:**
```json
{
  "ok": true,
  "message": "Servidor eliminado exitosamente"
}
```

---

## 🗄️ API de Racks

### 📖 Listar Racks

```http
GET /api/racks?type=fisicos
GET /api/racks?type=virtuales
```

**Respuesta:**
```json
[
  {
    "name": "Rack 1",
    "servers": []
  },
  {
    "name": "Rack 2",
    "servers": []
  }
]
```

---

### 📖 Detalle de un Rack

```http
GET /api/racks/1
```

**Respuesta:**
```json
{
  "rack": {
    "id": "1",
    "name": "Rack 1",
    "raw_name": "RACK 1",
    "created_at": "2025-01-15T10:00:00Z",
    "updated_at": "2025-01-15T10:00:00Z"
  },
  "servers": [
    {
      "id": "10",
      "nombre": "SERVIDOR-01",
      "ip": "192.168.1.10",
      ...
    }
  ],
  "serverCount": 5
}
```

---

### ➕ Crear Rack (Solo Admin)

```http
POST /api/racks
Content-Type: application/json

{
  "name": "Rack 5",
  "raw_name": "RACK 5"
}
```

**Campos requeridos:**
- `name`: Nombre del rack (debe ser único)

**Campos opcionales:**
- `raw_name`: Nombre original/raw del rack

**Respuesta:**
```json
{
  "ok": true,
  "id": "15",
  "name": "Rack 5",
  "message": "Rack creado exitosamente"
}
```

**Errores:**
```json
{
  "error": "Ya existe un rack con ese nombre"
}
```

---

### ✏️ Actualizar Rack (Solo Admin)

```http
PUT /api/racks/15
Content-Type: application/json

{
  "name": "Rack 5 - Centro de Datos",
  "raw_name": "RACK 5 CDC"
}
```

**Respuesta:**
```json
{
  "ok": true,
  "message": "Rack actualizado exitosamente"
}
```

---

### 🗑️ Eliminar Rack (Solo Admin)

```http
DELETE /api/racks/15
```

**Si el rack tiene servidores:**
```json
{
  "error": "El rack contiene servidores",
  "serverCount": 3,
  "message": "Use ?force=true para eliminar de todas formas (servidores quedarán sin rack)"
}
```

**Eliminar forzado (desvincular servidores):**
```http
DELETE /api/racks/15?force=true
```

**Respuesta exitosa:**
```json
{
  "ok": true,
  "message": "Rack eliminado exitosamente"
}
```

---

## ⚠️ Impacto de servicios

Qué le pasa a cada servicio (por ejemplo, JD Edwards) si cae uno de sus servidores. Lectura y simulación: cualquier usuario autenticado. Escritura: administradores (con el token CSRF de la sesión).

**Cómo se calcula una caída:**
1. Caen los servidores indicados (simulación) o los que Monitoreo tiene en `DOWN`/`DEGRADED` con el host habilitado (estado actual).
2. Cae también cada **VM** cuyo host físico cae. El host de una VM es el servidor físico cuyo nombre o hostname coincide con el campo Host de la VM, comparando solo letras y números.
3. Cada servicio toma el efecto más grave entre sus servidores caídos: `TOTAL` → `NO_FUNCIONA`, `PARCIAL` → `PARCIAL`, `SIN_DEFINIR` → `REVISAR`, `NINGUNO` (o nada caído) → `FUNCIONA`.

### 📖 Panorama

```http
GET /api/impacto
```

**Respuesta (200):**
```json
{
  "servers": [ { "id": "12", "type": "virtuales", "name": "APP-01", "ip": "10.0.0.12", "rack": "HOST-A", "application": "ERP", "status": "UP", "monitoring": { "hostId": "4", "status": "UP", "enabled": true, "changedAt": "..." } } ],
  "services": [ { "id": "1", "name": "ERP", "description": "...", "components": [ { "id": "3", "serverId": "12", "role": "Base de datos", "impact": "TOTAL", "impactDetail": "..." } ] } ],
  "hosts": { "12": "7" },
  "actual": { "servicios": [], "servidoresCaidos": [] },
  "generatedAt": "2026-11-26T15:00:00.000Z"
}
```
`hosts` relaciona cada VM con su host físico (id de la VM → id del host). `actual` tiene el mismo formato que la simulación, con las caídas reales de Monitoreo. `status` es `UNKNOWN` si el servidor no tiene host de monitoreo.

### 📖 Simular una caída

```http
GET /api/impacto/simular?ids=12,15
```
No modifica nada. Hasta 200 ids. **Respuesta (200):**
```json
{
  "simulados": ["12", "15"],
  "ignorados": [],
  "servicios": [
    {
      "serviceId": "1", "name": "ERP", "estado": "NO_FUNCIONA", "nivel": "TOTAL",
      "componentesCaidos": [
        { "id": "3", "serverId": "12", "role": "Base de datos", "impact": "TOTAL",
          "caida": { "motivo": "CAIDO", "por": null, "nivel": 0 } }
      ]
    }
  ],
  "servidoresCaidos": [ { "id": "12", "motivo": "CAIDO", "por": null, "nivel": 0 }, { "id": "20", "motivo": "HOST", "por": "12", "nivel": 1 } ]
}
```
`motivo`: `CAIDO` (indicado o caído en Monitoreo) o `HOST` (VM cuyo host `por` cayó). Sin `ids` o con un id no numérico: 400.

### 📖 Estado de monitoreo de cada servidor

```http
GET /api/impacto/servidores
```
Devuelve `{ "servers": [...] }` con el mismo formato que `servers` del panorama. Lo usan Servidores Físicos y Virtuales para los LED de estado.

### ➕ Servicios (Solo Admin)

```http
POST   /api/impacto/servicios        { "name": "JD Edwards", "description": "ERP" }  → 201 { "service": {...} }
PUT    /api/impacto/servicios/:id    { "name"?, "description"? }                       → 200 { "service": {...} }
DELETE /api/impacto/servicios/:id                                                     → 204
```
`name` es obligatorio, único (409 si se repite) y de hasta 120 caracteres; `description` hasta 1000. Eliminar un servicio elimina sus componentes; los servidores del inventario no se tocan.

### ➕ Servidores de un servicio (Solo Admin)

```http
POST /api/impacto/servicios/:id/componentes
{
  "serverId": "12",
  "role": "Base de datos",
  "impact": "TOTAL",
  "impactDetail": "Sin la base de datos ningún módulo funciona"
}
→ 201 { "component": {...} }

PUT    /api/impacto/componentes/:id   (solo los campos enviados; serverId no se puede cambiar) → 200 { "component": {...} }
DELETE /api/impacto/componentes/:id                                                         → 204
```
`impact`: `TOTAL`, `PARCIAL`, `NINGUNO` o `SIN_DEFINIR` (por defecto). `role` hasta 200 caracteres e `impactDetail` hasta 2000. El mismo servidor dos veces en un servicio: 409. Servidor o servicio inexistente: 404.

### Página

`GET /impacto` sirve la página (requiere sesión). Usa `/css/impacto.css` y `/js/paginas/impacto.js`.

---

## 📈 Telemetría de Monitoreo

Rutas de **solo lectura** para la vista en tiempo real de `/monitoring.html`. Requieren sesión (cualquier rol) y solo existen con el monitoreo habilitado (`MONITORING_ENABLED=1`). Las respuestas llevan `Cache-Control: no-store`. Cada punto de una serie es `[epoch_ms, latencia_ms | null, estado]`, en orden cronológico; `estado` es `ok`, `fail`, `timeout` o `degraded` y la latencia es `null` cuando no hubo respuesta.

### 📖 Estado de todos los hosts con su mini-serie

```http
GET /api/monitoring/telemetry/overview?points=24
```

| Parámetro | Tipo | Por defecto | Límites |
|---|---|---|---|
| `points` | entero | 24 | 5 – 60 (últimas ejecuciones de cada host dentro de las últimas 6 h) |

**Respuesta (200):**
```json
{
  "generatedAt": "2026-11-24T13:40:00.000Z",
  "points": 24,
  "hosts": [
    {
      "id": "12", "name": "srv-app-01", "ip": "10.0.0.11", "type": "fisico", "rack": "RACK-A1",
      "critical": true, "estado_actual": "UP", "estado_changed_at": "2026-11-24T13:02:11.000Z",
      "open_incidents": 0, "active_checks": 1,
      "serie": [[1795959540000, 12, "ok"], [1795959555000, null, "fail"]]
    }
  ]
}
```

Incluye los hosts habilitados (máximo 1000), ordenados por rack y nombre. `open_incidents` cuenta los incidentes abiertos o reconocidos. Para las máquinas virtuales, `rack` es su host o clúster.

### 📖 Serie por check y línea de tiempo de incidentes de un host

```http
GET /api/monitoring/telemetry/hosts/:id/series?minutes=60&limit=120
```

| Parámetro | Tipo | Por defecto | Límites |
|---|---|---|---|
| `id` | entero positivo | — | id del host |
| `minutes` | entero | 60 | 5 – 1440 (ventana de tiempo) |
| `limit` | entero | 120 | 10 – 300 (puntos por check, los más recientes) |

**Respuesta (200):**
```json
{
  "generatedAt": "2026-11-24T13:40:00.000Z",
  "minutes": 60,
  "limit": 120,
  "host": { "id": "12", "name": "srv-app-01", "ip": "10.0.0.11", "type": "fisico", "rack": "RACK-A1", "critical": true, "enabled": true, "estado_actual": "UP", "estado_changed_at": "2026-11-24T13:02:11.000Z" },
  "checks": [
    { "id": "31", "kind": "tcp", "label": "TCP 443", "enabled": true, "frequency_sec": 60, "points": [[1795959540000, 12, "ok"]] }
  ],
  "incidents": [
    { "id": "7", "state": "ack", "severity": "critical", "summary": "Sin respuesta en el puerto 443", "opened_at": "...", "last_event_at": "...", "closed_at": null, "ack_at": "..." }
  ]
}
```

`label` describe el destino del check (`ICMP`, `TCP <puerto>`, `HTTP <ruta>`) sin exponer su configuración completa. Se devuelven hasta 20 checks y los 20 incidentes más recientes.

**Errores:** `400` si `id`, `minutes`, `limit` o `points` no son enteros dentro de sus límites; `401` sin sesión; `404` si el host no existe.

### Ventana de mantenimiento de un host (Solo Admin)

```http
POST /api/monitoring/hosts/:id/maintenance
Content-Type: application/json

{ "duration_hours": 2, "comment": "Cambio de disco" }
```

`duration_hours` debe ser un número mayor que 0 y como máximo 168; `comment` es opcional (hasta 500 caracteres). `DELETE /api/monitoring/hosts/:id/maintenance` termina la ventana y el estado del host se vuelve a evaluar.

---

## 📡 Eventos en Tiempo Real (SSE)

### Conectar a SSE

```javascript
const eventSource = new EventSource('/events');

eventSource.addEventListener('init', (e) => {
  console.log('Conexión establecida:', e.data);
});

eventSource.addEventListener('update', (e) => {
  console.log('Datos actualizados');
  // Recargar datos
  loadServers();
});

eventSource.onerror = (error) => {
  console.error('Error SSE:', error);
};
```

**Eventos disponibles:**
- `init`: Conexión inicial establecida
- `update`: Datos modificados (crear/actualizar/eliminar servidor o rack)

---

## 💡 Ejemplos de Uso

### Ejemplo 1: Crear un Servidor Físico

```javascript
async function createServer() {
  const response = await fetch('/api/servers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'fisicos',
      nombre: 'DB-SERVER-01',
      rack_norm: 'Rack 1',
      ip: '192.168.1.100',
      hostname: 'db-srv-01',
      marca: 'HP',
      modelo: 'ProLiant DL380',
      ram_gb: '256',
      discos: '8x 2TB SAS',
      so: 'Windows Server 2022',
      estado: 'ACTIVO',
      activo: 'SI'
    })
  });

  const data = await response.json();
  console.log('Servidor creado:', data);
}
```

---

### Ejemplo 2: Mover Servidor Entre Racks

```javascript
async function moveServerToRack(serverId, newRack) {
  const response = await fetch(`/api/servers/${serverId}/move`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      rack_norm: newRack
    })
  });

  if (response.ok) {
    console.log('Servidor movido exitosamente');
  }
}

// Uso
moveServerToRack(145, 'Rack 3');
```

---

### Ejemplo 3: Actualizar Estado de Servidor

```javascript
async function setServerMaintenance(serverId) {
  const response = await fetch(`/api/servers/${serverId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      estado: 'MANTENIMIENTO',
      fecha_mantenimiento: new Date().toISOString().split('T')[0]
    })
  });

  return await response.json();
}
```

---

### Ejemplo 4: Crear Rack y Agregar Servidores

```javascript
async function setupNewRack() {
  // 1. Crear rack
  const rackResponse = await fetch('/api/racks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Rack 10',
      raw_name: 'RACK 10 - VIRTUALIZACION'
    })
  });

  const rack = await rackResponse.json();
  console.log('Rack creado:', rack);

  // 2. Agregar servidores al rack
  const servers = [
    { nombre: 'ESXI-01', ip: '192.168.1.201' },
    { nombre: 'ESXI-02', ip: '192.168.1.202' },
    { nombre: 'ESXI-03', ip: '192.168.1.203' }
  ];

  for (const srv of servers) {
    await fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'fisicos',
        nombre: srv.nombre,
        ip: srv.ip,
        rack_norm: 'Rack 10',
        marca: 'DELL',
        modelo: 'PowerEdge R740',
        estado: 'ACTIVO',
        activo: 'SI'
      })
    });
  }

  console.log('Rack configurado con servidores');
}
```

---

### Ejemplo 5: Buscar y Actualizar Servidores por IP

```javascript
async function updateServersBySubnet(subnet) {
  // 1. Obtener todos los servidores
  const response = await fetch('/api/servers?type=fisicos');
  const servers = await response.json();

  // 2. Filtrar por subnet
  const matching = servers.filter(s => 
    s.ip && s.ip.startsWith(subnet)
  );

  // 3. Actualizar cada uno
  for (const server of matching) {
    await fetch(`/api/servers/${server.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conexion: 'Switch Core 01'
      })
    });
  }

  console.log(`Actualizados ${matching.length} servidores`);
}

// Actualizar todos los servidores en 192.168.1.x
updateServersBySubnet('192.168.1.');
```

---

## ❌ Códigos de Error

### Errores de Autenticación

| Código | Mensaje | Descripción |
|--------|---------|-------------|
| 401 | No autenticado | Sesión expirada o no iniciada |
| 403 | Acceso denegado | Usuario no tiene permisos (no es admin) |

---

### Errores de Validación

| Código | Mensaje | Descripción |
|--------|---------|-------------|
| 400 | Campos requeridos: ... | Faltan campos obligatorios |
| 400 | No hay campos para actualizar | PUT sin datos |
| 404 | Servidor no encontrado | ID de servidor inválido |
| 404 | Rack no encontrado | ID de rack inválido |
| 409 | Ya existe un rack con ese nombre | Nombre de rack duplicado |

---

### Errores del Cuerpo de la Petición (todas las rutas `/api`)

| Código | `code` | Mensaje | Descripción |
|--------|--------|---------|-------------|
| 400 | `VALIDATION_ERROR` | El cuerpo de la petición no es un JSON válido | El cuerpo enviado con `Content-Type: application/json` no se puede interpretar |
| 413 | `PAYLOAD_TOO_LARGE` | El cuerpo de la petición supera el tamaño máximo permitido | Cuerpo JSON de más de 256 KB |

---

### Errores de Servidor

| Código | Mensaje | Descripción |
|--------|---------|-------------|
| 500 | Error interno del servidor | Error en base de datos o lógica |

**Formato de error** (respuestas generadas por el manejador central de errores):
```json
{
  "error": "Descripción del error",
  "code": "VALIDATION_ERROR",
  "requestId": "…"
}
```

`code` puede ser `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409), `PAYLOAD_TOO_LARGE` (413) o `INTERNAL_ERROR` (500), entre otros. Los mensajes no incluyen detalles internos de la base de datos. `requestId` puede ser `null`.

---

## 🔒 Permisos

### Rutas Públicas (Sin Autenticación)
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`

### Rutas Autenticadas (Cualquier Usuario)
- `GET /api/data`
- `GET /api/racks`
- `GET /api/servers`
- `GET /api/racks/:id`
- `GET /api/impacto`
- `GET /api/impacto/simular`
- `GET /api/impacto/servidores`
- `GET /events`

### Rutas de Administrador (Solo Admin)
- `POST /api/servers` (Crear servidor)
- `PUT /api/servers/:id` (Actualizar servidor)
- `DELETE /api/servers/:id` (Eliminar servidor)
- `PUT /api/servers/:id/move` (Mover servidor)
- `POST /api/racks` (Crear rack)
- `PUT /api/racks/:id` (Actualizar rack)
- `DELETE /api/racks/:id` (Eliminar rack)
- `POST /api/impacto/servicios`, `PUT|DELETE /api/impacto/servicios/:id` (Servicios)
- `POST /api/impacto/servicios/:id/componentes`, `PUT|DELETE /api/impacto/componentes/:id` (Servidores de un servicio)

---

## 📊 Estructura de Datos

### Objeto Servidor

```typescript
{
  id: string,                    // ID único
  type: 'fisicos' | 'virtuales', // Tipo de servidor
  identity_key: string,          // Clave única (ip/hostname/nombre)
  rack_id: number,               // ID del rack
  rack_norm: string,             // Nombre normalizado del rack
  rack_raw: string,              // Nombre original del rack
  server_label: string,          // Etiqueta del servidor
  nombre: string,                // Nombre del servidor
  ip: string,                    // Dirección IP
  hostname: string,              // Hostname
  usuario: string,               // Usuario administrador
  marca: string,                 // Marca (DELL, HP, etc.)
  modelo: string,                // Modelo
  tipo: string,                  // Tipo adicional
  hardware: string,              // Hardware
  serie: string,                 // Número de serie
  socket: string,                // Sockets del procesador
  no_por_socket: string,         // Núcleos por socket
  procesadores_logicos: string,  // Total de procesadores lógicos
  ram_gb: string,                // RAM en GB
  discos: string,                // Configuración de discos
  datastore: string,             // Datastore (virtuales)
  conexion: string,              // Conexión de red
  software: string,              // Software instalado
  so: string,                    // Sistema operativo
  fecha_instalacion: string,     // Fecha de instalación
  fecha_mantenimiento: string,   // Fecha de mantenimiento
  estado: string,                // Estado (ACTIVO, MANTENIMIENTO, etc.)
  backup: string,                // Configuración de backup
  fecha_backup: string,          // Fecha de último backup
  activo: string,                // SI/NO
  created_at: string,            // Fecha de creación
  updated_at: string             // Fecha de actualización
}
```

### Objeto Rack

```typescript
{
  id: string,          // ID único
  name: string,        // Nombre del rack
  raw_name: string,    // Nombre original
  created_at: string,  // Fecha de creación
  updated_at: string   // Fecha de actualización
}
```

### Objeto Componente de servicio

```typescript
{
  id: string,
  serviceId: string,               // Servicio al que pertenece
  serverId: string,                // Servidor del inventario
  role: string | null,             // Función en el servicio (máx. 200)
  impact: string,                  // TOTAL | PARCIAL | NINGUNO | SIN_DEFINIR
  impactDetail: string | null,     // Qué deja de funcionar (máx. 2000)
  createdBy: string | null,
  createdAt: string,
  updatedAt: string
}
```

---

## 🚀 Tips y Mejores Prácticas

### 1. Siempre Validar Respuestas

```javascript
const response = await fetch('/api/servers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(serverData)
});

if (!response.ok) {
  const error = await response.json();
  console.error('Error:', error.error, error.details);
  return;
}

const result = await response.json();
console.log('Éxito:', result);
```

---

### 2. Usar SSE para Actualizaciones Automáticas

```javascript
// Conectar una vez al iniciar
const eventSource = new EventSource('/events');

eventSource.addEventListener('update', () => {
  // Recargar datos automáticamente
  refreshServers();
});
```

---

### 3. Batch Operations

```javascript
async function createMultipleServers(servers) {
  const results = [];
  
  for (const server of servers) {
    try {
      const response = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(server)
      });
      
      const result = await response.json();
      results.push({ success: true, ...result });
    } catch (error) {
      results.push({ success: false, error: error.message });
    }
  }
  
  return results;
}
```

---

### 4. Manejo de Errores de Sesión

```javascript
async function apiCall(url, options) {
  const response = await fetch(url, options);
  
  if (response.status === 401) {
    // Sesión expirada, redirigir al login
    window.location.href = '/login';
    return null;
  }
  
  if (response.status === 403) {
    alert('No tienes permisos para esta acción');
    return null;
  }
  
  return response.json();
}
```

---

## 📚 Referencias

- [Documentación Principal](../README.md)
- [Autenticación](./AUTENTICACION.md)
- [Migración a PostgreSQL](./MIGRACION-POSTGRESQL.md)
- [Arquitectura del Sistema](./ARQUITECTURA.md)

---

**Última actualización:** 26 de noviembre de 2026 (API de Impacto de servicios)
**Versión API:** 1.0.0  
**Mantenedor:** Equipo TI - Grupo Danec

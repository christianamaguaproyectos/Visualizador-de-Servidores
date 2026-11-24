# API REST - Sistema de Gestión de Servidores

**Versión:** 1.0.0  
**Fecha:** 21 de noviembre de 2025  
**Base URL:** `http://localhost:3050` o `http://192.168.100.20:3050`

---

## 📋 Tabla de Contenidos

1. [Autenticación](#autenticación)
2. [API de Servidores](#api-de-servidores)
3. [API de Racks](#api-de-racks)
4. [Dependencias y Topología](#-dependencias-y-topología)
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

## 🔗 Dependencias y Topología

API del Mapa de Dependencias: relaciones "servidor A **depende de** servidor B" entre servidores físicos y virtuales, vistas (diagramas) guardadas con la posición de cada nodo, e impacto en cascada calculado con el estado de Monitoreo.

> Todos los nombres, IPs y usuarios de los ejemplos de esta sección son **ficticios** (`srv-app-01`, `10.0.0.11`, ...).

**Convenciones comunes**

- **Semántica de la flecha:** `source ──depende de──▶ target`. `source` es el servidor dependiente (cliente) y `target` el proveedor que necesita para funcionar. Si `target` cae, el impacto se propaga hacia `source` (en sentido inverso a la flecha).
- **IDs como string:** todos los IDs (servidores, dependencias, vistas, hosts) se devuelven como **string de dígitos** (`"12"`), para no perder precisión con IDs grandes. En las peticiones se aceptan como número entero o como string de dígitos; cualquier otro valor (texto, negativo, decimal, notación científica) responde `400 "<campo> debe ser un número entero positivo"`.
- **Roles:** lectura (`GET`) para cualquier usuario autenticado; escritura (`POST`/`PUT`/`DELETE`) solo administradores. Un usuario `viewer` recibe `403 {"error":"Acceso denegado"}`.
- **CSRF:** toda escritura debe enviar la cabecera `X-CSRF-Token` (token obtenido con `GET /api/auth/csrf`), igual que el resto de la API. Sin token o con token inválido: `403` con `code: "CSRF_INVALID"`.
- **Textos:** se eliminan los caracteres invisibles y de control de dirección de texto de Unicode. En los textos de una línea (`label`, `name`, `protocol`, `slug`) los caracteres de control se sustituyen por espacio; en `notes` y `description` se eliminan, conservando saltos de línea y tabuladores. Después se recortan los espacios de los extremos. Un texto que supera el máximo **se rechaza con 400** (no se trunca). Un texto vacío equivale a `null`.
- **Los textos se devuelven tal como se guardaron** (sin escapar HTML): el cliente debe mostrarlos con `textContent` o con escape HTML.
- **Parámetros de query repetidos** (`?view=1&view=2`) responden `400`.
- **Formato de error:** `{ "error": "<mensaje>", "code": "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | ..., "requestId": "..." }` (ver [Códigos de Error](#-códigos-de-error)).

**Valores permitidos (enums)** — no distinguen mayúsculas (`"api"` se guarda como `"API"`):

| Campo | Valores | Por defecto |
|-------|---------|-------------|
| `dependencyType` | `DATABASE`, `NETWORK`, `STORAGE`, `API`, `AUTH`, `HYPERVISOR`, `BACKUP`, `DNS_INFRA`, `SERVICE` | `SERVICE` |
| `criticality` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` | `CRITICAL` |
| `cascadeStatus` (respuesta) | `DIRECT_IMPACT` (nivel 1), `TRANSITIVE_IMPACT` (nivel ≥ 2), `NONE` | — |
| `downSource` (respuesta) | `MONITORING`, `SIMULATED`, `BOTH`, `null` | — |

**Resumen de endpoints**

| Método | Ruta | Rol | Respuesta correcta |
|--------|------|-----|--------------------|
| GET | `/api/topology/graph` | autenticado | `200 { view, nodes, edges, impact, generatedAt }` |
| GET | `/api/topology/views` | autenticado | `200 { views }` |
| POST | `/api/topology/views` | admin | `201 { view }` |
| PUT | `/api/topology/views/:id` | admin | `200 { view }` |
| PUT | `/api/topology/views/:id/positions` | admin | `200 { ok, viewId, saved, removed, viewport }` |
| DELETE | `/api/topology/views/:id` | admin | `200 { ok, id }` |
| GET | `/api/dependencies` | autenticado | `200 { dependencies }` |
| GET | `/api/dependencies/server/:id/impact` | autenticado | `200 { server, dependsOnDirect, ... }` |
| POST | `/api/dependencies` | admin | `201 { dependency, dependencies, inverse }` |
| PUT | `/api/dependencies/:id` | admin | `200 { dependency }` |
| DELETE | `/api/dependencies/:id` | admin | `200 { ok, id }` |

---

### 📖 Grafo de Topología con Impacto en Cascada

```http
GET /api/topology/graph
GET /api/topology/graph?view=general&includeIsolated=true
GET /api/topology/graph?view=3&simulateDownIds=13,27
```

**Parámetros (query, todos opcionales):**
- `view`: ID numérico o `slug` de la vista. Sin `view` se usa la vista predeterminada (`isDefault`) o, si ninguna lo está, la de slug `general`. Las posiciones (`position`) se leen de esa vista.
- `includeIsolated`: `true`/`false` (también `1`/`0`, `yes`/`si`/`no`). Por defecto `false`: se devuelven solo los servidores que tienen alguna dependencia, los que tienen posición guardada en la vista y los simulados. Con `true` se devuelven todos los servidores del inventario.
- `simulateDownIds`: lista de IDs separados por comas (máximo **200**; los duplicados se ignoran). Simula la caída de esos servidores **sin modificar la base de datos ni generar alertas**. Los IDs que no existen no dan error: se informan en `impact.ignoredSimulateIds`.

**Cómo se calcula el impacto:**
- **Servidores caídos (raíces):** los servidores cuyo host de monitoreo está **habilitado** y en estado `DOWN` o `DEGRADED`, más los de `simulateDownIds`. `MAINTENANCE`, `UNKNOWN` y los hosts deshabilitados no se consideran caídos.
- Desde cada servidor caído se recorre el grafo de proveedor a dependientes llevando registro de los nodos visitados, por lo que los ciclos (`1 ↔ 2`) se recorren sin bucles. Distancia 1 = `DIRECT_IMPACT`; distancia ≥ 2 = `TRANSITIVE_IMPACT`.
- `impactedByServers`: todos los servidores caídos que afectan al nodo. `impactPath`: ruta más corta `[caído, ..., nodo]` (en empate, la del servidor caído de menor ID). Un servidor caído no se marca como afectado por sí mismo, pero sí por otro servidor caído del que dependa.
- **Relación servidor ↔ host de monitoreo:** la misma regla que usa la sincronización del módulo de Monitoreo. Primero por nombre exacto del servidor; si no hay coincidencia, por la primera IP del campo `ip` del servidor (el texto hasta el primer espacio, salto de línea, `,` o `;`) si tiene forma IPv4. Si varios hosts coinciden se toma el de menor ID. La IP `0.0.0.0` (marcador de "sin IP") nunca se usa para relacionar. Un servidor sin host tiene `status: "UNKNOWN"` y `monitoring: null`.
- Vista, servidores, hosts y dependencias se leen en una misma instantánea consistente de la base de datos.

**Respuesta** (ejemplo con `srv-app-01 → vm-api-02`, `vm-api-02 → srv-app-01`, `vm-api-02 → srv-db-03` y `simulateDownIds=3`):
```json
{
  "view": {
    "id": "1",
    "name": "Mapa General",
    "slug": "general",
    "description": "Vista general con todos los servidores y sus dependencias",
    "isDefault": true,
    "viewport": { "zoom": 1, "x": 0, "y": 0 },
    "layoutMode": "manual",
    "filterConfig": {},
    "nodeCount": 3,
    "createdBy": null,
    "createdAt": "2026-11-18T14:02:11.204Z",
    "updatedAt": "2026-11-19T09:15:40.871Z"
  },
  "nodes": [
    {
      "id": "1",
      "type": "fisicos",
      "name": "srv-app-01",
      "ip": "10.0.0.11",
      "hostname": "srv-app-01.ejemplo.local",
      "rack": "Rack A",
      "estadoInventario": "ACTIVO",
      "activo": "SI",
      "status": "UP",
      "monitoring": { "hostId": "4", "status": "UP", "enabled": true, "changedAt": "2026-11-19T08:00:02.000Z" },
      "position": { "x": 100.5, "y": -20, "pinned": true, "collapsed": false },
      "dependsOnServerCount": 1,
      "dependentServerCount": 1,
      "dependsOnRelationCount": 1,
      "dependentRelationCount": 1,
      "isDown": false,
      "downSource": null,
      "cascadeStatus": "TRANSITIVE_IMPACT",
      "impactLevel": 2,
      "impactedByServers": ["3"],
      "impactPath": ["3", "2", "1"]
    },
    {
      "id": "2",
      "type": "virtuales",
      "name": "vm-api-02",
      "ip": "10.0.0.12",
      "hostname": "vm-api-02.ejemplo.local",
      "rack": "Cluster A",
      "estadoInventario": "ACTIVO",
      "activo": "SI",
      "status": "UNKNOWN",
      "monitoring": null,
      "position": { "x": 300, "y": 40, "pinned": true, "collapsed": false },
      "dependsOnServerCount": 2,
      "dependentServerCount": 1,
      "dependsOnRelationCount": 2,
      "dependentRelationCount": 1,
      "isDown": false,
      "downSource": null,
      "cascadeStatus": "DIRECT_IMPACT",
      "impactLevel": 1,
      "impactedByServers": ["3"],
      "impactPath": ["3", "2"]
    },
    {
      "id": "3",
      "type": "fisicos",
      "name": "srv-db-03",
      "ip": "10.0.0.13",
      "hostname": "srv-db-03.ejemplo.local",
      "rack": "Rack A",
      "estadoInventario": "ACTIVO",
      "activo": "SI",
      "status": "UP",
      "monitoring": { "hostId": "6", "status": "UP", "enabled": true, "changedAt": "2026-11-19T08:00:02.000Z" },
      "position": { "x": 500, "y": 80, "pinned": true, "collapsed": false },
      "dependsOnServerCount": 0,
      "dependentServerCount": 1,
      "dependsOnRelationCount": 0,
      "dependentRelationCount": 1,
      "isDown": true,
      "downSource": "SIMULATED",
      "cascadeStatus": "NONE",
      "impactLevel": 0,
      "impactedByServers": [],
      "impactPath": []
    }
  ],
  "edges": [
    {
      "id": "10",
      "source": "1",
      "target": "2",
      "sourceName": "srv-app-01",
      "targetName": "vm-api-02",
      "dependencyType": "API",
      "criticality": "CRITICAL",
      "port": 8443,
      "protocol": "HTTPS",
      "label": "API de aplicación",
      "notes": null,
      "createdBy": "admin",
      "createdAt": "2026-11-18T15:20:00.000Z",
      "updatedAt": "2026-11-18T15:20:00.000Z",
      "isBidirectionalPair": true,
      "carriesImpact": true
    }
  ],
  "impact": {
    "rootIds": ["3"],
    "monitoringDownIds": [],
    "simulatedDownIds": ["3"],
    "ignoredSimulateIds": [],
    "directCount": 1,
    "transitiveCount": 1,
    "totalImpacted": 2
  },
  "generatedAt": "2026-11-19T09:20:00.123Z"
}
```
*(En `edges` se muestra solo una de las tres aristas.)*

**Campos de cada nodo:**
- `type`: `fisicos` o `virtuales`. `estadoInventario` y `activo` son los valores del inventario.
- `status`: estado de monitoreo del host relacionado (`UP`, `DOWN`, `DEGRADED`, `MAINTENANCE`, `UNKNOWN`) o `UNKNOWN` si no tiene host.
- `position`: `{ x, y, pinned, collapsed }` en la vista, o `null` si el servidor no se ha colocado en ella.
- `dependsOnServerCount` / `dependentServerCount`: número de servidores **distintos** de los que depende / que dependen de él. `dependsOnRelationCount` / `dependentRelationCount`: número de **relaciones** (dos dependencias de distinto tipo con el mismo servidor cuentan como 1 servidor y 2 relaciones).
- `isDown`: el servidor está caído (en monitoreo o simulado); `downSource` indica el origen.
- `impactLevel`: `0` si no está afectado; si lo está, la distancia al servidor caído más cercano.

**Campos de cada arista:** los del [Objeto Dependencia](#objeto-dependencia) más:
- `isBidirectionalPair`: `true` si también existe la arista inversa (`target → source`) de cualquier tipo. Permite dibujar separadas las dos flechas de un ciclo `1 ↔ 2`.
- `carriesImpact`: `true` si el `target` está caído o afectado y el `source` está afectado, es decir, el impacto se propaga por esa flecha.

**Totales de `impact`:** `rootIds` (todos los caídos), `monitoringDownIds` (caídos según monitoreo), `simulatedDownIds` (simulados que existen), `ignoredSimulateIds`, `directCount`, `transitiveCount` y `totalImpacted` (afectados, sin contar los caídos).

**Notas:**
- `view` es `null` solo si no existe ninguna vista (en ese caso todas las `position` son `null`).
- El tamaño de la respuesta crece con la longitud de `impactPath` de cada nodo afectado.

**Errores:**

| Código | Causa |
|--------|-------|
| 400 | `view` no es un ID ni un slug válido; `includeIsolated` no es booleano; `simulateDownIds` con IDs inválidos o más de 200; parámetro repetido |
| 404 | La vista indicada (ID o slug) no existe |

---

### 📖 Listar Vistas

```http
GET /api/topology/views
```

Devuelve todas las vistas: primero la predeterminada y luego por nombre.

**Respuesta:**
```json
{
  "views": [
    {
      "id": "1",
      "name": "Mapa General",
      "slug": "general",
      "description": "Vista general con todos los servidores y sus dependencias",
      "isDefault": true,
      "viewport": { "zoom": 1, "x": 0, "y": 0 },
      "layoutMode": "manual",
      "filterConfig": {},
      "nodeCount": 3,
      "createdBy": null,
      "createdAt": "2026-11-18T14:02:11.204Z",
      "updatedAt": "2026-11-19T09:15:40.871Z"
    },
    {
      "id": "2",
      "name": "Servicio de Ejemplo",
      "slug": "servicio-de-ejemplo",
      "description": "Servidores del servicio de ejemplo",
      "isDefault": false,
      "viewport": { "zoom": 1.25, "x": -40, "y": 15 },
      "layoutMode": "manual",
      "filterConfig": { "type": "fisicos" },
      "nodeCount": 0,
      "createdBy": "admin",
      "createdAt": "2026-11-19T09:30:00.000Z",
      "updatedAt": "2026-11-19T09:30:00.000Z"
    }
  ]
}
```

`nodeCount` es el número de servidores con posición guardada en la vista. En una instalación nueva existe la vista `Mapa General` (slug `general`) marcada como predeterminada.

---

### ➕ Crear Vista (Solo Admin)

```http
POST /api/topology/views
Content-Type: application/json
X-CSRF-Token: <token>

{
  "name": "Servicio de Ejemplo",
  "description": "Servidores del servicio de ejemplo",
  "isDefault": false,
  "layoutMode": "manual",
  "filterConfig": { "type": "fisicos" },
  "viewport": { "zoom": 1.25, "x": -40, "y": 15 }
}
```

**Campos:**
- `name` (string, **obligatorio**, máx. 120, único).
- `slug` (string, opcional, máx. 120, único, solo minúsculas, números y guiones simples: `^[a-z0-9]+(-[a-z0-9]+)*$`). Si no se envía se genera desde `name` sin acentos, en minúsculas y con guiones (`"Servicio Núcleo"` → `"servicio-nucleo"`).
- `description` (string multilínea, opcional, máx. 1000).
- `isDefault` / `is_default` (booleano, opcional). Si es `true`, la vista que era predeterminada deja de serlo en la misma operación.
- `layoutMode` / `layout_mode` (string, opcional, máx. 30, solo `[a-z0-9_-]`; por defecto `manual`).
- `filterConfig` / `filter_config` (objeto JSON, opcional, máx. 8 KB serializado; se guarda tal cual para uso del cliente).
- `viewport` (objeto `{ zoom, x, y }`, opcional): `zoom` entre 0,05 y 10; `x` e `y` entre -10 000 000 y 10 000 000. Por defecto `{ zoom: 1, x: 0, y: 0 }`.

**Respuesta (`201`):** `{ "view": { ...objeto vista como en el listado... } }`

**Errores:**

| Código | Causa |
|--------|-------|
| 400 | `name` ausente o vacío; longitudes o formatos inválidos; `filterConfig` no es objeto o supera 8 KB; `viewport` fuera de rango |
| 409 | `Ya existe una vista con ese nombre` / `Ya existe una vista con ese slug` |
| 409 | `Otra operación cambió la vista predeterminada al mismo tiempo; reintente` (excepcional: los cambios simultáneos de vista predeterminada se aplican uno tras otro) |

---

### ✏️ Actualizar Vista (Solo Admin)

```http
PUT /api/topology/views/2
Content-Type: application/json
X-CSRF-Token: <token>

{
  "name": "Servicio de Ejemplo (sede 2)",
  "isDefault": true,
  "viewport": { "zoom": 0.8 }
}
```

**Actualización parcial:** solo se modifican los campos enviados (mismos campos y límites que al crear; si se envía `slug`, no puede ir vacío). En `viewport` se puede enviar solo `zoom`, `x` o `y`.

**Vista predeterminada:**
- `isDefault: true` marca esta vista como predeterminada y desmarca la anterior en la misma operación.
- `isDefault: false` sobre la vista que **es** la predeterminada responde `400` ("Para cambiar la vista por defecto, marque otra vista como predeterminada"): siempre debe haber una.

**Respuesta (`200`):** `{ "view": { ... } }`

**Errores:** `400` (ID inválido, cuerpo sin campos, datos inválidos, quitar `isDefault` a la predeterminada), `404` (la vista no existe), `409` (nombre o slug duplicado).

---

### 💾 Guardar Posiciones de una Vista (Solo Admin)

```http
PUT /api/topology/views/1/positions
Content-Type: application/json
X-CSRF-Token: <token>

{
  "positions": [
    { "serverId": "1", "x": 100.5, "y": -20 },
    { "serverId": "2", "x": 300, "y": 40, "pinned": false },
    { "serverId": "3", "x": 500, "y": 80, "collapsed": true }
  ],
  "viewport": { "zoom": 1.5, "x": 10, "y": 20 },
  "removeServerIds": ["7"]
}
```

Guarda en una sola operación atómica las posiciones (crea o actualiza la de cada servidor), quita nodos de la vista y actualiza el viewport.

**Campos** (debe venir al menos uno de los tres):
- `positions` (array, máximo **1000** elementos por petición): `{ serverId | server_id, x, y, pinned?, collapsed? }`.
  - `x`, `y`: números finitos entre -1 000 000 y 1 000 000.
  - `pinned` (booleano): **por defecto `true`**. Un nodo colocado a mano queda fijado. Quien coloque nodos automáticamente (auto-ordenar) debe enviar `pinned: false` de forma explícita, para que un reordenamiento posterior pueda moverlos y respete los fijados a mano.
  - `collapsed` (booleano): por defecto `false`.
  - Si un `serverId` aparece varias veces, gana la última posición.
- `removeServerIds` / `remove_server_ids` (array de IDs, máximo 1000): quita esos servidores de la vista (borra su posición; el servidor y sus dependencias no se modifican). Los IDs sin posición se ignoran.
- `viewport` (`{ zoom?, x?, y? }`, mismos límites que en las vistas): solo se actualizan los valores enviados.

**Regla:** un mismo servidor no puede estar a la vez en `positions` y en `removeServerIds` → `400`.

**Respuesta (`200`):**
```json
{
  "ok": true,
  "viewId": "1",
  "saved": 3,
  "removed": 1,
  "viewport": { "zoom": 1.5, "x": 10, "y": 20 }
}
```

**Errores:**

| Código | Causa |
|--------|-------|
| 400 | `positions` no es array o supera 1000 elementos; coordenadas no finitas o fuera de rango; `pinned`/`collapsed` no booleanos; `viewport` inválido; mismo servidor en `positions` y `removeServerIds`; cuerpo sin `positions`, `removeServerIds` ni `viewport` |
| 404 | La vista no existe; `Servidor con ID 99 no encontrado` / `No se encontraron los servidores con ID 98, 99` (servidores de `positions`) |

---

### 🗑️ Eliminar Vista (Solo Admin)

```http
DELETE /api/topology/views/2
X-CSRF-Token: <token>
```

Elimina la vista y sus posiciones (los servidores y las dependencias no se modifican).

**Respuesta (`200`):**
```json
{ "ok": true, "id": "2" }
```

**Errores:** `400` (ID inválido), `404` (la vista no existe), `409` `No se puede eliminar la vista por defecto` (primero hay que marcar otra como predeterminada).

---

### 📖 Listar Dependencias

```http
GET /api/dependencies
GET /api/dependencies?serverId=2
```

**Parámetros:**
- `serverId` (opcional): solo las dependencias en las que ese servidor es origen **o** destino. Un servidor inexistente devuelve una lista vacía.

**Respuesta:**
```json
{
  "dependencies": [
    {
      "id": "10",
      "source": "1",
      "target": "2",
      "sourceName": "srv-app-01",
      "targetName": "vm-api-02",
      "dependencyType": "API",
      "criticality": "CRITICAL",
      "port": 8443,
      "protocol": "HTTPS",
      "label": "API de aplicación",
      "notes": null,
      "createdBy": "admin",
      "createdAt": "2026-11-18T15:20:00.000Z",
      "updatedAt": "2026-11-18T15:20:00.000Z"
    }
  ]
}
```

**Errores:** `400` (`serverId` inválido o repetido).

---

### 📖 Análisis de Impacto de un Servidor

```http
GET /api/dependencies/server/3/impact
```

Responde "¿de qué depende este servidor?" y "¿qué se ve afectado si este servidor cae?", independientemente de su estado actual de monitoreo.

**Respuesta** (servidor `3` del ejemplo anterior):
```json
{
  "server": {
    "id": "3",
    "type": "fisicos",
    "name": "srv-db-03",
    "ip": "10.0.0.13",
    "hostname": "srv-db-03.ejemplo.local",
    "rack": "Rack A",
    "estadoInventario": "ACTIVO",
    "activo": "SI",
    "status": "UP",
    "monitoring": { "hostId": "6", "status": "UP", "enabled": true, "changedAt": "2026-11-19T08:00:02.000Z" }
  },
  "dependsOnDirect": [],
  "dependsOnTransitive": [],
  "dependentsDirect": [
    {
      "id": "2",
      "type": "virtuales",
      "name": "vm-api-02",
      "ip": "10.0.0.12",
      "hostname": "vm-api-02.ejemplo.local",
      "rack": "Cluster A",
      "estadoInventario": "ACTIVO",
      "activo": "SI",
      "status": "UNKNOWN",
      "monitoring": null,
      "depth": 1,
      "dependencies": [
        {
          "id": "12",
          "source": "2",
          "target": "3",
          "sourceName": "vm-api-02",
          "targetName": "srv-db-03",
          "dependencyType": "DATABASE",
          "criticality": "CRITICAL",
          "port": 5432,
          "protocol": "TCP",
          "label": null,
          "notes": null,
          "createdBy": "admin",
          "createdAt": "2026-11-18T15:22:00.000Z",
          "updatedAt": "2026-11-18T15:22:00.000Z"
        }
      ]
    }
  ],
  "dependentsTransitive": [
    {
      "id": "1",
      "type": "fisicos",
      "name": "srv-app-01",
      "ip": "10.0.0.11",
      "hostname": "srv-app-01.ejemplo.local",
      "rack": "Rack A",
      "estadoInventario": "ACTIVO",
      "activo": "SI",
      "status": "UP",
      "monitoring": { "hostId": "4", "status": "UP", "enabled": true, "changedAt": "2026-11-19T08:00:02.000Z" },
      "depth": 2,
      "path": ["3", "2", "1"]
    }
  ],
  "totalAffected": 2,
  "cycles": [],
  "cyclesTruncated": false
}
```

**Campos:**
- `dependsOnDirect` / `dependentsDirect`: resumen de cada servidor vecino con `depth: 1` y `dependencies`, las relaciones concretas entre ambos (puede haber varias de distinto tipo), con su `id` para editarlas o eliminarlas.
- `dependsOnTransitive` / `dependentsTransitive`: **solo profundidad ≥ 2** (los directos no se repiten), con `depth` y `path` (ruta más corta desde este servidor).
- `totalAffected`: número total de servidores afectados si este cae (directos + transitivos).
- `cycles`: ciclos **en los que participa este servidor**, como lista cerrada de IDs. Para el servidor `1` del ejemplo: `[["1", "2", "1"]]`. Para el `3` es `[]`: no forma parte del ciclo `1 ↔ 2` aunque sus dependientes sí (el recorrido lo atraviesa sin bucles). Se devuelven como máximo 50 ciclos; si se alcanza el límite de la búsqueda, `cyclesTruncated` es `true`.

**Errores:** `400` (ID inválido), `404` (el servidor no existe).

---

### ➕ Crear Dependencia (Solo Admin)

```http
POST /api/dependencies
Content-Type: application/json
X-CSRF-Token: <token>

{
  "sourceServerId": "1",
  "targetServerId": "2",
  "dependencyType": "API",
  "criticality": "CRITICAL",
  "port": 8443,
  "protocol": "HTTPS",
  "label": "API de aplicación",
  "notes": "Llamadas síncronas del módulo de ejemplo",
  "bidirectional": true
}
```

**Campos** (se aceptan en camelCase o snake_case):
- `sourceServerId` / `source_server_id` (**obligatorio**): servidor que depende.
- `targetServerId` / `target_server_id` (**obligatorio**): servidor proveedor. Debe ser distinto del origen.
- `dependencyType` / `dependency_type` (enum, por defecto `SERVICE`).
- `criticality` (enum, por defecto `CRITICAL`).
- `port` (entero 1–65535, como número o string de dígitos; opcional).
- `protocol` (string, máx. 20, solo letras, números y `. _ + -`; ej. `TCP`, `HTTPS`, `NFS`, `iSCSI`).
- `label` (string, máx. 120).
- `notes` (string multilínea, máx. 2000).
- `bidirectional` / `mutual` (booleano, por defecto `false`): crea también la relación inversa (`target → source`, con los mismos datos) en la misma operación.

El autor (`createdBy`) se toma del usuario de la sesión.

**Respuesta (`201`)** del ejemplo, con `"bidirectional": true`:
```json
{
  "dependency": { "id": "10", "source": "1", "target": "2", "dependencyType": "API", "...": "..." },
  "dependencies": [
    { "id": "10", "source": "1", "target": "2", "...": "..." },
    { "id": "11", "source": "2", "target": "1", "...": "..." }
  ],
  "inverse": {
    "created": true,
    "dependency": { "id": "11", "source": "2", "target": "1", "...": "..." }
  }
}
```
*(Cada objeto es un [Objeto Dependencia](#objeto-dependencia) completo; aquí se abrevia.)*

- `dependency`: la relación pedida (`source → target`).
- `dependencies`: **solo** las relaciones creadas en esta petición (1 o 2).
- `inverse`: `null` si no se pidió `bidirectional`; `{ "created": true, "dependency": {...} }` si se creó la inversa; `{ "created": false, "dependency": {...la existente...} }` si la inversa del mismo tipo ya existía (se conserva sin cambios y no es un error).

**Errores:**

| Código | Causa |
|--------|-------|
| 400 | Falta `sourceServerId` o `targetServerId`; IDs inválidos; `Un servidor no puede depender de sí mismo`; enum, puerto, protocolo o longitud inválidos; `bidirectional` no booleano |
| 404 | `Servidor con ID 999 no encontrado` / `No se encontraron los servidores con ID 998, 999` |
| 409 | `Ya existe una dependencia de ese tipo entre esos servidores` (mismo origen, destino y tipo). Sí se permiten `1 → 2` y `2 → 1`, y varias relaciones de distinto tipo entre el mismo par |

---

### ✏️ Actualizar Dependencia (Solo Admin)

```http
PUT /api/dependencies/10
Content-Type: application/json
X-CSRF-Token: <token>

{
  "criticality": "HIGH",
  "port": null,
  "label": "API de aplicación (v2)"
}
```

**Actualización parcial:** se aceptan los mismos campos que al crear, excepto `bidirectional`; solo se modifican los enviados. `port`, `protocol`, `label` y `notes` se borran enviando `null`. También se pueden cambiar `sourceServerId` y `targetServerId`.

**Respuesta (`200`):** `{ "dependency": { ...Objeto Dependencia actualizado... } }`

**Errores:** `400` (ID inválido, cuerpo sin campos, datos inválidos, el cambio deja origen = destino), `404` (la dependencia o alguno de los servidores no existe), `409` (el cambio duplica otra relación existente).

---

### 🗑️ Eliminar Dependencia (Solo Admin)

```http
DELETE /api/dependencies/10
X-CSRF-Token: <token>
```

**Respuesta (`200`):**
```json
{ "ok": true, "id": "10" }
```

**Errores:** `400` (ID inválido), `404` (la dependencia no existe).

> Al eliminar un servidor del inventario se eliminan también sus dependencias (como origen y como destino) y sus posiciones en todas las vistas.

### Página del mapa y recursos de la vista 3D

No son endpoints de datos, pero también requieren sesión:

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/dependencias` | Página del Mapa de Dependencias (`dependencies.html`). Sin sesión redirige al login. Parámetros opcionales: `vista=<slug>`, `modo=3d` o `modo=2d` y `focus=<serverId>` (selecciona y centra ese servidor; lo usa **Abrir en el mapa** del detalle de servidor). |
| GET | `/vendor/three/three.module.js` | three.js (r170) auto-alojado desde el paquete npm `three`. |
| GET | `/vendor/three/addons/controls/OrbitControls.js` | Controles de cámara de la vista 3D. |
| GET | `/vendor/three/addons/renderers/CSS2DRenderer.js` | Etiquetas HTML de la vista 3D. |

- `/vendor/three` sirve **solo** esos tres módulos (lista cerrada); cualquier otra ruta bajo `/vendor/three` responde `404`. Los módulos se entregan como `text/javascript` con `ETag` (`304` si no cambiaron) y con el especificador `'three'` ya reescrito a `/vendor/three/three.module.js`, así el navegador los carga sin CDN ni *import map*, compatible con la CSP (`script-src 'self'`).

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
- `GET /api/topology/graph`
- `GET /api/topology/views`
- `GET /api/dependencies`
- `GET /api/dependencies/server/:id/impact`
- `GET /events`

### Rutas de Administrador (Solo Admin)
- `POST /api/servers` (Crear servidor)
- `PUT /api/servers/:id` (Actualizar servidor)
- `DELETE /api/servers/:id` (Eliminar servidor)
- `PUT /api/servers/:id/move` (Mover servidor)
- `POST /api/racks` (Crear rack)
- `PUT /api/racks/:id` (Actualizar rack)
- `DELETE /api/racks/:id` (Eliminar rack)
- `POST /api/topology/views` (Crear vista de topología)
- `PUT /api/topology/views/:id` (Actualizar vista)
- `PUT /api/topology/views/:id/positions` (Guardar posiciones y viewport)
- `DELETE /api/topology/views/:id` (Eliminar vista)
- `POST /api/dependencies` (Crear dependencia)
- `PUT /api/dependencies/:id` (Actualizar dependencia)
- `DELETE /api/dependencies/:id` (Eliminar dependencia)

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

### Objeto Dependencia

```typescript
{
  id: string,               // ID de la dependencia
  source: string,           // ID del servidor que depende (cliente)
  target: string,           // ID del servidor del que depende (proveedor)
  sourceName: string,       // Nombre del servidor origen
  targetName: string,       // Nombre del servidor destino
  dependencyType: string,   // DATABASE | NETWORK | STORAGE | API | AUTH | HYPERVISOR | BACKUP | DNS_INFRA | SERVICE
  criticality: string,      // CRITICAL | HIGH | MEDIUM | LOW
  port: number | null,      // 1-65535
  protocol: string | null,  // TCP, HTTPS, NFS, ...
  label: string | null,     // Etiqueta corta (máx. 120)
  notes: string | null,     // Notas (máx. 2000)
  createdBy: string | null, // Usuario que la creó
  createdAt: string,        // Fecha de creación (ISO 8601)
  updatedAt: string         // Fecha de actualización (ISO 8601)
}
```

### Objeto Vista de Topología

```typescript
{
  id: string,
  name: string,                            // Único (máx. 120)
  slug: string,                            // Único, minúsculas/números/guiones
  description: string | null,
  isDefault: boolean,                      // Solo una vista es la predeterminada
  viewport: { zoom: number, x: number, y: number },
  layoutMode: string,                      // 'manual' por defecto
  filterConfig: object,                    // Configuración libre del cliente (máx. 8 KB)
  nodeCount: number,                       // Servidores con posición en la vista
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

**Última actualización:** 19 de noviembre de 2026 (API de Dependencias y Topología)  
**Versión API:** 1.0.0  
**Mantenedor:** Equipo TI - Grupo Danec

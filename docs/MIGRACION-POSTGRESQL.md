# Migración Completa a PostgreSQL

**Fecha**: 21 de noviembre de 2025  
**Versión**: 0.3.0  
**Estado**: ✅ Completado

---

## 📋 Resumen

El sistema ha sido **migrado completamente a PostgreSQL** como fuente única de datos, eliminando la dependencia de archivos Excel para la operación normal.

---

## 🎯 Objetivos Alcanzados

### ✅ **Antes (Sistema Híbrido)**
- Excel como fuente primaria
- Caché en memoria (RAM)
- File watchers para detectar cambios en Excel
- Sincronización manual a BD

### ✅ **Después (PostgreSQL Puro)**
- PostgreSQL como fuente única de verdad
- Sin caché en memoria
- Sin file watchers activos
- Excel solo para importación manual

---

## 🔄 Cambios Realizados

### **1. Server.js - Eliminación de Inicialización de Caché**

**Antes:**
```javascript
_initializeCache() {
  const tipos = ['fisicos', 'virtuales'];
  tipos.forEach(type => {
    const data = excelParserService.parseExcelByType(type);
    cacheService.set(type, data);
  });
  Logger.success('Caché inicializado con datos de Excel');
}
```

**Después:**
```javascript
_initializeCache() {
  Logger.info('Modo PostgreSQL: Caché deshabilitado, datos desde BD');
}
```

---

### **2. Eliminación de File Watchers**

**Antes:**
```javascript
_setupFileWatchers() {
  tipos.forEach(type => {
    const excelPath = configManager.getExcelPath(type);
    fileWatcherService.setWatcher(type, excelPath);
  });
}
```

**Después:**
```javascript
_setupFileWatchers() {
  Logger.info('Modo PostgreSQL: File watchers deshabilitados');
}
```

---

### **3. DataController - Uso Exclusivo de PostgreSQL**

**Antes:**
```javascript
getData(req, res) {
  const useDb = process.env.USE_DB === '1';
  if (!useDb) {
    return res.json(cacheService.get(type));
  }
  // Query PostgreSQL...
}
```

**Después:**
```javascript
getData(req, res) {
  // Siempre usa PostgreSQL
  withClient(async (client) => {
    const { rows: servers } = await client.query(
      'SELECT * FROM inventory.servers WHERE type = $1',
      [typeEnum]
    );
    // ...
  });
}
```

---

### **4. UploadController - Sincronización Automática**

**Funcionalidad actualizada:**
- Al subir un Excel, se parsea y **sincroniza automáticamente a PostgreSQL**
- Usa UPSERT (INSERT ... ON CONFLICT DO UPDATE)
- Mantiene histórico en BD

```javascript
async uploadFile(req, res) {
  const data = excelParserService.parseExcelByType(type);
  
  // Sincronizar a PostgreSQL
  await withClient(async (client) => {
    for (const s of servers) {
      // Upsert rack
      // Upsert server
    }
  });
  
  res.json({ 
    ok: true, 
    serversCount: servers.length,
    message: 'Archivo procesado y sincronizado a PostgreSQL'
  });
}
```

---

### **5. Endpoint /api/reload - Sincronización Manual**

**Nueva funcionalidad:**
```bash
POST /api/reload?type=fisicos
```

- Lee Excel configurado
- Sincroniza a PostgreSQL
- Notifica clientes SSE
- Retorna conteo de servidores

---

## 📊 Estructura de Base de Datos

### **Esquema: `inventory`**

#### **Tabla: `racks`**
```sql
CREATE TABLE inventory.racks (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  raw_name    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

#### **Tabla: `servers`**
```sql
CREATE TABLE inventory.servers (
  id                      BIGSERIAL PRIMARY KEY,
  type                    server_type_enum NOT NULL, -- fisicos | virtuales
  identity_key            TEXT NOT NULL,
  rack_id                 BIGINT REFERENCES racks(id),
  rack_norm               TEXT,
  rack_raw                TEXT,
  server_label            TEXT,
  nombre                  TEXT,
  ip                      TEXT,
  hostname                TEXT,
  usuario                 TEXT,
  marca                   TEXT,
  modelo                  TEXT,
  tipo                    TEXT,
  hardware                TEXT,
  serie                   TEXT,
  -- ... más columnas
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (type, identity_key)
);
```

---

## 🔧 Configuración

### **Variables de Entorno (.env)**

**Eliminadas:**
```env
USE_DB=1  # Ya no es necesaria
```

**Requeridas:**
```env
POSTGRES_URL=postgres://mon_user:password@localhost:5432/monitoring
MONITORING_ENABLED=1
```

---

## 🚀 Flujo de Datos Actual

### **1. Al Iniciar el Servidor**

```
1. Cargar usuarios (users.json)
2. Cargar configuración (config.json)
3. ❌ NO inicializar caché
4. ❌ NO configurar file watchers
5. ✅ Conectar a PostgreSQL
6. ✅ Iniciar scheduler de monitoreo
7. ✅ Servidor escuchando en puerto 3050
```

---

### **2. Cuando un Cliente Solicita Datos**

```
GET /api/data?type=fisicos

↓

DataController.getData()
  ↓
  withClient(async (client) => {
    ↓
    SELECT * FROM inventory.servers 
    WHERE type = 'fisicos'
    ↓
    Mapear resultados a JSON
    ↓
    res.json({ racks: [...], servers: [...] })
  })
```

**Fuente de datos:** PostgreSQL (100%)

---

### **3. Cuando se Sube un Archivo Excel**

```
POST /api/upload?type=fisicos
Body: FormData con archivo .xlsx

↓

1. Guardar archivo en uploads/
2. Actualizar config.json (ruta del Excel)
3. Parsear Excel → JSON
4. Para cada servidor:
   a. UPSERT rack en PostgreSQL
   b. UPSERT server en PostgreSQL
5. Notificar clientes SSE
6. Retornar: { ok: true, serversCount: 42 }
```

---

### **4. Sincronización Manual (Reload)**

```
POST /api/reload?type=fisicos

↓

1. Leer Excel desde ruta configurada
2. Parsear Excel → JSON
3. Para cada servidor:
   a. UPSERT rack en PostgreSQL
   b. UPSERT server en PostgreSQL
4. Notificar clientes SSE
5. Retornar: { ok: true, message: '...' }
```

---

## 📈 Ventajas de la Migración

### ✅ **Rendimiento**
- No consume RAM para caché
- Consultas SQL optimizadas con índices
- Escalabilidad horizontal (PostgreSQL puede crecer)

### ✅ **Confiabilidad**
- Datos persistentes (no se pierden al reiniciar)
- Transacciones ACID
- Backup y recuperación con herramientas estándar

### ✅ **Consistencia**
- Una sola fuente de verdad
- No hay desincronización caché ↔ BD
- Cambios visibles inmediatamente

### ✅ **Mantenibilidad**
- Código más simple (sin lógica de caché)
- Menos servicios activos (sin file watchers)
- Más fácil de debuggear

---

## 🔄 Migración de Datos Existentes

### **Si necesitas importar datos de Excel a PostgreSQL:**

```bash
# Opción 1: Script de importación completo
node scripts/import/ingestInventoryFromExcel.js

# Opción 2: Endpoint de reload (requiere autenticación admin)
POST http://localhost:3050/api/reload?type=all

# Opción 3: Subir archivo Excel desde la UI
# → Ir a la interfaz web
# → Login como admin
# → Subir archivo Excel
# → Se sincroniza automáticamente
```

---

## 📊 Verificación Post-Migración

### **1. Verificar Datos en BD**

```bash
node scripts/monitoring/verifyInventoryCounts.js
```

**Salida esperada:**
```
Inventario -> racks: 14 servers: 144
```

---

### **2. Verificar API**

```bash
# Obtener servidores físicos
curl http://localhost:3050/api/data?type=fisicos

# Obtener racks
curl http://localhost:3050/api/racks?type=fisicos

# Obtener solo servidores
curl http://localhost:3050/api/servers?type=virtuales
```

---

### **3. Verificar Logs del Servidor**

Al iniciar, deberías ver:
```
✅ Configuración cargada
ℹ️  Modo PostgreSQL: Caché deshabilitado, datos desde BD
ℹ️  Modo PostgreSQL: File watchers deshabilitados
ℹ️  Modo PostgreSQL: Callbacks de watchers deshabilitados
✅ Servidor iniciado en http://localhost:3050
```

**NO deberías ver:**
```
❌ "Caché inicializado con datos de Excel"
❌ "Watcher configurado para fisicos: ..."
```

---

## 🛠️ Mantenimiento

### **Actualizar Datos desde Excel**

**Opción 1: UI (Recomendado)**
1. Login como `admin`
2. Ir a configuración
3. Subir nuevo archivo Excel
4. Se sincroniza automáticamente

**Opción 2: API**
```bash
curl -X POST http://localhost:3050/api/reload?type=fisicos \
  -H "Cookie: connect.sid=..."
```

**Opción 3: Script**
```bash
node scripts/import/ingestInventoryFromExcel.js
```

---

### **Backup de Base de Datos**

```bash
# Backup completo
pg_dump -h localhost -U mon_user -d monitoring > backup_$(date +%Y%m%d).sql

# Backup solo del esquema inventory
pg_dump -h localhost -U mon_user -d monitoring -n inventory > backup_inventory.sql

# Restaurar
psql -h localhost -U mon_user -d monitoring < backup_20251121.sql
```

---

## 🔍 Troubleshooting

### **Problema: No se ven datos en el frontend**

**Diagnóstico:**
```bash
# 1. Verificar que PostgreSQL está corriendo
psql -h localhost -U mon_user -d monitoring -c "SELECT COUNT(*) FROM inventory.servers;"

# 2. Verificar variable POSTGRES_URL
cat .env | grep POSTGRES_URL

# 3. Verificar logs del servidor
# Buscar errores de conexión a BD
```

**Solución:**
```bash
# Si la BD está vacía, importar datos
node scripts/import/ingestInventoryFromExcel.js
```

---

### **Problema: Error "Cannot find module 'cacheService'"**

**Causa:** Importaciones antiguas que ya no se usan

**Solución:** Verificar que todos los controllers importan desde `../config/db.js` en lugar de `cacheService`

---

### **Problema: Datos desactualizados**

**Causa:** Excel cambió pero no se sincronizó a BD

**Solución:**
```bash
# Sincronizar manualmente
POST /api/reload?type=all
```

---

## 📝 Checklist de Migración

- [x] Eliminar inicialización de caché
- [x] Eliminar file watchers
- [x] Actualizar dataController para usar solo PostgreSQL
- [x] Actualizar uploadController con sincronización automática
- [x] Actualizar sourceController
- [x] Actualizar endpoint /api/reload
- [x] Eliminar variable USE_DB de .env
- [x] Probar inicio del servidor
- [x] Verificar datos en BD
- [x] Documentar cambios

---

## 🎯 Próximos Pasos

### **Opcional: Optimizaciones**

1. **Índices adicionales:**
```sql
CREATE INDEX servers_nombre_idx ON inventory.servers(nombre);
CREATE INDEX servers_activo_idx ON inventory.servers(activo);
```

2. **Vista materializada para racks populares:**
```sql
CREATE MATERIALIZED VIEW inventory.rack_stats AS
SELECT rack_id, COUNT(*) as server_count
FROM inventory.servers
GROUP BY rack_id;
```

3. **Particionamiento por tipo:**
```sql
-- Separar físicos y virtuales en particiones
```

---

## 📚 Referencias

- [Schema SQL](../scripts/sql/schema.inventory.sql)
- [Script de Importación](../scripts/import/ingestInventoryFromExcel.js)
- [Verificación de Inventario](../scripts/monitoring/verifyInventoryCounts.js)
- [Arquitectura del Sistema](./ARQUITECTURA.md)

---

**Última actualización:** 21 de noviembre de 2025  
**Autor:** Equipo TI - Grupo Danec  
**Versión del sistema:** 0.3.0 (PostgreSQL Migration)

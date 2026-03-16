# Guía de Usuario - Gestión Web de Servidores

## Descripción General

El sistema ahora permite gestionar completamente el inventario de servidores y racks directamente desde la interfaz web, sin necesidad de archivos Excel.

## Características Principales

### ✅ Gestión de Servidores
- **Crear** nuevos servidores con un formulario completo
- **Editar** servidores existentes desde el detalle de cada rack
- **Eliminar** servidores con confirmación
- **Mover** servidores entre racks

### ✅ Gestión de Racks/Hosts
- **Crear** nuevos racks (físicos) o hosts (virtuales)
- **Visualizar** detalles de cada rack
- Los racks se eliminan automáticamente si quedan vacíos

---

## Cómo Usar

### 1. Agregar un Servidor

**Desde la Vista de Racks Físicos:**
1. Haz clic en el botón **"➕ Agregar Servidor"** en el header
2. Completa el formulario:
   - **Nombre** (requerido): ej. `WEB-SERVER-01`
   - **Rack** (requerido): Selecciona el rack donde se instalará
   - **IP**: Dirección IP del servidor
   - **Hostname**: Nombre de host
   - **Marca**: Dell, HP, etc.
   - **Modelo**: PowerEdge R740, ProLiant DL380, etc.
   - **RAM (GB)**: Cantidad de memoria RAM
   - **Sistema Operativo**: Windows Server 2022, Ubuntu 20.04, etc.
   - **Estado**: ACTIVO, MANTENIMIENTO, INACTIVO, BACKUP
3. Haz clic en **"Guardar"**

**Desde la Vista de Servidores Virtuales:**
1. Haz clic en el botón **"➕ Agregar VM"**
2. El proceso es idéntico al de servidores físicos
3. En el campo **Rack**, selecciona el host ESXi donde se creará la VM

### 2. Editar un Servidor

1. Navega a la vista de detalle de un rack (haz clic en cualquier rack)
2. En la lista de servidores, busca el servidor que deseas editar
3. Haz clic en el botón **✏️** (editar)
4. Se abrirá el formulario con los datos actuales del servidor
5. Modifica los campos que necesites
6. Haz clic en **"Guardar"**

### 3. Eliminar un Servidor

1. Navega a la vista de detalle de un rack
2. En la lista de servidores, busca el servidor que deseas eliminar
3. Haz clic en el botón **🗑️** (eliminar)
4. Confirma la acción en el diálogo que aparece
5. El servidor será eliminado de la base de datos

⚠️ **Advertencia**: Esta acción NO se puede deshacer.

### 4. Mover un Servidor entre Racks

Hay dos formas de mover un servidor:

**Opción A: Editar el Rack**
1. Edita el servidor (botón ✏️)
2. Cambia el valor del campo **Rack**
3. Guarda los cambios

**Opción B: Función de Mover (en desarrollo)**
- Se planea implementar drag-and-drop para mover servidores visualmente entre racks

### 5. Crear un Rack/Host

**Para Servidores Físicos:**
1. Haz clic en el botón **"🗄️ Agregar Rack"** en el header
2. Ingresa el nombre del rack: ej. `Rack 10`, `Rack A1`
3. Haz clic en **"Crear Rack"**
4. El rack aparecerá vacío en la vista principal

**Para Servidores Virtuales:**
1. Haz clic en el botón **"➕ Agregar Host"** en el header
2. Ingresa el nombre del host ESXi: ej. `ESXI-HOST-01`, `SRVESXI12`
3. Haz clic en **"Crear Host"**
4. El host aparecerá en la vista de clusters

### 6. Visualizar Detalles de Servidor

1. Desde la vista principal de racks, haz clic en cualquier unidad de servidor (las cajas iluminadas en los racks)
2. O desde la vista de detalle de rack, haz clic en el nombre de cualquier servidor
3. Se mostrará una vista completa con todos los datos:
   - Información básica (nombre, IP, hostname)
   - Hardware (marca, modelo, RAM, procesadores, discos)
   - Software (sistema operativo, software instalado)
   - Gestión (estado, backup, fechas de instalación/mantenimiento)

---

## API REST

Todas las operaciones se realizan a través de la API REST documentada en [`API-REST.md`](./API-REST.md).

### Endpoints Principales

```
POST   /api/servers       - Crear servidor
GET    /api/servers       - Listar servidores (con filtro ?type=fisicos|virtuales)
PUT    /api/servers/:id   - Actualizar servidor
DELETE /api/servers/:id   - Eliminar servidor
PUT    /api/servers/:id/move - Mover servidor a otro rack

POST   /api/racks         - Crear rack/host
GET    /api/racks         - Listar racks (con filtro ?type=fisicos|virtuales)
GET    /api/racks/:name   - Detalle de rack
PUT    /api/racks/:name   - Actualizar rack
DELETE /api/racks/:name   - Eliminar rack
```

---

## Validaciones y Restricciones

### Al Crear/Editar Servidores:
- ✅ **Nombre**: Obligatorio
- ✅ **Rack**: Obligatorio, debe existir en la base de datos
- ⚠️ **IP**: Opcional pero recomendado
- ⚠️ **Hostname**: Opcional pero recomendado

### Al Crear Racks:
- ✅ **Nombre**: Obligatorio y único
- ⚠️ Si intentas crear un rack que ya existe, recibirás un error

### Al Eliminar:
- ⚠️ **Servidores**: Se eliminan permanentemente de la base de datos
- ⚠️ **Racks**: No se pueden eliminar si tienen servidores asignados
  - Primero debes mover o eliminar todos los servidores del rack

---

## Actualizaciones en Tiempo Real

El sistema utiliza **Server-Sent Events (SSE)** para actualizar los datos automáticamente cuando hay cambios:

- 🔄 Al crear, editar o eliminar un servidor, todos los usuarios conectados verán los cambios
- 🔄 Al crear o eliminar un rack, la vista se actualiza automáticamente
- 📊 Los contadores de servidores por rack se actualizan en tiempo real

---

## Solución de Problemas

### El botón "Agregar Servidor" no responde
- Verifica que estés en la página correcta (index.html o virtual.html)
- Abre la consola del navegador (F12) y busca errores JavaScript
- Recarga la página (F5)

### No veo los racks al seleccionar
- Verifica que existan racks creados en la base de datos
- Revisa que el tipo de servidor (físico/virtual) coincida con los racks disponibles

### Error al guardar: "Rack no encontrado"
- El rack seleccionado no existe en la base de datos
- Crea primero el rack usando el botón "Agregar Rack"

### Los cambios no se reflejan
- Verifica la conexión SSE en la consola del navegador
- Haz clic en el botón "🔄 Actualizar" para forzar la recarga de datos
- Revisa que el servidor backend esté ejecutándose

---

## Consejos y Mejores Prácticas

1. **Nomenclatura consistente**
   - Usa un esquema de nombres coherente: `SRV-TIPO-NN` (ej. `SRV-WEB-01`)
   - Para hosts ESXi: `SRVESXI##` (ej. `SRVESXI06`)
   
2. **Datos completos**
   - Aunque IP y Hostname son opcionales, es muy recomendable llenarlos
   - Esto facilita la identificación y gestión posterior

3. **Estados descriptivos**
   - Usa `ACTIVO` para servidores en producción
   - Usa `MANTENIMIENTO` durante actualizaciones o reparaciones
   - Usa `INACTIVO` para servidores apagados temporalmente
   - Usa `BACKUP` para servidores de respaldo

4. **Organización por racks**
   - Agrupa servidores relacionados en el mismo rack
   - Para virtuales, agrupa VMs por host ESXi

---

## Próximas Funcionalidades

🚧 **En desarrollo:**
- Drag-and-drop para mover servidores visualmente entre racks
- Filtros avanzados por marca, modelo, estado
- Exportación de inventario a Excel/CSV
- Historial de cambios
- Notificaciones por email al realizar cambios críticos

---

## Soporte

Para reportar problemas o sugerencias:
1. Revisa la documentación en `/docs`
2. Consulta los logs del servidor en `/logs`
3. Contacta al administrador del sistema

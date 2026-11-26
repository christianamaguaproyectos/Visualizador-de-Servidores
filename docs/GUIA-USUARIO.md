# 📖 Guía de Usuario — Diagrama de Servidores

> **Última actualización:** Marzo 2026

---

## Descripción General

**Diagrama de Servidores** es una plataforma web para gestionar el inventario de servidores físicos y virtuales de la organización. Ofrece una visualización de racks interactiva, gestión de usuarios con roles, sistema de monitoreo en tiempo real y alertas por correo electrónico.

---

## Acceso al Sistema

### Inicio de Sesión

1. Abre el navegador y dirígete a la URL del sistema (ej. `http://192.168.0.108:3000`).
2. Ingresa tu **usuario** y **contraseña**.
3. Haz clic en **Iniciar Sesión**.

> 💡 Si es tu primera vez y recibiste un **email de invitación**, haz clic en el enlace del correo para establecer tu contraseña antes de iniciar sesión.

### Roles de Usuario

| Rol        | Permisos                                                            |
|------------|---------------------------------------------------------------------|
| **Admin**  | Lectura y escritura: crear, editar, mover y eliminar servidores     |
| **Viewer** | Solo lectura: consultar datos, no puede modificar nada              |
| **Superadmin** | Todo lo anterior + gestionar usuarios                          |

### Recuperación de Contraseña

1. En la pantalla de login, haz clic en **"¿Olvidaste tu contraseña?"**.
2. Ingresa tu usuario o email.
3. Recibirás un correo con un enlace para restablecer tu contraseña (válido por 30 minutos).

---

## Navegación Principal

La aplicación tiene las siguientes secciones accesibles desde el menú de navegación:

| Página              | Descripción                                                    |
|---------------------|----------------------------------------------------------------|
| 🏠 **Inicio**       | Dashboard principal con resumen general                        |
| 🖥️ **Racks Físicos** | Visualización y gestión de servidores físicos en racks         |
| 💻 **Virtuales**      | Gestión de máquinas virtuales agrupadas por host/cluster       |
| 👥 **Usuarios**       | Gestión de usuarios del sistema (solo superadmin)              |
| ⚠️ **Impacto de servicios** | Qué le pasa a cada servicio (por ejemplo, JD Edwards) si cae uno de sus servidores |
| 📡 **Monitoreo**      | Panel de monitoreo con checks de disponibilidad y alertas      |

---

## Racks Físicos

### Vista General

Al ingresar a **Servidores Físicos** (`/fisicos`) se muestran, de arriba abajo:

- **Barra superior**: buscador, filtro de criticidad y los botones *Agregar Servidor*, *Agregar Rack*, *Exportar Excel*, *Mostrar detalles técnicos*, *Usuarios* (solo superadmin) y *Actualizar datos*.
- **Resumen**: total de racks y servidores, y conteo de servidores críticos, no críticos y en mantenimiento.
- **Paginación** y botón **🔧 Organizar Racks**.
- **Leyenda** de los símbolos del rack, con el número de servidores en cada estado de monitoreo.
- **Racks dibujados como gabinetes de 42U**: marco, rieles con la numeración de cada unidad (U), unidades libres como ranuras vacías y cada servidor ocupando sus U reales (un equipo de 2U ocupa dos unidades). Sobre la tarjeta de cada rack se ven su nombre, cuántos servidores tiene, las unidades ocupadas (`N/42U`), una barra de ocupación y el conteo por criticidad.

Cada servidor del gabinete muestra su **nombre**, su **IP** y dos indicadores:

| Indicador | Forma | Significado |
|-----------|-------|-------------|
| **Criticidad** (dato del inventario, campo *Estado*) | cuadrado ■ y franja de color en el borde izquierdo del equipo | 🟥 Crítico · 🟩 No crítico · 🟧 Mantenimiento · ⬜ Inactivo. En equipos de 2U o más también aparece la etiqueta `CRÍTICO` / `MANT.` / `INACTIVO`. |
| **Monitoreo** (estado en vivo) | LED redondo ● | Verde **UP** (en línea) · Rojo parpadeante **DOWN** (caído) · Ámbar **DEGRADED** (degradado) · Violeta **MAINT** (mantenimiento) · Círculo vacío **SIN DATOS** (sin monitoreo). |

El estado de monitoreo es el mismo que usa Impacto de servicios y se actualiza solo cada 30 segundos. Al pasar el mouse sobre un servidor aparece un recuadro con nombre, IP, unidades, criticidad y monitoreo; sobre una unidad libre, su número de U.

Si un rack tiene más servidores de los que caben en 42U, o varios con la misma posición, su tarjeta muestra el aviso **⚠ N servidores no caben en el rack o no tienen posición libre**; al desplegarlo se listan para abrirlos y corregir su ubicación. Los servidores del inventario **sin rack** aparecen debajo de los racks en el bloque **Sin rack asignado** (y se cuentan en el resumen). Los racks sin tipo que contienen servidores físicos también se muestran.

**Mostrar detalles técnicos** añade en cada rack la ocupación detallada (U ocupadas y libres) y los modelos instalados, y en los equipos de 2U o más el modelo y su rango de U.

### Buscador y filtros

El **buscador** resalta los servidores cuyo nombre, hostname, IP, etiqueta, modelo o rango de U contiene el texto, y atenúa el resto. El menú **"Todos"** filtra por criticidad:

| Filtro             | Muestra                                                 |
|--------------------|----------------------------------------------------------|
| **Todos**          | Todos los servidores                                     |
| **Críticos**       | Solo servidores marcados como críticos                   |
| **No Críticos**    | Servidores que no son críticos ni en mantenimiento        |
| **En Mantenimiento** | Solo servidores en mantenimiento                        |

### Paginación y orden de los racks

El selector **Racks por página** (4, 5, 6, 8, 10 o 12) y los botones *Primera*, *Anterior*, *Siguiente* y *Última* recorren las páginas. **🔧 Organizar Racks** permite cambiar el orden de los racks (arrastrando o con ▲▼), guardarlo o restablecer el orden original; el orden se recuerda en el navegador.

### Ver Detalle de un Rack

Haz clic en la tarjeta de un rack (fuera de los servidores) para abrir su vista de detalle:
- El **gabinete en grande**, con nombre, IP, criticidad, LED de monitoreo, modelo y rango de U de cada servidor.
- La **lista del inventario** del rack con criticidad y monitoreo de cada servidor y los botones ✏️ editar y 🗑️ eliminar.
- Botón **"🗑️ Eliminar Rack"** (pide confirmación; si el rack tiene servidores, avisa que también se eliminarán).
- Botón **"← Volver"** para regresar a la vista general.

Un clic sobre un servidor (en el gabinete o en la lista) abre su ficha.

### Mover Servidores (Drag & Drop)

Arrastra un servidor y suéltalo:
- sobre una **U libre** (se ilumina al pasar por encima) para colocarlo en esa posición, en el mismo rack o en otro;
- sobre **otro servidor** para intercambiar sus posiciones;
- sobre la tarjeta de **otro rack** para moverlo a ese rack.

La vista se actualiza sola después de cada movimiento. Los usuarios de solo lectura ven los racks, el buscador y los filtros, pero no pueden abrir el detalle, editar ni mover servidores.

---

## Gestión de Servidores

### Agregar un Servidor

1. Haz clic en **"➕ Agregar Servidor"** en la barra superior.
2. Completa el formulario:
   - **Nombre** (requerido): ej. `SRV-WEB-01`
   - **Rack** (requerido): selecciona el rack destino
   - **Unidades de Rack**: tamaño en U del servidor (por defecto 2U)
   - **Posición en Rack**: unidad inicial (opcional, autoasigna si se deja vacío)
   - **IP / Hostname**: datos de red del servidor
   - **Marca/Modelo/Tipo/Serie**: datos de hardware
   - **RAM / Socket / N° por Socket / Procesadores Lógicos**: specs de hardware
   - **Discos**: agregá discos dinámicamente con el botón "Agregar Disco"
   - **Sistema Operativo / Software**: datos de software
   - **Estado (Prioridad)**:
     - 🔴 **CRÍTICO** — Servidor de alta importancia
     - 🟢 **NO CRÍTICO** — Servidor normal
     - 🛠️ **EN MANTENIMIENTO** — Servidor temporal fuera de servicio
   - **Backup / Fechas**: información de respaldo
3. Haz clic en **"Guardar"**.

### Editar un Servidor

1. Ve al detalle de un rack.
2. Haz clic en **✏️ Editar** junto al servidor.
3. Modifica los campos necesarios.
4. Haz clic en **"Guardar"**.

### Eliminar un Servidor

1. Ve al detalle de un rack.
2. Haz clic en **🗑️ Eliminar** junto al servidor.
3. Confirma la acción.

> ⚠️ **Esta acción es permanente** y no se puede deshacer.

### Ver Detalle de un Servidor

Haz clic en cualquier servidor dentro de un rack para abrir su ficha completa con toda la información registrada. En servidores físicos, bajo el nombre se muestran su **criticidad** (■) y su **estado de monitoreo** (LED ●) con los mismos colores que el rack.

---

## Servidores Virtuales

**Servidores Virtuales** (`/virtuales`) — *Gestión de VMs y contenedores con inventario y estado operativo consolidado* — organiza las máquinas virtuales por **host** y agrupa los hosts en **vistas**.

### Barra superior

Buscador de VM o host, filtro por criticidad (**Críticos**, **No Críticos**, **En Mantenimiento**) y los botones *Agregar VM* (dentro de un host), *Agregar Host*, *Exportar Excel*, *Usuarios* (solo superadmin) y *Actualizar datos*.

### Vistas

Al entrar se elige una vista:

- **Clusters Danec**: un bloque por clúster con sus hosts y las VMs de cada host. **Ver detalle del clúster** permite renombrarlo (✏️), eliminarlo (🗑️, con confirmación) y **agregar o quitar hosts**.
- **VMware vSphere**: los hosts dedicados a vSphere.
- **Todos los hosts**: todos los hosts del inventario, estén o no en un clúster, con el resumen de monitoreo de todas las VMs; debajo, el bloque **VMs sin host asignado** con las VMs que no tienen host.
- **✨ Crear Nueva Vista**: abre la ventana **Nueva vista**; escribe el nombre (obligatorio) y pulsa **Crear** (o `Enter`); **Cancelar**, **×** o `Esc` cierran sin crear. La vista nueva aparece en el menú con sus botones ✏️ (renombrar, con la misma ventana) y 🗑️ (eliminar, con confirmación).
- **← Volver** regresa al menú de vistas.

### Inventario y estado operativo consolidado

- **Leyenda** arriba de cada vista con el número de VMs en cada estado de monitoreo (UP, DOWN, DEGRADED, MAINT, sin datos); se actualiza sola cada 30 segundos.
- Cada **VM** muestra un LED de monitoreo con los mismos colores que en Servidores Físicos.
- Cada **host** muestra el estado del servidor físico que lo aloja (*Host UP/DOWN…*) y el resumen de sus VMs por estado; cada **clúster**, el resumen de todas sus VMs.

### Acciones

- Clic en una **VM**: abre su ficha (con *Editar*, *Eliminar* y *Volver*).
- Clic en un **host**: abre su vista con *➕ Agregar VM*, *🗑️ Eliminar Rack* y *← Volver*. **✏️ Editar** en la tarjeta del host cambia su nombre.
- Los usuarios de solo lectura ven las vistas, los estados y el buscador, pero no pueden crear, editar ni abrir el detalle.

---

## Impacto de servicios

Menú lateral → **Impacto de servicios** (o la tarjeta del mismo nombre en Inicio). Responde a una pregunta concreta: **si cae este servidor, ¿qué le pasa al servicio?** (por ejemplo, JD Edwards).

### Servicios y sus servidores

- A la izquierda está la lista de **servicios**. Todos se muestran *En funcionamiento*: la página sirve para ver qué pasaría con una caída simulada.
- Al elegir un servicio se ve una tarjeta por cada uno de sus servidores, con:
  - **Función** en el servicio (por ejemplo, *Base de datos de JD Edwards*);
  - **Si cae**: *Deja de funcionar* (cae todo el servicio), *Sigue funcionando* o *Por definir* (falta confirmarlo con el equipo responsable);
  - **Qué deja de funcionar**;
  - **Si cae, también se caen**: otros servidores del servicio que caen junto con este;
  - **En línea**: todos los servidores se muestran en línea; la página sirve para simular caídas.
- **Máquinas virtuales y su host:** una VM cae con el servidor físico donde corre. El host se reconoce porque el campo **Host** de la VM coincide con el nombre de un servidor de **Servidores Físicos** (sin distinguir mayúsculas, guiones ni espacios). Si no coincide, la tarjeta lo indica (*ese host no está en Físicos*).

### Simular una caída

Arriba de la página, la **Semaforización** explica los colores: verde *Operativo* (servidor en funcionamiento), amarillo *Operación degradada* (funcionando con limitaciones), rojo *Fuera de servicio* (sin disponibilidad) y azul *Caída simulada* (servidor elegido para la prueba).

- Pulsa **Simular caída** en la tarjeta de un servidor. Se pueden simular varios a la vez.
- Sobre las tarjetas aparece el resultado del servicio (*Deja de funcionar*, *Sigue funcionando*…). El servidor simulado se pinta de **azul**; los que dejan de funcionar por esa caída, de **rojo** (todos, si el servicio deja de funcionar), y los que siguen funcionando, de **verde**. Si un servicio cae por completo aparece unos segundos el aviso *Interrupción total del servicio*. Las tarjetas rojas dicen *Deja de funcionar* y las verdes, *Sigue funcionando*.
- La simulación no modifica datos ni envía alertas. **Quitar simulación** la deshace.

### Registrar la información (administradores)

- **+ Nuevo** crea un servicio; **Editar** y **Eliminar** lo modifican. Eliminar un servicio no toca los servidores del inventario.
- **+ Agregar servidor** añade un servidor al servicio: se elige de la lista (nombre · IP · host) y se completan su función, qué pasa si cae y qué deja de funcionar. En **Si este servidor cae, también se caen** se marcan los servidores del servicio que caen con él: en la simulación se pintan de rojo y los demás quedan en verde. Con *Deja de funcionar* no hace falta marcar nada: cae todo el servicio.
- El estado de Monitoreo se actualiza solo cada 30 segundos mientras la página está abierta.

## Gestión de Usuarios (Solo Superadmin)

### Acceso

Navega a la página **👥 Usuarios** desde el menú de navegación (solo visible para superadmins).

### Crear un Usuario

1. Haz clic en **"➕ Agregar Usuario"**.
2. Completa el formulario:
   - **Usuario** (requerido): nombre único de inicio de sesión.
   - **Nombre Completo** (requerido).
   - **Email**: dirección para recibir la invitación.
   - **Rol**: `Viewer` (solo lectura) o `Admin` (lectura y escritura).
   - **Contraseña** (opcional):
     - Si la dejas vacía, se enviará un **email de invitación** al usuario para que establezca su propia contraseña.
     - Si la completas, el usuario se crea con esa contraseña directamente.
3. Haz clic en **"Guardar"**.

> 💡 Si el SMTP no está configurado o el email falla, el sistema mostrará un **enlace de invitación** en pantalla para compartirlo manualmente.

### Editar un Usuario

1. Haz clic en **✏️ Editar** junto al usuario.
2. Modifica nombre, email o rol.
3. Haz clic en **"Guardar"**.

### Cambiar Contraseña

1. Haz clic en **🔑 Contraseña** junto al usuario.
2. Ingresa la nueva contraseña (mínimo 6 caracteres).
3. Confirma la contraseña.
4. Haz clic en **"Cambiar Contraseña"**.

### Inhabilitar un Usuario

1. Haz clic en **⛔ Inhabilitar** (botón naranja).
2. Confirma la acción.
3. El usuario quedará **inactivo** (no podrá iniciar sesión, pero sus datos se conservan).

### Eliminar Permanentemente un Usuario

1. Haz clic en **🗑️ Eliminar** (botón rojo).
2. Confirma la primera advertencia.
3. Confirma la segunda advertencia (doble confirmación).
4. El usuario se **borra permanentemente** de la base de datos.

> ⚠️ **No se puede deshacer.** Todos los datos del usuario se perderán.

---

## Monitoreo

### Panel de Monitoreo

Accede a **Monitoreo** desde el menú: *telemetría en tiempo real, alertas y comportamiento de incidentes operativos*. El sistema ejecuta checks automáticos de disponibilidad (ping, TCP, HTTP) a los servidores registrados. Esta sección requiere que el monitoreo esté habilitado en el servidor (`MONITORING_ENABLED=1`).

En la parte superior se ven los totales (activos, caídos, degradados, en mantenimiento, incidentes y latencia media) y el indicador **En vivo** con la hora de la última actualización. Los datos se actualizan solos cada 15 segundos mientras la pestaña del navegador está visible; el botón **⟳** actualiza al momento. Si el servidor no responde, el indicador pasa a *Sin conexión* y cada bloque muestra el motivo con un botón **Reintentar**.

### Vista General: estado en tiempo real por rack

- Cada **rack** (o, para las máquinas virtuales, su host o clúster) es una tarjeta con un color según el peor estado de sus servidores y un resumen ("Todo operativo", "2 caídos").
- Cada **servidor** es un punto de estado (verde operativo, ámbar degradado, rojo caído y parpadeando, violeta mantenimiento, gris sin datos) con una **mini-onda** de sus últimos tiempos de respuesta y la última latencia. Los puntos rojos bajo la onda son ejecuciones fallidas.
- **Buscar** filtra por nombre, IP o rack; **Con problemas** deja solo los servidores caídos, degradados o con incidentes.
- Pulsa el nombre del rack o **Ver rack →** para ver todas sus tarjetas de servidor (latencia, disponibilidad, checks e incidentes); la **×** cierra el detalle.
- Pulsa un servidor (punto, fila o tarjeta) para abrir su **panel de telemetría**.

Debajo siguen los incidentes activos, los hosts críticos caídos, la tendencia de 24 h y las métricas de las últimas 2 h.

### Panel de telemetría de un servidor

- **Telemetría en vivo**: estado actual y, por cada check, una gráfica de onda con la latencia (última, media y p95), la disponibilidad y una franja con el resultado de cada ejecución (verde correcto, rojo fallo, ámbar lento o sin respuesta a tiempo). Elige el periodo: 15 min, 1 h, 6 h o 24 h (hasta 120 puntos por check). Incluye la **línea de tiempo de incidentes** (abierto, reconocido, cerrado y duración); pulsa uno para ver su detalle.
- **Resumen**: checks configurados, estadísticas de 24 h y últimas ejecuciones.
- **Historial**: ejecuciones en un rango (hoy, ayer, 6 h, 24 h, 3 días, 7 días o personalizado).
- Administradores: **Poner en mantenimiento** (duración de 1 a 24 h y motivo; durante la ventana no se generan alertas) o **Sacar de mantenimiento**, y **Agregar check**.

### Otras pestañas

- **Hosts**: tarjetas con filtros por estado, tipo, rack y criticidad; **Importar Hosts** trae servidores físicos o virtuales del inventario (administradores).
- **Incidentes**: filtros por estado y severidad, búsqueda, y acciones **ACK**, **Resolver**, **Cerrar** y **Agregar nota** (la nota se escribe en una ventana propia).
- **Checks**: búsqueda, **Nuevo Check**, **Check Masivo** (elige varios hosts y crea el mismo tipo de check para todos con la IP de cada uno), ejecutar ahora y eliminar.
- **Mantenimiento** (administradores): estadísticas de almacenamiento, depuración de registros e incidentes antiguos y optimización de la base de datos.
- **Alertas** (administradores): destinatarios de correo (agregar, editar, activar/desactivar, eliminar), estado del SMTP, correo de prueba y simulador de caída o recuperación.

Las acciones que modifican datos piden confirmación en una ventana del sistema. Los usuarios de solo lectura ven la vista en tiempo real, la telemetría, los hosts, los incidentes y los checks, sin botones de modificación.

---

## Actualizaciones en Tiempo Real

El sistema utiliza **Server-Sent Events (SSE)** para sincronizar datos automáticamente:

- 🔄 Al crear, editar, mover o eliminar un servidor, todos los usuarios verán los cambios.
- 🔄 Al crear o eliminar un rack, la vista se actualiza.
- ⚠️ **Impacto de servicios** refleja el estado de Monitoreo cada 30 segundos mientras está abierta.
- 📊 Los contadores de KPIs se recalculan automáticamente.

---

## Exportar Datos

Haz clic en **"📊 Exportar Excel"** en la barra superior de racks físicos o virtuales para descargar el inventario en formato Excel.

---

## Solución de Problemas

| Problema                                      | Solución                                                     |
|-----------------------------------------------|--------------------------------------------------------------|
| El botón "Agregar Servidor" no responde        | Recarga la página (F5). Revisa la consola (F12) para errores |
| No aparecen los racks en el selector           | Verifica que existan racks creados para el tipo seleccionado  |
| Error: "Rack no encontrado"                    | Crea primero el rack con "Agregar Rack"                       |
| Los cambios no se reflejan                     | Haz clic en "🔄 Actualizar" o recarga con Ctrl+F5            |
| El email de invitación no llega                | Verifica la configuración SMTP en `.env`                      |
| Al hacer clic en un rack abre otro             | Limpia la caché del navegador (Ctrl+Shift+Delete)             |

---

## Consejos y Mejores Prácticas

1. **Nomenclatura consistente**: Usa esquemas como `SRV-TIPO-NN` (ej. `SRV-WEB-01`) para servidores y `SRVESXI##` para hosts ESXi.

2. **Datos completos**: Aunque campos como IP y Hostname son opcionales, llenarlos facilita la identificación y el monitoreo.

3. **Estados correctos**: Usa los tres estados disponibles de manera coherente:
   - **Crítico** — Servidores de producción o alta prioridad.
   - **No Crítico** — Servidores auxiliares o de baja prioridad.
   - **En Mantenimiento** — Servidores temporalmente fuera de servicio.

4. **Posición en Rack**: Asignar posiciones exactas ayuda a reflejar la distribución real del datacenter.

5. **Usuarios por invitación**: Crea usuarios sin contraseña para que cada persona establezca su propia credencial de forma segura.

---

## API REST

Documentación técnica completa disponible en [`API-REST.md`](./API-REST.md).

### Endpoints Principales

```
POST   /api/servers              - Crear servidor
GET    /api/servers              - Listar servidores (?type=fisicos|virtuales)
PUT    /api/servers/:id          - Actualizar servidor
DELETE /api/servers/:id          - Eliminar servidor
PUT    /api/servers/:id/move     - Mover servidor a otro rack
PUT    /api/servers/:id/reposition - Cambiar posición en rack

POST   /api/racks                - Crear rack/host
GET    /api/racks                - Listar racks (?type=fisicos|virtuales)
DELETE /api/racks/:id            - Eliminar rack

GET    /api/impacto              - Servicios, sus servidores y estado actual
GET    /api/impacto/simular?ids= - Qué pasaría si cayeran esos servidores
GET    /api/impacto/servidores   - Estado de monitoreo de cada servidor

GET    /api/users                - Listar usuarios
POST   /api/users                - Crear usuario (con invitación)
PUT    /api/users/:id            - Actualizar usuario
DELETE /api/users/:id            - Inhabilitar usuario
DELETE /api/users/:id/permanent  - Eliminar permanentemente
POST   /api/users/:id/change-password - Cambiar contraseña
```

---

## Soporte

Para reportar problemas o sugerencias:
1. Revisa la documentación en `/docs`.
2. Consulta los logs del servidor en `/logs`.
3. Contacta al administrador del sistema.

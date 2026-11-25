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
| 🔗 **Mapa de Dependencias** | Relaciones entre servidores en 3D y editor 2D, con impacto de caídas |
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

El estado de monitoreo es el mismo que usa el Mapa de Dependencias y se actualiza solo cada 30 segundos. Al pasar el mouse sobre un servidor aparece un recuadro con nombre, IP, unidades, criticidad y monitoreo; sobre una unidad libre, su número de U.

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

Debajo de la ficha aparece el bloque **🔗 Dependencias e impacto** (igual en físicos y virtuales). El botón del mismo nombre en la fila superior, junto a **Volver**, muestra el número de relaciones y lleva directamente al bloque:

- **Depende de** y **Dependen de él:** cada relación con el estado de monitoreo del otro servidor (UP, DOWN, DEGRADED…), su tipo y su criticidad.
- **Resumen de impacto:** cuántos servidores se verían afectados si este cae (directos y en cascada) y, si existe, la dependencia circular en la que participa.
- **Relacionar con otro servidor** (administradores): abre un formulario breve dentro del mismo bloque (dirección, servidor, tipo y criticidad); se cierra con su **×** o con `Esc`.
- **🗑 Eliminar relación** (administradores): pide confirmación antes de borrar.
- **Abrir en el mapa:** abre el Mapa de Dependencias con este servidor seleccionado y centrado (`/dependencias?focus=<id>`), aunque todavía no tenga relaciones.

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
- Cada **VM** muestra un LED de monitoreo con los mismos colores que en Servidores Físicos y en el Mapa de Dependencias.
- Cada **host** muestra el estado del servidor físico que lo aloja (*Host UP/DOWN…*) y el resumen de sus VMs por estado; cada **clúster**, el resumen de todas sus VMs.

### Acciones

- Clic en una **VM**: abre su ficha (con el bloque **🔗 Dependencias e impacto**, *Editar*, *Eliminar* y *Volver*).
- Clic en un **host**: abre su vista con *➕ Agregar VM*, *🗑️ Eliminar Rack* y *← Volver*. **✏️ Editar** en la tarjeta del host cambia su nombre.
- Los usuarios de solo lectura ven las vistas, los estados y el buscador, pero no pueden crear, editar ni abrir el detalle.

---

## Mapa de Dependencias

Accede desde **🔗 Mapa de Dependencias** en el menú lateral o desde su tarjeta en el panel de inicio (`/dependencias`). El mapa muestra qué servidores **dependen de** otros (por ejemplo, una aplicación que necesita su base de datos) y qué se vería afectado si uno de ellos cae.

> La flecha va del servidor que depende (origen) al servidor del que depende (destino). Si el destino cae, el impacto se propaga hacia el origen.

### Vista 3D (por defecto)

La vista 3D representa el centro de datos como una **sala de racks** fiel al inventario de **Servidores Físicos**:

- **Sala de racks:** cada rack físico del inventario (también los vacíos) es un gabinete de **42U** en una fila de la sala, con el frente hacia ti. Su nombre y su ocupación (por ejemplo `RACK-A3 · 14/42U`) aparecen en la cabecera del gabinete y en el suelo, delante de él.
- **Cada servidor en su unidad:** los servidores ocupan las mismas U que en la vista de rack de **Servidores Físicos** (posición `1-42` desde abajo y altura en U; los que no tienen posición ocupan el primer hueco libre, igual que en esa vista). El frente del rack muestra la numeración de las U, y el nombre y la IP de cada servidor; las U libres llevan paneles ciegos.
- **Estado de monitoreo:** el frontal y el LED de cada servidor toman el color de su estado (UP verde, DOWN rojo, DEGRADED ámbar, MAINT violeta). Los servidores **caídos** muestran siempre su nombre en una **etiqueta roja**, sin necesidad de pasar el puntero.
- **Virtualización:** a la derecha de la sala, cada host o clúster tiene su bloque con sus máquinas virtuales (cubos translúcidos); el rótulo del bloque lista los nombres de sus VMs.
- **Dependencias:** arcos que salen del frente de la unidad del servidor y pasan por encima de los gabinetes, con partículas del origen al destino. Al pasar el puntero sobre un servidor, o al seleccionarlo, sus relaciones se resaltan y las demás se atenúan.
- Los servidores que oculta un filtro siguen ocupando su U (en gris), para que el rack refleje siempre el inventario. Si un servidor físico no tiene rack o no cabe en el suyo, aparece en un rack aparte rotulado **Sin ubicar**.
- Al abrir el mapa (y con **Encajar**) la cámara se ajusta para que toda la sala ocupe la vista.

**Pasar el puntero** sobre un servidor muestra su resumen (nombre, IP, rack y U, modelo o sistema operativo, estado). **Clic** abre el inspector con el detalle completo: datos de monitoreo, impacto, de quién depende y quién depende de él, análisis de impacto y la **ficha de inventario** con los mismos campos que el detalle de **Servidores Físicos** o **Virtuales**. **Clic en un gabinete** (fuera de un servidor) abre la ficha del rack: ocupación, huecos libres y servidores por unidad; doble clic lo muestra de frente.

Accesos desde el inspector:

- **Ver en inventario:** abre el detalle del servidor en **Servidores Físicos** o **Virtuales** (o el rack en la vista de racks).
- **Editar servidor** (administradores): abre el formulario de edición de **Servidores Físicos** o **Virtuales** con ese servidor.
- **Agregar servidor en este rack** (administradores, en la ficha del rack): abre el formulario de alta de **Servidores Físicos** con el rack elegido y la primera posición libre para un equipo de 2U.

**Tiempo real:** el mapa se actualiza sin recargar la página ni mover la cámara. Las altas, cambios y bajas de servidores o racks (desde **Servidores Físicos**, **Virtuales** o la API) llegan al instante; el estado de monitoreo se consulta cada 30 segundos mientras la pestaña está visible. La pastilla de resumen (caídas y afectados) se actualiza sola.

| Acción | Cómo |
|--------|------|
| Girar la vista | Arrastrar con el botón izquierdo |
| Desplazar | Arrastrar con el botón derecho (o flechas del teclado) |
| Acercar / alejar | Rueda del ratón, botones **+** / **−** o teclas `+` / `−` |
| Ver todo | Botón **Encajar** o tecla `F`; **100%** restablece el zoom |
| Detalle de un servidor o relación | Clic sobre él: se abre el panel lateral (inspector) |
| Acercarse a un servidor | Doble clic, o **Enfocar** en el inspector |
| Buscar un servidor | Cuadro **Buscar…** (nombre, IP o hostname) y `Enter` |

En el menú **⋯ (Más opciones)**:

- **Disposición 3D:** *sala de datos* (la sala de racks, por defecto) o *posiciones del editor*, que coloca los servidores donde los dejaste en el Editor 2D.
- **Modo rendimiento 3D:** menor resolución y sin animaciones de fondo para que el giro sea fluido en portátiles. Es el modo inicial en equipos con gráficos integrados y se activa solo (con un aviso) si el equipo no alcanza unos 45 fps al abrir el mapa; puedes cambiarlo cuando quieras y se recuerda en tu navegador.
- **Animaciones**, **Mostrar filtros**, **Mostrar todos los servidores** (en el Editor 2D y con las posiciones del editor; la sala de racks ya los muestra todos) y **Atajos de teclado**.

Si el navegador no admite WebGL, el mapa se abre directamente en el Editor 2D.

### Editor 2D

Pulsa **Editor 2D** en la barra superior para ver el mapa como un diagrama editable:

- Cada servidor es una tarjeta con su tipo (FÍSICO / VM), nombre, IP, rack o host, estado de monitoreo y número de relaciones.
- **Mover:** arrastra las tarjetas (se ajustan a una cuadrícula de 10 px).
- **Auto-ordenar ▾:** *Por capas* (proveedores arriba, aplicaciones abajo) o *Anillos*.
- **Guardar:** el botón inferior indica si hay cambios sin guardar; las posiciones también se guardan solas poco después de mover algo.
- **Paleta de servidores** (izquierda): arrastra al lienzo los servidores que todavía no están en el mapa.
- **Minimapa** (esquina inferior derecha, también en 3D): muestra el encuadre actual; un clic o arrastre sobre él centra la vista y se pliega con su **×**.

### Crear y editar relaciones (administradores)

- **Con el formulario:** botón **Nueva relación**. Elige el **origen** (el que depende) y el **destino** (proveedor) con los buscadores, el **tipo** (base de datos, red, almacenamiento, API, autenticación, hipervisor, respaldo, DNS/infraestructura o servicio), la **criticidad**, y opcionalmente puerto, protocolo, etiqueta y notas. El botón ⇅ invierte la dirección; **Relación mutua** crea también la relación inversa.
- **Arrastrando en el Editor 2D:** pasa el ratón sobre una tarjeta, arrastra desde uno de sus puntos de conexión (aparecen en los bordes) hasta otro servidor y suelta: se abre el mismo formulario con origen y destino ya elegidos.
- **Desde el inspector:** *Relación desde aquí* en un servidor; *Editar* o *Eliminar* (con confirmación) en una relación.

### Vistas guardadas

Una **vista** es un diagrama con sus propias posiciones (por ejemplo, *Mapa General* y *ERP Producción*). El selector de la barra superior cambia de vista; cada una recuerda dónde dejaste cada servidor y su encuadre.

- **＋ Nueva vista** (administradores): nombre y descripción opcional.
- **✎ Editar vista** (administradores): renombra la vista actual o la elimina con **Eliminar vista** (pide confirmación). Eliminar una vista borra solo sus posiciones: los servidores y sus relaciones no cambian. La vista predeterminada no se puede eliminar.

### Exportar el mapa

Botón **Exportar** de la barra superior:

| Formato | Contenido |
|---------|-----------|
| **SVG** (Editor 2D) | Diagrama vectorial con sus estilos, para abrir o imprimir en cualquier visor |
| **PNG** (Editor 2D) | Imagen del diagrama a doble resolución, para informes y presentaciones |
| **PNG de la vista 3D** | Captura de la escena 3D tal como se ve |
| **JSON** | Servidores, posiciones y relaciones de la vista actual |

Los archivos se descargan con el nombre `topologia-<vista>-<fecha>.<extensión>`.

### Simular una caída e impacto en cascada

- Si Monitoreo detecta servidores caídos o degradados, aparece arriba a la derecha un indicador compacto (por ejemplo, *2 caídas · 4 afectados*). Haz clic para ver el detalle (qué servidores se ven afectados y a qué nivel) y en **×** para plegarlo; el mapa recuerda si lo dejaste abierto.
- **Simular caída:** activa el modo simulación y haz clic en uno o varios servidores para ver qué pasaría si cayeran (o pulsa `S` con un servidor seleccionado). El mapa resalta la cadena de impacto por niveles, atenúa los servidores no relacionados y el indicador muestra el resumen con las **caídas reales (monitoreo)** y las **caídas simuladas** por separado, cada una con su conteo, y el total de servidores afectados (por ejemplo, *«1 caída real · 1 simulada · 12 afectados»*). Un segundo clic en un servidor quita su caída simulada. No modifica datos ni envía alertas. Sales con el mismo botón, con la **×** de la banda superior o con `Esc`.
- **Ver solo impacto** (en el detalle del indicador) atenúa todo lo que no está afectado.
- **VMs y su host:** una máquina virtual cae automáticamente con el host donde corre, sin necesidad de registrar esa relación. El host se reconoce porque su nombre coincide con el host de la VM en el inventario (sin distinguir mayúsculas, guiones ni espacios). En el inspector del host se indica cuántas **VMs alojadas** tiene, y en el resumen esas VMs aparecen como *«VM en el host»*.
- **Aplicaciones afectadas:** el detalle del indicador lista las aplicaciones que caen (tomadas del campo **Software** de cada servidor), cada una con los servidores donde corre y si está caído, simulado, afectado directo o en cascada. Primero aparecen las que caen por la simulación. Los servidores con el campo vacío o «N/A» no cuentan como aplicación.
- **Descargar CSV** (en el detalle del indicador) guarda la lista de servidores y aplicaciones afectados para abrirla en Excel.
- El buscador del mapa también encuentra servidores por el nombre de su aplicación (por ejemplo, *pentaho*).

### Leyenda de colores

| Color | Estado del servidor (Monitoreo) |
|-------|---------------------------------|
| 🟢 Verde | UP — operativo |
| 🔴 Rojo | DOWN — caído |
| 🟡 Ámbar | DEGRADED — degradado |
| 🟣 Violeta | MAINT — en mantenimiento |
| ⚪ Gris | Sin monitoreo |

| Color | Impacto |
|-------|---------|
| 🟠 Naranja | Impacto directo: depende de un servidor caído |
| 🟡 Amarillo | En cascada: afectado a través de otro servidor (nivel 2 o más) |

El grosor de cada relación indica su criticidad (crítica, alta, media o baja) y su color, el tipo de dependencia. La leyenda completa está en el botón **Leyenda** de la esquina superior izquierda del mapa.

### Permisos

| Rol | Qué puede hacer en el mapa |
|-----|----------------------------|
| **Viewer** | Ver el 3D y el 2D, buscar, filtrar, inspeccionar, simular caídas, exportar y usar la lista. No ve controles de edición ni puntos de conexión. |
| **Admin / Superadmin** | Todo lo anterior y además crear, editar y eliminar relaciones (también desde el detalle del servidor), mover servidores, guardar posiciones y crear, renombrar o eliminar vistas. |

### Accesibilidad

El botón **Lista** muestra todos los servidores y relaciones en una tabla. Todas las ventanas y paneles se cierran con su botón **×** o con `Esc`. Los atajos de teclado completos están en **⋯ → Atajos de teclado**.

---

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
- 🔗 El **Mapa de Dependencias** (sala de racks 3D y Editor 2D) refleja esos cambios y el estado de monitoreo sin recargar la página.
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

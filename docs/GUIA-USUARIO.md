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

Al ingresar a **Racks Físicos** se muestra una grilla horizontal con todos los racks. Cada rack muestra:

- **Nombre** del rack en la parte superior.
- **Unidades de servidor** representadas visualmente con LEDs de estado:
  - 🔴 **Rojo** — Servidor **Crítico** (alta prioridad).
  - 🟢 **Verde** — Servidor **No Crítico** (funcionando con normalidad).
  - 🟠 **Naranja** — Servidor **En Mantenimiento**.
  - ⚪ **Gris/Apagado** — Unidad vacía o servidor inactivo.
- **Etiquetas laterales** con la IP y hostname de cada servidor.
- **KPIs en la parte inferior**: conteo de servidores críticos, no críticos y en mantenimiento.

### Filtros de Estado

Usa el menú desplegable **"Todos"** en la barra superior para filtrar servidores por estado:

| Filtro             | Muestra                                                 |
|--------------------|----------------------------------------------------------|
| **Todos**          | Todos los servidores                                     |
| **Críticos**       | Solo servidores marcados como críticos                   |
| **No Críticos**    | Servidores que no son críticos ni en mantenimiento        |
| **En Mantenimiento** | Solo servidores en mantenimiento                        |

### Paginación

Puedes controlar cuántos racks se muestran a la vez seleccionando entre 3, 5, 10 o todos desde el selector de paginación. También puedes saltar directamente a un rack específico usando el botón **"Ir a Rack"**.

### Ver Detalle de un Rack

Haz clic en cualquier rack para abrir su vista de detalle, que muestra:
- Lista completa de servidores instalados.
- Botones de acción: editar, eliminar y mover servidores.
- Botón **"🗑️ Eliminar Rack"** (solo si no tiene servidores).
- Botón **"← Volver"** para regresar a la vista general.

### Mover Servidores (Drag & Drop)

Puedes **arrastrar** un servidor de un rack y **soltarlo** en una unidad vacía de otro rack para moverlo visualmente.

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

Haz clic en cualquier servidor dentro de un rack o en las etiquetas laterales para abrir su ficha completa con toda la información registrada.

Debajo de la ficha aparece el bloque **🔗 Dependencias e impacto** (igual en físicos y virtuales):

- **Depende de** y **Dependen de él:** cada relación con el estado de monitoreo del otro servidor (UP, DOWN, DEGRADED…), su tipo y su criticidad.
- **Resumen de impacto:** cuántos servidores se verían afectados si este cae (directos y en cascada) y, si existe, la dependencia circular en la que participa.
- **Relacionar con otro servidor** (administradores): abre un formulario breve dentro del mismo bloque (dirección, servidor, tipo y criticidad); se cierra con su **×** o con `Esc`.
- **🗑 Eliminar relación** (administradores): pide confirmación antes de borrar.
- **Abrir en el mapa:** abre el Mapa de Dependencias con este servidor seleccionado y centrado (`/dependencias?focus=<id>`), aunque todavía no tenga relaciones.

---

## Servidores Virtuales

La vista de **Virtuales** organiza las máquinas virtuales por **hosts ESXi** y/o **clusters**. Funciona de forma similar a la vista física, con las siguientes diferencias:

- Las VMs se agrupan por **cluster → host**.
- Puedes cambiar la vista entre **Clusters**, **Hosts** o **Lista**.
- Puedes agregar VMs directamente dentro de un host.

Los filtros de estado (**Críticos**, **No Críticos**, **En Mantenimiento**) también están disponibles en esta vista.

---

## Mapa de Dependencias

Accede desde **🔗 Mapa de Dependencias** en el menú lateral o desde su tarjeta en el panel de inicio (`/dependencias`). El mapa muestra qué servidores **dependen de** otros (por ejemplo, una aplicación que necesita su base de datos) y qué se vería afectado si uno de ellos cae.

> La flecha va del servidor que depende (origen) al servidor del que depende (destino). Si el destino cae, el impacto se propaga hacia el origen.

### Vista 3D (por defecto)

La vista 3D representa el centro de datos como una **sala ordenada**:

- **Infraestructura:** los servidores físicos se agrupan por su rack en bloques alineados, organizados en filas (`Fila A · RACK-01`, `Fila B · …`).
- **Virtualización:** cada host aparece al frente de su bloque con sus máquinas virtuales en cuadrícula detrás (`Host …`); las VMs de un clúster sin host físico en el mapa se agrupan en su propio bloque (`Clúster …`).
- Los servidores físicos se dibujan como gabinetes de rack (armario alto con sus unidades y luces de estado) y las VMs como cubos translúcidos. Cada fila, host, clúster y área lleva su rótulo en el borde frontal.
- Las relaciones son arcos que pasan por encima de los equipos (más altos cuanto más lejos está el destino), con partículas que avanzan del origen al destino. Al pasar el puntero sobre un servidor, o al seleccionarlo, sus relaciones se resaltan y las demás se atenúan.
- Los nombres de los servidores nunca se superponen: si dos chocan, uno se eleva con una línea guía hacia su equipo o se oculta temporalmente; las etiquetas de los servidores seleccionados, caídos o afectados tienen prioridad. Al pasar el puntero sobre un servidor se muestra su ficha breve con el nombre completo.
- Al abrir el mapa (y con **Encajar**) la cámara se ajusta para que todo el contenido ocupe la vista.

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

- **Disposición 3D:** *sala de datos* (por defecto) o *posiciones del editor*, que coloca los servidores donde los dejaste en el Editor 2D.
- **Modo rendimiento 3D:** menor resolución y sin animaciones de fondo para que el giro sea fluido en equipos modestos. Se activa solo (con un aviso) si el equipo no alcanza unos 40 fps al abrir el mapa; puedes cambiarlo cuando quieras y se recuerda en tu navegador.
- **Animaciones**, **Mostrar filtros**, **Mostrar todos los servidores** (incluye los que aún no tienen relaciones) y **Atajos de teclado**.

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
- **Simular caída:** activa el modo simulación y haz clic en uno o varios servidores para ver qué pasaría si cayeran (o pulsa `S` con un servidor seleccionado). El mapa resalta la cadena de impacto por niveles, atenúa los servidores no relacionados y el indicador muestra el resumen (por ejemplo, *«Si cae srv-nas-01, se ven afectados 12 servidores»*). Un segundo clic en un servidor quita su caída simulada. No modifica datos ni envía alertas. Sales con el mismo botón, con la **×** de la banda superior o con `Esc`.
- **Ver solo impacto** (en el detalle del indicador) atenúa todo lo que no está afectado.

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

Accede a **📡 Monitoreo** desde el menú. El sistema realiza checks automatizados de disponibilidad (ping, TCP, HTTP) a los servidores registrados.

### Funcionalidades

- **Dashboard de checks**: visualización del estado actual de cada servidor monitoreado.
- **Incidentes**: registro automático de caídas y recuperaciones.
- **Ventanas de Mantenimiento**: programa ventanas donde las alertas se silencian.
- **Alertas por Email**: notificaciones automáticas cuando un servidor cae o se recupera (requiere SMTP configurado).

---

## Actualizaciones en Tiempo Real

El sistema utiliza **Server-Sent Events (SSE)** para sincronizar datos automáticamente:

- 🔄 Al crear, editar, mover o eliminar un servidor, todos los usuarios verán los cambios.
- 🔄 Al crear o eliminar un rack, la vista se actualiza.
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

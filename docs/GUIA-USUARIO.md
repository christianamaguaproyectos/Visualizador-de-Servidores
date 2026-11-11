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

---

## Servidores Virtuales

La vista de **Virtuales** organiza las máquinas virtuales por **hosts ESXi** y/o **clusters**. Funciona de forma similar a la vista física, con las siguientes diferencias:

- Las VMs se agrupan por **cluster → host**.
- Puedes cambiar la vista entre **Clusters**, **Hosts** o **Lista**.
- Puedes agregar VMs directamente dentro de un host.

Los filtros de estado (**Críticos**, **No Críticos**, **En Mantenimiento**) también están disponibles en esta vista.

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

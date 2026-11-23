# Guía de demostración con Docker (Windows)

Cómo levantar el sistema completo en un equipo con Windows desde cero, cargar datos de demostración y recorrer el **Mapa de Dependencias**. Todos los comandos se ejecutan en **PowerShell** desde la carpeta del proyecto.

---

## 1. Requisitos

- **Docker Desktop** para Windows, iniciado (icono de la ballena en verde). Incluye `docker compose`.
- Los puertos **3000** (aplicación) y **5432** (PostgreSQL, solo accesible desde el propio equipo) libres. Si alguno está ocupado, cámbialo en el `.env` (`APP_PORT`, `POSTGRES_PORT`).
- Un navegador actual (Chrome, Edge o Firefox) con WebGL activo para la vista 3D. Sin WebGL el mapa se abre en el Editor 2D.

## 2. Configurar el archivo `.env`

```powershell
Copy-Item .env.docker.example .env
```

Abre `.env` y rellena como mínimo estas dos variables (el resto puede quedar como está):

| Variable | Valor |
|----------|-------|
| `POSTGRES_PASSWORD` | `<TU_CONTRASEÑA_DE_BD>`: una contraseña propia para la base de datos |
| `SESSION_SECRET` | `<SESSION_SECRET>`: 64 caracteres aleatorios (ver comando siguiente) |

Para generar el `SESSION_SECRET` en PowerShell:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { $_.ToString('x2') }) -join ''
```

> El archivo `.env` contiene secretos: no lo compartas ni lo subas al repositorio.

## 3. Levantar el sistema

```powershell
docker compose up -d --build
docker compose ps
```

La primera vez tarda unos minutos (descarga las imágenes y construye la aplicación). Está listo cuando `docker compose ps` muestra `app` y `postgres` como **healthy**.

Al crear la base por primera vez, PostgreSQL aplica todos los esquemas de `scripts/sql/`, incluido el del Mapa de Dependencias.

**Solo si la base de datos ya existía** (instalación anterior a este módulo), aplica el esquema a mano; es idempotente y no modifica datos:

```powershell
docker compose exec postgres sh -c 'psql -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d $POSTGRES_DB -f /docker-entrypoint-initdb.d/08-schema.dependencies.sql'
```

## 4. Crear el usuario administrador

```powershell
docker compose run --rm tools node scripts/manage-users.js add --username admin --password "<TU_CONTRASEÑA>" --role admin --name "Administrador"
```

La contraseña debe tener entre 8 y 256 caracteres. La primera vez, este comando construye la imagen de herramientas (`tools`). Si más adelante actualizas el código, reconstrúyela con `docker compose build tools`.

## 5. Cargar los datos de demostración

```powershell
docker compose run --rm tools node scripts/seed-demo-topologia.js
```

Crea 16 servidores ficticios (`srv-web-01`, `srv-db-01`…, IPs `10.0.0.x`) en racks, dos hosts con máquinas virtuales y un clúster; 23 relaciones de distintos tipos (con una dependencia circular `srv-web-01 ↔ srv-api-01` y la cadena `srv-api-01 → srv-db-01`); estado de monitoreo fijo con **srv-db-01 caído** y **srv-bkp-01 degradado**; y las posiciones del *Mapa General*.

El script se puede ejecutar varias veces sin duplicar nada y no modifica datos reales.

## 6. Abrir la aplicación

Abre **http://localhost:3000** (o el puerto que pusiste en `APP_PORT`) e inicia sesión con el usuario `admin`.

## 7. Recorrido de demostración

1. **Inicio:** el panel muestra las secciones; pulsa la tarjeta **Mapa de Dependencias** (o el enlace del menú lateral).
2. **Mapa 3D:** la sala de datos aparece encuadrada: racks en fila, hosts con sus VMs y el clúster. `srv-db-01` brilla en rojo y el indicador superior derecho resume *2 caídas · 7 afectados*. Gira con el ratón y acerca con la rueda.
3. **Pasar el puntero y hacer clic:** al pasar sobre un servidor se resaltan sus relaciones y se atenúan las demás; con un clic se abre el inspector con sus datos, de quién depende y quién depende de él.
4. **Simular caída:** pulsa **Simular caída** y haz clic en `srv-nas-01`. El mapa resalta toda la cadena de impacto y el indicador explica cuántos servidores se ven afectados. Sal con la **×** de la banda superior o con `Esc`.
5. **Editor 2D y nueva relación:** pulsa **Editor 2D**, pasa el puntero sobre una tarjeta, arrastra desde uno de sus puntos de conexión hasta otra tarjeta y completa el formulario (tipo y criticidad). La relación aparece al guardar.
6. **Detalle de servidor:** en **Servidores Físicos**, abre `srv-db-01`. Debajo de la ficha, el bloque **Dependencias e impacto** lista sus relaciones con su estado; **Abrir en el mapa** vuelve al mapa con ese servidor seleccionado.

Más detalles de cada función en la [Guía de usuario](./GUIA-USUARIO.md#mapa-de-dependencias).

## 8. Borrar los datos de demostración

```powershell
docker compose run --rm tools node scripts/seed-demo-topologia.js --borrar
```

Elimina solo lo que creó el script (servidores, relaciones, posiciones, hosts de monitoreo y racks de demostración); los datos propios no se tocan.

## 9. Apagar

```powershell
docker compose down
```

Detiene y elimina los contenedores, pero **conserva los datos** (volúmenes) para la próxima vez (`docker compose up -d`).

Para empezar de cero borrando también la base de datos y los archivos subidos:

```powershell
docker compose down -v
```

## Problemas frecuentes

| Síntoma | Solución |
|---------|----------|
| `Defina POSTGRES_PASSWORD en .env` | Falta el archivo `.env` o la variable: repite el paso 2. |
| `port is already allocated` | Otro programa usa el puerto: cambia `APP_PORT` o `POSTGRES_PORT` en `.env` y vuelve a ejecutar `docker compose up -d`. |
| El mapa muestra error al cargar | La base es anterior al módulo: aplica el esquema del paso 3. |
| La vista 3D no aparece | El navegador no tiene WebGL: el mapa se abre en el Editor 2D. Activa la aceleración por hardware del navegador. |
| El 3D va lento | El mapa pasa solo a **modo rendimiento**; también puedes elegirlo en **⋯ (Más opciones)**. |

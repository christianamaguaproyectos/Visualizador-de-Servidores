# Guía de demostración con Docker (Windows)

Cómo levantar el sistema completo en un equipo con Windows desde cero, cargar datos de demostración y recorrer el **Mapa de Dependencias**. Todos los comandos se ejecutan en **PowerShell** desde la carpeta del proyecto.

---

## 1. Requisitos

- **Docker Desktop** para Windows, iniciado (icono de la ballena en verde). Incluye `docker compose`.
- Los puertos **3000** (aplicación) y **5432** (PostgreSQL, solo accesible desde el propio equipo) libres. Si alguno está ocupado, cámbialo en el `.env` (`APP_PORT`, `POSTGRES_PORT`).
- Un navegador actual (Chrome, Edge o Firefox) con WebGL activo para la vista 3D. Sin WebGL el mapa se abre en el Editor 2D.

Para abrir PowerShell en la carpeta del proyecto: en el Explorador de archivos, entra en la carpeta, escribe `powershell` en la barra de direcciones y pulsa **Enter**. Comprueba que Docker responde:

```powershell
docker version
```

### Antes de empezar: contenedores con el mismo nombre

Los contenedores de este proyecto tienen nombres fijos: **`diagrama-app`** y **`diagrama-postgres`**. Si ya existen en el equipo (por ejemplo, de otra copia del proyecto), Docker no puede crear los nuevos. Compruébalo:

```powershell
docker ps -a --filter "name=diagrama-"
```

Si aparecen, detenlos antes de seguir con `docker compose down` **desde la carpeta de la copia que los creó** (los datos de sus volúmenes se conservan). Si ya no tienes esa carpeta, elimínalos por nombre:

```powershell
docker rm -f diagrama-app diagrama-postgres
```

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

**Solo si la base de datos ya existía** (instalación anterior o base real), ponla al día sin tocar sus datos; antes haz un respaldo. Detalles en [GUIA-BASE-DATOS-REAL.md](./GUIA-BASE-DATOS-REAL.md):

```powershell
docker compose run --rm tools node scripts/actualizar-bd.js --aplicar
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

Crea 30 servidores ficticios (`srv-web-01`, `srv-db-01`…, IPs `10.0.0.x`): **cinco racks de 42U** (`RACK-A1` a `RACK-A5`) con 22 equipos físicos de 1U, 2U y 4U en su posición, con huecos libres y un equipo sin posición que ocupa el primer hueco; dos hosts con máquinas virtuales y un clúster; 23 relaciones de distintos tipos (con una dependencia circular `srv-web-01 ↔ srv-api-01` y la cadena `srv-api-01 → srv-db-01`); estado de monitoreo fijo con **srv-db-01 caído** y **srv-bkp-01 degradado**; y las posiciones del *Mapa General*.

El script se puede ejecutar varias veces sin duplicar nada y no modifica datos reales.

También genera **24 h de telemetría de demostración** por servidor (latencias con variación, el servidor caído sin respuesta en los últimos minutos y el degradado con respuestas lentas), para que **Monitoreo** muestre las ondas de inmediato. Son datos sintéticos: no se hace ninguna conexión de red y los checks de demostración siguen desactivados. Para que las ondas sigan avanzando en vivo durante la presentación, deja corriendo en otra terminal:

```powershell
docker compose run --rm tools node scripts/seed-demo-topologia.js --telemetria-continua
```

Añade un punto cada 15 s por servidor de demostración hasta que lo detengas con `Ctrl+C`.

## 6. Abrir la aplicación

Abre **http://localhost:3000** (o el puerto que pusiste en `APP_PORT`) e inicia sesión con el usuario `admin`.

## 7. Recorrido de demostración

1. **Inicio:** el panel muestra las secciones; pulsa la tarjeta **Mapa de Dependencias** (o el enlace del menú lateral).
2. **Sala de racks 3D:** aparecen los cinco racks en fila, cada uno con su nombre y su ocupación (`RACK-A3 · 14/42U`), y a la derecha la zona de virtualización con los hosts y el clúster. `srv-db-01` (en `RACK-A5`, U29–U30) tiene el frontal en rojo y una etiqueta roja visible; el indicador superior derecho resume *2 caídas reales · 7 afectados* y al pulsarlo se despliega el detalle. Gira con el ratón y acerca con la rueda.
3. **Un rack de cerca:** haz doble clic en `RACK-A3`. Se ve de frente con la numeración de las U y cada equipo en su unidad (`srv-nas-01` ocupa U21–U24, como en la vista de rack de **Servidores Físicos**); el clic abre su ficha con los huecos libres.
4. **Pasar el puntero y hacer clic:** al pasar sobre un servidor se ve su resumen (rack, U, modelo) y se resaltan sus relaciones; con un clic se abre el inspector con sus datos, de quién depende y quién depende de él, y su ficha de inventario. **Ver en inventario** abre su detalle en **Servidores Físicos**.
5. **Tiempo real:** en otra pestaña, agrega un servidor en **Servidores Físicos** (por ejemplo en `RACK-A4`, posición 20, 2U) o usa **Agregar servidor en este rack** desde la ficha del rack. Al guardar, el equipo aparece en su U en la sala 3D sin recargar; al eliminarlo, desaparece.
6. **Simular caída:** pulsa **Simular caída** y haz clic en `srv-nas-01`. El mapa resalta toda la cadena de impacto y el indicador separa las **caídas reales (monitoreo)** de las **caídas simuladas**, cada una con su conteo, y cuántos servidores se ven afectados. Sal con la **×** de la banda superior o con `Esc`.
7. **Editor 2D y nueva relación:** pulsa **Editor 2D**, pasa el puntero sobre una tarjeta, arrastra desde uno de sus puntos de conexión hasta otra tarjeta y completa el formulario (tipo y criticidad). La relación aparece al guardar.
8. **Monitoreo en tiempo real:** abre **Monitoreo**. Cada rack aparece como un gabinete con un punto de estado por servidor y su onda de latencia; `RACK-A5` se marca *1 caído*. Pulsa el rack para ver sus servidores y `srv-db-01` para abrir su panel: la onda muestra cuándo dejó de responder y la franja inferior cada ejecución fallida.
9. **Detalle de servidor:** en **Servidores Físicos**, abre `srv-db-01`. En la fila superior, el botón **🔗 Dependencias e impacto** (con el número de relaciones) lleva al bloque del mismo nombre, que lista sus relaciones con su estado y el impacto en cascada; **Abrir en el mapa** vuelve al mapa con ese servidor seleccionado.

Más detalles de cada función en la [Guía de usuario](./GUIA-USUARIO.md#mapa-de-dependencias).

## 8. Borrar los datos de demostración

```powershell
docker compose run --rm tools node scripts/seed-demo-topologia.js --borrar
```

Elimina solo lo que creó el script (servidores, relaciones, posiciones, hosts de monitoreo con su telemetría y racks de demostración); los datos propios no se tocan.

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
| `The container name "/diagrama-app" is already in use` | Hay contenedores de otra copia del proyecto: ver *Antes de empezar* en el paso 1. |
| `port is already allocated` | Otro programa usa el puerto: cambia `APP_PORT` o `POSTGRES_PORT` en `.env` y vuelve a ejecutar `docker compose up -d`. |
| El mapa muestra error al cargar | La base es anterior al módulo: aplica el esquema del paso 3. |
| La vista 3D no aparece | El navegador no tiene WebGL: el mapa se abre en el Editor 2D. Activa la aceleración por hardware del navegador. |
| El 3D va lento | El mapa pasa solo a **modo rendimiento**; también puedes elegirlo en **⋯ (Más opciones)**. |

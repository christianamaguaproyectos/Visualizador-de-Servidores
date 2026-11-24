# Guía: usar la aplicación con una base de datos real

Esta guía explica cómo conectar la aplicación a una base de datos PostgreSQL **existente** (con inventario, monitoreo y usuarios propios), ponerla al día con el esquema actual sin perder datos y comprobar que todo funciona. No se cargan datos de demostración.

En los ejemplos, los valores entre `< >` son tuyos: `<USUARIO_BD>`, `<TU_CONTRASEÑA>`, `<SERVIDOR_BD>`, `<NOMBRE_BD>`.

---

## 1. Antes de empezar: respaldo

Haz siempre un respaldo completo antes de actualizar el esquema.

```powershell
pg_dump -h <SERVIDOR_BD> -U <USUARIO_BD> -d <NOMBRE_BD> -Fc -f respaldo-antes-de-actualizar.dump
```

Con la base dentro de Docker Compose:

```powershell
docker compose exec postgres sh -c 'pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -Fc -f /tmp/respaldo.dump'
docker compose cp postgres:/tmp/respaldo.dump ./respaldo-antes-de-actualizar.dump
```

Guarda el archivo fuera del servidor.

---

## 2. Apuntar la aplicación a la base

La aplicación lee la conexión de dos variables con el mismo valor: `POSTGRES_URL` (consultas) y `DATABASE_URL` (Prisma).

### Opción A: la base real vive en otro servidor

**Sin Docker** (Node 22): en el archivo `.env` de la raíz del proyecto:

```env
POSTGRES_URL=postgresql://<USUARIO_BD>:<TU_CONTRASEÑA>@<SERVIDOR_BD>:5432/<NOMBRE_BD>
DATABASE_URL=postgresql://<USUARIO_BD>:<TU_CONTRASEÑA>@<SERVIDOR_BD>:5432/<NOMBRE_BD>
SESSION_SECRET=<SESSION_SECRET>
MONITORING_ENABLED=1
```

y arranca con `npm ci` y `npm start`.

**Con Docker Compose**: el servicio `app` se conecta por defecto al contenedor `postgres`. Para usar otro servidor, crea `docker-compose.override.yml` junto a `docker-compose.yml`:

```yaml
services:
  app:
    environment:
      POSTGRES_URL: postgresql://<USUARIO_BD>:<TU_CONTRASEÑA>@<SERVIDOR_BD>:5432/<NOMBRE_BD>
      DATABASE_URL: postgresql://<USUARIO_BD>:<TU_CONTRASEÑA>@<SERVIDOR_BD>:5432/<NOMBRE_BD>
  tools:
    environment:
      POSTGRES_URL: postgresql://<USUARIO_BD>:<TU_CONTRASEÑA>@<SERVIDOR_BD>:5432/<NOMBRE_BD>
      DATABASE_URL: postgresql://<USUARIO_BD>:<TU_CONTRASEÑA>@<SERVIDOR_BD>:5432/<NOMBRE_BD>
```

El servidor de base de datos debe aceptar conexiones desde el equipo donde corre Docker.

### Opción B: te entregan un respaldo (`.dump`) y lo cargas en el PostgreSQL de Docker

```powershell
docker compose up -d postgres
docker compose cp ./respaldo-real.dump postgres:/tmp/respaldo-real.dump
docker compose exec postgres sh -c 'pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --clean --if-exists --no-owner --no-privileges /tmp/respaldo-real.dump'
```

`--clean --if-exists` sustituye las tablas vacías que Docker crea al iniciar la base por las del respaldo. Si el respaldo es un archivo `.sql` de texto, cárgalo con `psql -U $POSTGRES_USER -d $POSTGRES_DB -f /tmp/respaldo-real.sql`.

---

## 3. Poner el esquema al día

`scripts/actualizar-bd.js` compara la base con lo que necesita la aplicación y aplica **solo lo que falta** (tablas del Mapa de Dependencias, columnas de posición en rack, índices de telemetría, etc.). Todos los scripts son idempotentes: no borran ni modifican datos, y se puede ejecutar tantas veces como quieras.

1. **Revisar** (no cambia nada; muestra lo que falta y cuántas filas tiene cada tabla):

   ```powershell
   node scripts/actualizar-bd.js
   # con Docker:
   docker compose run --rm tools node scripts/actualizar-bd.js
   ```

2. **Aplicar** (tras el respaldo):

   ```powershell
   node scripts/actualizar-bd.js --aplicar
   # con Docker:
   docker compose run --rm tools node scripts/actualizar-bd.js --aplicar
   ```

   Cada script se aplica en su propia transacción; si alguno falla, ese script se deshace y el proceso se detiene con el motivo. Al final debe aparecer:

   ```
   Verificación correcta: el esquema está completo y no se perdió ninguna fila.
   ```

Si el usuario de la base no es su dueño, el script omite con un aviso solo los permisos y el `search_path` por defecto; la aplicación funciona igual porque siempre usa nombres con esquema.

> Si actualizas el código más adelante, vuelve a ejecutar `actualizar-bd.js --aplicar`: incorporará lo nuevo sin tocar tus datos. Con Docker, reconstruye antes la imagen de herramientas: `docker compose build tools`.

---

## 4. Usuario administrador

Si la base no tiene usuarios (o no conoces sus contraseñas), crea uno:

```powershell
node scripts/manage-users.js add --username admin --password "<TU_CONTRASEÑA>" --role admin --name "Administrador"
# con Docker:
docker compose run --rm tools node scripts/manage-users.js add --username admin --password "<TU_CONTRASEÑA>" --role admin --name "Administrador"
```

---

## 5. No cargues datos de demostración

**No ejecutes** `scripts/seed-demo-topologia.js` sobre la base real. Si se ejecutó por error, `node scripts/seed-demo-topologia.js --borrar` elimina únicamente lo que ese script creó (servidores `srv-…` marcados como demostración, sus relaciones, sus hosts de monitoreo con su telemetría y sus racks vacíos); tus datos no se tocan.

---

## 6. Comprobar que todo funciona

Arranca la aplicación (`npm start` o `docker compose up -d --build`), inicia sesión y revisa:

| Página | Qué debe verse |
|---|---|
| **Inicio** | Las tarjetas de acceso a cada sección. |
| **Servidores Físicos** | Tus racks como gabinetes con sus servidores en su posición (los que no tienen posición ocupan el primer hueco libre). Buscar, filtrar y abrir el detalle de un servidor. |
| **Servidores Virtuales** | Tus VMs agrupadas por host o clúster, con su estado de inventario y de monitoreo. |
| **Mapa de Dependencias** | La sala de racks 3D con todo el inventario (el contador superior derecho debe indicar `Inventario N/N`). Sin relaciones todavía: el mapa muestra los servidores y permite crear la primera con **Nueva relación**. Con la base vacía indica que el inventario no tiene servidores. |
| **Monitoreo** | Un gabinete por rack con el estado de cada host de monitoreo y su onda de latencia si ya hay ejecuciones. Sin hosts, un mensaje indica cómo importarlos (**Hosts → Importar Hosts**). Los checks se programan en la pestaña **Checks**; para que lleguen a los servidores internos, define `MONITORING_ALLOWED_CIDRS` con las subredes permitidas (por defecto se bloquean las direcciones privadas). |
| **Usuarios** | La lista de cuentas (solo superadministrador). |

Ninguna página debe quedarse en "Cargando": si una petición falla, la página muestra el motivo y un botón **Reintentar**. Con muchos servidores (miles), las páginas siguen respondiendo; el mapa 3D puede tardar unos segundos más la primera vez.

---

## 7. Volver atrás

Si algo no sale como esperabas, restaura el respaldo del paso 1:

```powershell
pg_restore -h <SERVIDOR_BD> -U <USUARIO_BD> -d <NOMBRE_BD> --clean --if-exists --no-owner respaldo-antes-de-actualizar.dump
```

Con Docker:

```powershell
docker compose cp ./respaldo-antes-de-actualizar.dump postgres:/tmp/respaldo.dump
docker compose exec postgres sh -c 'pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --clean --if-exists --no-owner /tmp/respaldo.dump'
```

Las tablas que añadió la actualización (por ejemplo, las del Mapa de Dependencias) no existen en el respaldo y quedan vacías; no afectan a las versiones anteriores de la aplicación.

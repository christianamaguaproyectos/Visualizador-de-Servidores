# QA Smoke Checklist

Fecha: 2026-03-16
Entorno: Docker local (app:8082, postgres:5432)

## Objetivo
Validar rapidamente los flujos criticos despues de cambios de seguridad/refactor frontend-backend.

## Precondiciones
- Contenedores arriba y saludables: `docker compose ps`
- App en `http://localhost:8082`
- Usuario de prueba disponible para login

## Flujos criticos
1. Home y login
- [ ] Abrir `http://localhost:8082/`
- [ ] Verificar redireccion/visual de login
- [ ] Abrir `http://localhost:8082/login.html`

2. Autenticacion
- [ ] Login exitoso con credenciales validas
- [ ] Login fallido muestra error sin romper UI
- [ ] `GET /api/auth/session` responde 200 con campo `requestId`

3. Monitoreo (protegido)
- [ ] Sin sesion: `GET /api/monitoring/dashboard` responde 401
- [ ] Con sesion: dashboard carga KPIs e incidentes
- [ ] Acciones de incidentes (ACK/Resolver/Ver) funcionan

4. Hosts y checks
- [ ] Listado de hosts carga sin errores
- [ ] Eliminar host pide confirmacion y refresca datos
- [ ] Ejecutar check manual y ver resultado

5. Vista virtual y clusters
- [ ] Navegacion por menu virtual (clusters/vsphere)
- [ ] Ver detalle de cluster y volver
- [ ] Editar/eliminar vista dinamica funciona

6. Usuarios
- [ ] `users.html` carga
- [ ] Alta/edicion/baja segun permisos

## Comandos utiles
```powershell
# Estado de servicios

docker compose ps

# Logs recientes de app

docker compose logs --tail 80 app

# Smoke API rapido (sin sesion)

$base='http://localhost:8082';
'/','/login.html','/monitoring.html','/users.html','/api/auth/session','/api/monitoring/dashboard' |
  ForEach-Object {
    try { (Invoke-WebRequest -Uri ($base+$_) -UseBasicParsing).StatusCode }
    catch { if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode.value__ } else { -1 } }
  }
```

## Resultado de ejecucion actual
- [x] `/` -> 200
- [x] `/login.html` -> 200
- [x] `/monitoring.html` -> 200
- [x] `/users.html` -> 200
- [x] `/api/auth/session` -> 200
- [x] `/api/monitoring/dashboard` -> 401 (esperado sin sesion)
- [x] `requestId` presente en `/api/auth/session`
- [x] Contenedores `app` y `postgres` en `healthy`

## Resultado autenticado (sesion real)
- [x] Login `admin` exitoso (`/api/auth/login` -> 200)
- [x] `/api/monitoring/dashboard` -> 200 con `requestId`
- [x] `/api/monitoring/incidents?limit=10&offset=0` -> 200 con `requestId`
- [x] `/api/monitoring/checks?limit=10&offset=0` -> 200 con `requestId`
- [x] Script usado: `node scripts/monitoring/smokeAuthFlows.mjs`

## Riesgos residuales
- Validacion funcional completa de UI requiere sesion interactiva (navegador) para confirmar flujos de negocio de extremo a extremo.

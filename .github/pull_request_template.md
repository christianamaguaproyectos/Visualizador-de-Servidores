## Descripción del PR

Describe brevemente qué fases o ítems del plan [`docs/AUDITORIA-SEGURIDAD-Y-PLAN-MEJORA-2026.md`](../docs/AUDITORIA-SEGURIDAD-Y-PLAN-MEJORA-2026.md) implementa este Pull Request:

- **Fases cubiertas:** (ej. Fase 0, Fase 1, Fase 2, Fase 3, Fase 4)
- **IDs de hallazgos resueltos:** (ej. `SEC-CRIT-01`, `SEC-CRIT-03`, `SEC-CRIT-04`, `BUG-CRIT-09`, ...)

---

## Checklist de Seguridad y Calidad (Obligatorio para Aprobación)

### 1. Seguridad y Secretos
- [ ] Ningún archivo `.env`, `users.json`, `.xlsx` ni volcado SQL fuera de `scripts/sql/` está incluido en el commit (`git status` / `git diff --stat` verificado).
- [ ] No existen contraseñas, hashes ni `SESSION_SECRET` por defecto hardcodeados en código o `docker-compose.yml`.
- [ ] `npm audit --omit=dev` reporta **0 vulnerabilidades** críticas/altas/moderadas.
- [ ] Endpoints de escritura/administración (`/api/servers`, `/api/racks`, `/api/clusters`, `/api/users`, `/api/monitoring/hosts`, `/api/monitoring/checks`, `/api/monitoring/alert-recipients`, `/users.html`) validan rol en backend (`requireAdmin` / `requireSuperAdmin`) y devuelven `403` para usuarios `viewer`.
- [ ] Protección anti-SSRF / anti-inyección de argumentos validada en checks ICMP, TCP y HTTP.
- [ ] Todas las salidas dinámicas en frontend usan `textContent` o escape HTML seguro (sin XSS en timeline de incidentes, `toast.js`, discos ni clusters).

### 2. Estabilidad, Base de Datos y No-Regresión
- [ ] Contratos JSON existentes con el frontend se mantienen compatibles.
- [ ] Rutas Express pasan `(req, res, next)` al controlador y delegan errores a `errorHandler` sin filtrar errores crudos de PostgreSQL (`err.message`).
- [ ] Edición y creación de servidores funciona desde vista de rack y detalle disparando una sola petición HTTP y conservando los campos de seguridad/storage.
- [ ] Cambio de contraseña en `/users` y recuperación de contraseña en `/login` probados extremo a extremo.
- [ ] Sin creación de `pg.Pool` efímeros por petición; apagado limpio (`SIGTERM`/`SIGINT`) verificado.

### 3. Evidencia de Pruebas Adjunta
- [ ] `npm test` y `npm run lint` pasan sin errores (si Fase 4 ya está incluida).
- [ ] `docker compose build` construye limpiamente sin incluir secretos locales en la imagen.

---

## Notas de Despliegue / Migración (si aplica)

- Variables de entorno nuevas o requeridas en `.env`:
- Cambios o scripts SQL a ejecutar en PostgreSQL:

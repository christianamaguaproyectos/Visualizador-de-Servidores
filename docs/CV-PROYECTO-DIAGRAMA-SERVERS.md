# Guia para CV - Proyecto Visualizador Interactivo de Racks de Servidores

## Resumen corto (1 linea)
Implemente mejoras de seguridad, observabilidad y arquitectura en una plataforma Node.js/Express + PostgreSQL para gestion y monitoreo de infraestructura, elevando su confiabilidad operativa en entorno on-prem.

## Version resumen (3-4 lineas)
Lidere la evolucion tecnica de una plataforma de visualizacion de racks y monitoreo de servidores, con frontend en JavaScript modular y backend en Node.js/Express con PostgreSQL. Aplique hardening de seguridad (XSS, validaciones, sesiones), trazabilidad con `requestId` y logging estructurado JSON. Refactorice componentes criticos para reducir deuda tecnica y habilite smoke tests autenticados y checklists QA para despliegues mas seguros.

## Bullet points sugeridos para CV (impacto tecnico)
- Diseñe e implemente hardening de seguridad end-to-end: mitigacion XSS en frontend, validaciones de entrada y mejoras de control de sesion en backend.
- Estandarice trazabilidad operativa con `requestId` y logs estructurados JSON para acelerar diagnostico y resolucion de incidentes.
- Refactorice modulos de alto acoplamiento en frontend, extrayendo componentes reutilizables para mejorar mantenibilidad.
- Implemente pruebas smoke automatizadas autenticadas para endpoints criticos (`dashboard`, `incidents`, `checks`) y proceso de validacion QA repetible.
- Orqueste despliegue y validacion en Docker Compose con servicios saludables y verificacion de flujos publicos y protegidos.

## Stack y herramientas para seccion "Tecnologias"
- Backend: Node.js, Express, express-session, middleware de seguridad
- Frontend: JavaScript (ES Modules), HTML, CSS, event delegation
- Base de datos: PostgreSQL
- Observabilidad: logging JSON estructurado, correlacion por requestId
- DevOps/Infra: Docker, Docker Compose, PowerShell
- Calidad: smoke testing automatizado, checklist QA

## Competencias demostrables
- Application Security (OWASP basico aplicado)
- Refactorizacion incremental y reduccion de deuda tecnica
- Troubleshooting de sesiones/autenticacion en contenedores
- Arquitectura orientada a dominios (aplicacion pragmatica)
- Operacion y soporte con enfoque SRE/Well-Architected

## Ejemplo de redaccion para LinkedIn (copiar/ajustar)
Fortaleci una plataforma de gestion y monitoreo de servidores (Node.js/Express + PostgreSQL), implementando mejoras de seguridad, trazabilidad y mantenibilidad. Estandarice request correlation con `requestId`, logging estructurado y pruebas smoke autenticadas para endpoints criticos, logrando despliegues mas predecibles y una operacion mas confiable en entorno on-prem.

## Nota para entrevista tecnica
Si te preguntan "que problema complejo resolviste", usa este caso:
- Contexto: login respondia 200 pero endpoints protegidos devolvian 401 en contenedor.
- Causa raiz: cookie de sesion marcada `secure` en HTTP por entorno production.
- Solucion: `secure: 'auto'` + validacion automatizada de flujos autenticados.
- Resultado: 0 fallos en smoke autenticado y sesion estable en entorno objetivo.

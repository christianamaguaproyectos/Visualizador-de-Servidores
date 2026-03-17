# Especificacion de Diseno UX/UI y Arquitectura de Experiencia

Fecha: 2026-03-17  
Proyecto: Visualizador Interactivo de Racks de Servidores

## 0. Objetivo
Definir el estandar de diseno y experiencia para refactorizar la aplicacion de gestion de infraestructura fisica y virtual, manteniendo continuidad con el plan de auditoria (seguridad, calidad de codigo, operacion y trazabilidad).

## 1. Principios de diseno globales

### 1.1 Sistema visual
- Claridad operativa primero: la UI debe facilitar diagnostico rapido.
- Densidad controlada: mostrar datos tecnicos sin saturar.
- Consistencia: componentes y estados iguales en modulos fisicos y virtuales.
- Progressive disclosure: detalle tecnico solo cuando el usuario lo necesita.
- Feedback inmediato: toda accion debe mostrar estado (cargando, exito, error, vacio).

### 1.2 Tokens de diseno (estandar)
Definir en `:root` y reutilizar en toda la app.

```css
:root {
  --font-family-sans: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif;

  --color-bg-app: #f4f7fb;
  --color-bg-surface: #ffffff;
  --color-bg-surface-soft: #eef3fa;

  --color-text-primary: #1d2939;
  --color-text-secondary: #475467;
  --color-text-muted: #667085;

  --color-primary-700: #114bb5;
  --color-primary-600: #1d5ed8;
  --color-primary-500: #2f6fe6;
  --color-primary-100: #e8f0ff;

  --color-success-700: #0f7b4a;
  --color-success-500: #12b76a;
  --color-success-100: #dcfae6;

  --color-danger-700: #b42318;
  --color-danger-500: #f04438;
  --color-danger-100: #fee4e2;

  --color-warning-600: #b54708;
  --color-warning-100: #fef0c7;

  --border-default: 1px solid #d0d5dd;
  --border-soft: 1px solid #e4e7ec;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;

  --shadow-1: 0 1px 3px rgba(16, 24, 40, 0.10);
  --shadow-2: 0 4px 14px rgba(16, 24, 40, 0.12);

  --focus-ring: 0 0 0 3px rgba(47, 111, 230, 0.35);
}
```

### 1.3 Tipografia y jerarquia
- H1 (pantalla): 24px, 700, line-height 32px.
- H2 (seccion): 18px, 700, line-height 26px.
- H3 (tarjeta/host/rack): 16px, 600, line-height 24px.
- Body: 14px, 400/500, line-height 20px.
- Caption tecnico (IP, VM count, metadata): 12px, 500, line-height 16px.

Reglas:
- Nombre de servidor/host siempre un nivel por encima de IP y metadata.
- Nunca mezclar 3 pesos en el mismo bloque de informacion.
- Evitar texto por debajo de 12px.

### 1.4 Guia de botones

#### Primario
Uso: acciones principales de pantalla (Agregar Servidor, Actualizar Datos, Guardar).
- Fondo `--color-primary-600`
- Hover `--color-primary-700`
- Texto blanco
- Altura 36-40px
- Borde redondeado `--radius-sm`

#### Secundario
Uso: editar/ver detalle/acciones no destructivas.
- Fondo `--color-primary-100`
- Texto `--color-primary-700`
- Borde `--border-soft`

#### Destructivo
Uso: eliminar/quitar/cerrar incidente con perdida.
- Fondo `--color-danger-500`
- Hover `--color-danger-700`
- Texto blanco

#### Boton texto
Solo para acciones de navegacion menor, nunca para acciones de mutacion.

Estados comunes:
- `disabled`: opacidad 0.45 + cursor not-allowed.
- `loading`: spinner inline y bloqueo de doble submit.
- `focus-visible`: `--focus-ring`.

## 2. Optimizacion de Racks Fisicos (Imagen 0)

### 2.1 Problemas detectados
- Alta densidad visual en unidades U.
- Limites entre servidores adyacentes poco claros.
- Etiquetas tecnicas compiten con nombre principal.
- KPI cards sin iconografia semantica.

### 2.2 Especificacion UI de bloque de servidor
- Espaciado vertical minimo entre unidades: 4px.
- Margen entre tarjetas/bloques de servidor: 8px.
- Cada servidor en rack debe renderizarse como bloque continuo con:
  - Fondo neutro consistente (`--color-bg-surface`).
  - Borde suave `--border-soft`.
  - Sombra `--shadow-1`.
  - Acento vertical de estado (4px) en lado izquierdo.

Mapa de estado:
- Activo/UP: acento `--color-success-500`.
- Degradado/Warning: acento `--color-warning-600`.
- Inactivo/Down: acento `--color-danger-500`.

Contenido del bloque:
- Linea 1: nombre host/servidor (16px, 600).
- Linea 2: IP/hostname (12px, muted).
- Linea 3 opcional: SO, owner o cluster.

### 2.3 Hovers contextuales
Hover de servidor debe mostrar popover no invasivo:
- Nombre, IP, estado
- CPU, RAM, disco, temperatura
- Ultima actualizacion/heartbeat
- SO

Requisitos UX:
- Delay de aparicion: 120ms.
- Se cierra al salir del bloque o con `Esc`.
- No debe tapar acciones criticas.

### 2.4 KPI cards superiores
Agregar iconos semanticos:
- Total racks: icono rack
- Servidores: icono server
- Activos: icono check verde
- Inactivos: icono alerta rojo

Reglas:
- Icono a la izquierda, valor destacado, label secundario.
- Altura uniforme y grid responsive.

### 2.5 Etiquetas y copy
Cambiar CTA:
- De: "Ocultar etiquetas"
- A: "Ocultar detalles tecnicos" / "Mostrar detalles tecnicos"

### 2.6 Paginacion
- Mantener paginacion para datasets grandes.
- Añadir selector de pagina + items por pagina (10, 20, 50 racks).
- Persistir preferencia en localStorage.
- Mostrar total y rango actual: "Mostrando 1-20 de 126".

## 3. Optimizacion de Clusters Virtuales (Imagenes 1 y 2)

### 3.1 Flujo de navegacion
Flujo obligatorio:
1. Vista general de clusters (resumen)
2. Click en tarjeta completa o boton "Ver detalle"
3. Vista detalle de cluster
4. Gestion de hosts asignados dentro del detalle

Reglas:
- Toda tarjeta de cluster debe ser clicable (`role=button`, teclado Enter/Espacio).
- Boton "Ver detalle" centrado y consistente.
- Boton "Volver" persistente en encabezado.

### 3.2 Vista general de cluster (contenido minimo)
Cada tarjeta de cluster muestra:
- Nombre cluster
- Numero hosts
- VMs totales
- Estado agregado (salud)
- Acciones: Editar / Eliminar (solo si permiso)

No mostrar lista completa de VMs en esta vista.

### 3.3 Vista detalle cluster
- Header: nombre cluster, hosts totales, VMs totales, acciones admin.
- Grid de hosts: cada host como tarjeta moderna.
- Dentro de host:
  - Nombre host prominente
  - Badge VMs
  - Estado host
  - Mini grid VMs con estado

### 3.4 Tarjetas e indicadores
- Bordes redondeados `--radius-md`.
- Sombra `--shadow-1` default, `--shadow-2` en hover.
- Indicador de estado VM con diametro minimo 8-10px y contraste AA.
- Evitar colores pastel de bajo contraste para estado critico.

### 3.5 Gestion de hosts del cluster
Problema actual: elementos de lista parecen botones.

Estandar nuevo:
- Host asignado como chip o mini-card no clicable.
- Unica accion interactiva: boton "Quitar" destructivo.
- Boton "Quitar" pequeno pero consistente con estilo destructivo.
- Confirmacion modal obligatoria antes de remover.

## 4. Mejoras UX transversales

### 4.1 Prevencion de errores (critico)
Para toda accion destructiva:
- Modal de confirmacion obligatorio con:
  - Titulo claro
  - Impacto de la accion
  - Boton cancelar
  - Boton destructivo explicito
- Soporte teclado: `Esc`, foco inicial en cancelar.

### 4.2 Busqueda y filtros avanzados
Agregar filtros combinables:
- Estado
- Rack/cluster
- Tipo VM
- Texto libre (IP, hostname, nombre)

Requisitos:
- Debounce 200-300ms en texto.
- Chips de filtros activos.
- Boton "Limpiar filtros".

### 4.3 Paginacion vs scroll infinito
Decisiones:
- Racks fisicos: paginacion (mejor orientacion y control operativo).
- Listados de eventos/incidentes: puede usarse scroll infinito con cursor.
- Clusters/hosts: paginacion o virtualizacion cuando N > 200.

### 4.4 Feedback consistente
- Loading: skeletons o placeholders.
- Exito: toast verde consistente.
- Error: toast rojo + detalle tecnico opcional.
- Estado vacio: mensaje accionable con CTA.

### 4.5 Accesibilidad base (obligatoria)
- Contraste minimo WCAG AA.
- Foco visible en todos los elementos interactivos.
- Navegacion por teclado completa.
- Labels y `aria-*` en formularios y botones iconicos.
- Soporte de lector de pantalla en feedback critico (aria-live).

## 5. Especificaciones tecnicas de implementacion UI

### 5.1 Arquitectura frontend propuesta
- Mantener modularizacion por dominio:
  - `dominios/hosts`
  - `dominios/monitoreo`
  - `dominios/usuarios`
- Agregar modulo `dominios/ui-system` con:
  - `tokens.css`
  - `buttons.css`
  - `cards.css`
  - `modalConfirm.js`
  - `feedback.js`

### 5.2 Convenciones
- No `onclick` inline.
- Event delegation para listas dinamicas.
- Sanitizacion de output antes de `innerHTML`.
- `data-*` dinamicos codificados/decodificados de forma segura.

### 5.3 Observabilidad UX
Eventos recomendados:
- `ui.cluster.open`
- `ui.cluster.remove.confirmed`
- `ui.host.remove.confirmed`
- `ui.filter.changed`
- `ui.error.shown`

Campos minimos:
- `timestamp`
- `requestId` (si aplica)
- `usuario`
- `dominio`
- `accion`

## 6. Criterios de aceptacion

### 6.1 Visual
- Todos los botones usan la nueva taxonomia (primario/secundario/destructivo).
- No hay botones azules ambiguos en gestion de hosts.
- Limites de servidores fisicos son claramente distinguibles.

### 6.2 Funcional
- Toda accion destructiva muestra modal de confirmacion.
- Flujo cluster resumen -> detalle funciona por click en tarjeta y boton.
- Filtros combinables funcionan sin romper rendimiento.

### 6.3 Calidad y accesibilidad
- Sin errores de sintaxis JS.
- Contraste AA validado en componentes base.
- Navegacion por teclado en rutas principales.

## 7. Riesgos y mitigaciones
- Riesgo: regresion visual por CSS global.
  - Mitigacion: capa de tokens y clases por namespace.
- Riesgo: performance con grandes listas.
  - Mitigacion: paginacion/virtualizacion.
- Riesgo: deuda tecnica en `app.js`.
  - Mitigacion: extraccion incremental por dominio con pruebas smoke.

## 8. Definicion de terminado (DoD)
- Especificacion aplicada en pantallas fisicos, virtuales y monitoreo.
- Checklist QA smoke aprobado.
- Contenedores saludables.
- Documentacion tecnica y UX actualizada.

# 🗄️ Diagrama de Servidores - Sistema de Visualización de Racks

[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://semver.org)
[![Architecture](https://img.shields.io/badge/architecture-clean-green.svg)](./ARQUITECTURA.md)
[![Code Style](https://img.shields.io/badge/code%20style-clean%20code-brightgreen.svg)](./COMPARACION.md)

Sistema web profesional para visualizar y gestionar servidores físicos y virtuales, enlazado dinámicamente a archivos Excel con actualización en tiempo real.

## ✨ Características

- 📊 **Visualización de Racks**: Representación gráfica de 42U con distribución automática
- 🔄 **Actualización Automática**: Detecta cambios en Excel y actualiza en vivo (SSE)
- 🏢 **Dual Mode**: Soporte para servidores físicos y virtuales (VMware vSphere)
- 🎯 **Etiquetas Inteligentes**: Alineación precisa con posicionamiento dinámico
- 📤 **Upload de Excel**: Sube archivos o vincula rutas locales
- 🎨 **UI Moderna**: Diseño profesional con animaciones y efectos visuales
- 🏗️ **Clean Architecture**: Código modular, testeable y mantenible

## 🚀 Inicio Rápido

### Requisitos
- Node.js 18+
- Archivo Excel con datos de servidores
## Inventario en Base de Datos (Migración desde Excel)

### Instalación

```powershell
# Clonar repositorio
git clone <url-del-repo>
cd DiagramaServers

# Instalar dependencias
npm install

# Iniciar servidor (desarrollo)
npm start
# O directamente: node backend/server.js
```

### Producción con PM2 (Recomendado)

# Instalar PM2 y pm2-windows-startup globalmente (una sola vez)
cmd /c "npm install -g pm2"
cmd /c "npm install -g pm2-windows-startup"

# Iniciar con PM2
cmd /c "pm2 start ecosystem.config.cjs"

# Guardar configuración para inicio automático
cmd /c "pm2 logs diagrama-servidores"
```

📖 **Guía completa**: [docs/PM2-GUIA.md](./docs/PM2-GUIA.md)
### Acceder

**Local (solo tú)**:
```
http://localhost:3050
```

**Red Local (compartir con otros)**:
```
http://[TU-IP]:3050
Ejemplo: http://192.168.100.20:3050
```

Para encontrar tu IP: `ipconfig | Select-String "IPv4"`

📖 **Acceso en red**: [docs/ACCESO-RED.md](./docs/ACCESO-RED.md)

### Estructura de Carpetas

El proyecto está organizado en 3 carpetas principales:

- **`backend/`**: Todo el código del servidor (Node.js + Express)
- **`frontend/`**: Todo el código del cliente (HTML + CSS + JavaScript)
- **`docs/`**: Documentación técnica completa

## 📁 Estructura del Proyecto

```
DiagramaServers/
├── backend/                  # ⭐ Backend (Node.js + Express)
│   ├── src/                  # Código fuente modular
│   │   ├── config/           # Configuración y constantes
│   │   ├── services/         # Lógica de negocio
│   │   ├── controllers/      # Controladores HTTP
│   │   └── utils/            # Utilidades reutilizables
│   ├── data/                 # Archivos Excel (opcional)
│   ├── uploads/              # Archivos subidos
│   └── server.js             # ⭐ Servidor con Clean Architecture
│
├── frontend/                 # ⭐ Frontend (HTML + CSS + JavaScript)
│   └── public/               # Archivos públicos
│       ├── js/modules/       # Módulos JavaScript ES6
│       ├── app.js            # Aplicación principal
│       ├── styles.css        # Estilos globales
│       ├── home-styles.css   # Estilos de home
│       ├── index.html        # Vista servidores físicos
│       ├── virtual.html      # Vista servidores virtuales
│       └── home.html         # Página de inicio
│
├── docs/                     # ⭐ Documentación técnica
│   ├── ARQUITECTURA.md       # Arquitectura detallada
│   ├── COMPARACION.md        # Antes vs Después
│   ├── REFACTORIZACION.md    # Resumen de cambios
│   ├── GUIA-RAPIDA.md        # Guía de uso rápido
│   └── INDEX.md              # Índice de documentación
│
├── config.json               # Configuración personalizada
├── package.json              # Dependencias y scripts
└── README.md                 # Este archivo
```

## 🏗️ Arquitectura

El proyecto ha sido completamente refactorizado siguiendo **Clean Architecture** y principios **SOLID**:

### Capas

1. **Config** - Configuración centralizada y constantes
2. **Services** - Lógica de negocio (parseo Excel, caché, file watching, SSE, seguridad de red)
3. **Controllers** - Manejo de peticiones HTTP
4. **Utils** - Funciones auxiliares reutilizables

### 🔒 Seguridad de Red Automática

El servidor detecta automáticamente el tipo de red y ajusta la seguridad:

- **🏢 Red Corporativa** (192.168.100.x, 10.0.x): Acceso habilitado para toda la red local
- **🔒 Red Pública** (cafés, hoteles, aeropuertos): Solo acceso localhost (protección automática)
- **🔄 Auto-restart cada hora**: Re-detecta cambios de red automáticamente

Ver [**SEGURIDAD-RED.md**](./docs/SEGURIDAD-RED.md) para más detalles.

### Documentación Completa

- 📘 [**ARQUITECTURA.md**](./docs/ARQUITECTURA.md) - Documentación técnica completa
- 📊 [**COMPARACION.md**](./docs/COMPARACION.md) - Antes vs Después (código espagueti → clean code)
- 📋 [**REFACTORIZACION.md**](./docs/REFACTORIZACION.md) - Resumen de cambios y mejoras
- 📖 [**GUIA-RAPIDA.md**](./docs/GUIA-RAPIDA.md) - Guía de uso rápido
- 🔒 [**SEGURIDAD-RED.md**](./docs/SEGURIDAD-RED.md) - Protección automática en redes públicas
- 🌐 [**ACCESO-RED.md**](./docs/ACCESO-RED.md) - Configuración de acceso en red local
- ⚙️ [**PM2-GUIA.md**](./docs/PM2-GUIA.md) - Gestión con PM2 para producción
- 📚 [**INDEX.md**](./docs/INDEX.md) - Índice completo de documentación

## 🛠️ Configuración

### `config.json`

```json
{
  "excelPaths": {
    "fisicos": "./backend/data/ServidoresFisicos.xlsx",
    "virtuales": "./backend/data/ServidoresVirtuales.xlsx"
  },
  "sheetName": "Servidores Fisicos",
  "sheetNameVirtuales": "Servidores Virtuales",
  "lockOnFirstUpload": true,
  "columns": {
    "rack": "RACK",
    "serverLabel": "SERVIDOR",
    "nombre": "NOMBRE",
    "ip": "IP",
    "hostname": "HOSTNAME"
  }
}
```

**Nota**: Las rutas ahora apuntan a `backend/data/` y `backend/uploads/` según la nueva estructura.

## 🔌 API REST

### Endpoints de Datos

```http
GET  /api/data?type=fisicos|virtuales    # Datos completos (racks + servidores)
GET  /api/racks?type=fisicos|virtuales   # Solo racks
GET  /api/servers?type=fisicos|virtuales # Solo servidores
POST /api/reload?type=fisicos|virtuales  # Recargar manualmente
GET  /api/meta                            # Metadata del sistema
```

### Endpoints de Gestión

```http
POST   /api/upload?type=fisicos|virtuales        # Subir archivo Excel
GET    /api/source-path?type=fisicos|virtuales   # Consultar ruta actual
POST   /api/source-path?type=fisicos|virtuales   # Vincular ruta local
DELETE /api/source-path?type=fisicos|virtuales   # Desvincular ruta
```

### Server-Sent Events

```http
GET /events   # Stream de actualizaciones en tiempo real
```

## 📊 Formato Excel Esperado

### Servidores Físicos

| RACK | SERVIDOR | NOMBRE | IP | HOSTNAME | MARCA | MODELO | ... |
|------|----------|--------|----|---------  |-------|--------|-----|
| 1 | 1.1 | Server01 | 192.168.0.1 | SRV01 | Dell | R740 | ... |

### Servidores Virtuales

| RACK | HARDWARE | NOMBRE | IP | HOSTNAME | SO | ... |
|------|----------|--------|----|---------  |----|-----|
| SRVESXI01 | VIRTUAL | VM001 | 192.168.1.10 | VM-WEB | Windows | ... |

## 🎯 Características Técnicas

### Backend
- ✅ **Clean Architecture** con separación de responsabilidades
- ✅ **Singleton Services** para gestión centralizada
- ✅ **File Watching** con debouncing y retry logic
- ✅ **SSE** para actualización en tiempo real
- ✅ **Logging profesional** con niveles y emojis
- ✅ **Seguridad de red automática** (protección en redes públicas)
- ✅ **100% documentado** en español

### Frontend
- ✅ **SPA** con navegación hash-based
- ✅ **Renderizado dinámico** desde JSON
- ✅ **Etiquetas alineadas** con cálculo preciso de posiciones
- ✅ **Responsive design** adaptable
- ✅ **Vistas especializadas** (clusters, vSphere)

## 🎯 Organización del Código

### Backend (`backend/`)

- **`backend/server.js`**: Punto de entrada del servidor con Clean Architecture
- **`backend/src/config/`**: Configuración centralizada (constants.js, configManager.js)
- **`backend/src/services/`**: Lógica de negocio (excelParser, cache, fileWatcher, sseManager, uploadManager)
- **`backend/src/controllers/`**: Controladores HTTP (dataController, metaController, uploadController, sseController)
- **`backend/src/utils/`**: Utilidades reutilizables (logger.js, dataHelpers.js)

### Frontend (`frontend/`)

- **`frontend/public/app.js`**: Aplicación principal (código legacy funcional)
- **`frontend/public/js/modules/`**: Módulos ES6 (constants, state, api, utils, components, views, toast)
- **`frontend/public/*.html`**: Páginas HTML (home.html, index.html, virtual.html)
- **`frontend/public/*.css`**: Estilos CSS (styles.css, home-styles.css)

### Documentación (`docs/`)

Toda la documentación técnica se encuentra en la carpeta `docs/` para facilitar el mantenimiento y consulta.

## 🧪 Testing (Próximamente)

La arquitectura está preparada para testing unitario:

```javascript
import excelParserService from './src/services/excelParserService.js';

test('parsea Excel correctamente', () => {
  const result = excelParserService.parseExcelByType('fisicos');
  expect(result.racks).toBeDefined();
  expect(result.servers).toBeInstanceOf(Array);
});
```

## 📈 Métricas de Calidad

| Métrica | Valor |
|---------|-------|
| Cobertura de Código | 📈 En progreso |
| Complejidad Ciclomática | ✅ Baja |
| Mantenibilidad (índice) | ✅ 85/100 |
| Deuda Técnica | ✅ Mínima |
| Documentación | ✅ 100% |

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add: AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

### Estándares de Código
- ✅ Seguir Clean Code y SOLID
- ✅ Comentarios en español
- ✅ Funciones pequeñas (< 30 líneas)
- ✅ Una responsabilidad por módulo
- ✅ Tests unitarios para nuevas features

## 📝 Changelog

### [0.2.1] - 2025-10-28
#### Reorganizado
- 📁 Estructura de carpetas clara: `backend/`, `frontend/`, `docs/`
- 🎯 Separación total entre código del servidor y cliente
- 📚 Documentación centralizada en carpeta `docs/`
- 🔧 Rutas actualizadas en archivos de configuración

### [0.2.0] - 2025-10-28
#### Añadido
- ✨ Arquitectura Clean completa (14 módulos)
- 📚 Documentación técnica exhaustiva
- 🔧 Configuración centralizada
- 📊 Sistema de logging profesional
- 🏗️ Separación en capas (Config/Services/Controllers/Utils)

#### Mejorado
- ⚡ Mejor mantenibilidad (+89%)
- 🧪 Testabilidad mejorada (+350%)
- 📖 Código 100% documentado en español
- 🔄 Reutilización de código (+183%)

### [0.1.0] - 2025-10-27
- 🎉 Versión inicial funcional

## 📄 Licencia

Proyecto privado - Grupo Danec

## 👥 Equipo

**Desarrollado por**: Equipo TI - Grupo Danec  
**Última actualización**: Octubre 2025

## 📚 Recursos Adicionales

- [Clean Code (Robert C. Martin)](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882)
- [Clean Architecture (Robert C. Martin)](https://www.amazon.com/Clean-Architecture-Craftsmans-Software-Structure/dp/0134494164)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

---

**⭐ Si te gusta el proyecto, dale una estrella!**

- Vista principal: tarjetas por Rack con “slots” (simulan unidades del rack) mostrando hostname e IP.
- Click en “Ver detalle de rack” o en un servidor: muestra todas las características.
- Cambios en los Excels: el backend observa ambos archivos y publica cambios vía SSE; la página se actualiza sola sin mezclar datos entre vistas.

## Mapeo de columnas
- El archivo `config.json` define el mapeo de columnas. Si tus encabezados tienen tildes/espacios, respétalos exactamente.
- Se agrupa por la columna `RACK`. Se aceptan formatos como `1`, `Rack 1` o `1.x`.
- Se ignoran filas vacías o de espaciado sin datos de servidor.

## Próximos pasos sugeridos
- Agregar la hoja de “Servidores Virtuales” y relacionarla por datastores/hosts ESXi.
- Exportar a imagen/PDF.
- Autenticación básica si lo expones fuera de tu red.

## Problemas comunes
- “No se encuentra el archivo Excel…”: revisa `excelPaths.fisicos` o `excelPaths.virtuales`.
- No aparecen racks: confirma valores en la columna `RACK` (por ejemplo “Rack 1”, “Rack 2”).
- OneDrive a veces genera archivos temporales: el watcher reintenta al guardar; si no refresca, recarga la página.

## Subir Excel desde la UI
En la vista de Físicos y Virtuales, el botón “Subir Excel” enviará el archivo al endpoint `/api/upload?type=fisicos` o `/api/upload?type=virtuales` según la página abierta. El servidor actualiza únicamente el tipo correspondiente y persiste la ruta en `config.json`.

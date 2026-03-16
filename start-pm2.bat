@echo off
REM Script para iniciar PM2 automáticamente
REM Este script debe ejecutarse al inicio del sistema

echo Iniciando PM2 DiagramaServers...

REM Cambiar al directorio del proyecto
cd /d "c:\Users\pasanteoptimus\OneDrive - Grupo Danec\TI\DiagramaServers"

REM Iniciar PM2 con la configuración del ecosistema
pm2 start ecosystem.config.cjs

REM Guardar la configuración actual
pm2 save

echo PM2 DiagramaServers iniciado correctamente
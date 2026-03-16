# Script PowerShell para iniciar PM2 automáticamente
# Este script debe ejecutarse al inicio del sistema

Write-Host "Iniciando PM2 DiagramaServers..." -ForegroundColor Green

# Cambiar al directorio del proyecto
Set-Location "c:\Users\pasanteoptimus\OneDrive - Grupo Danec\TI\DiagramaServers"

try {
    # Verificar si PM2 ya está ejecutándose
    $pm2Process = pm2 list 2>$null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "PM2 ya está ejecutándose. Verificando aplicación..." -ForegroundColor Yellow
        
        # Verificar si la aplicación específica está ejecutándose
        $appStatus = pm2 list | Select-String "diagrama-servidores"
        
        if ($appStatus) {
            Write-Host "DiagramaServers ya está ejecutándose en PM2" -ForegroundColor Green
        } else {
            Write-Host "Iniciando DiagramaServers en PM2..." -ForegroundColor Blue
            pm2 start ecosystem.config.cjs
        }
    } else {
        Write-Host "Iniciando PM2 y DiagramaServers..." -ForegroundColor Blue
        pm2 start ecosystem.config.cjs
    }
    
    # Guardar la configuración actual
    pm2 save
    
    Write-Host "PM2 DiagramaServers iniciado correctamente" -ForegroundColor Green
    
    # Mostrar estado
    pm2 list
    
} catch {
    Write-Host "Error al iniciar PM2: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
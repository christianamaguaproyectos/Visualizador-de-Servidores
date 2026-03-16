# Script de configuración automática para PM2 en Windows
# Este script configura el inicio automático de PM2 usando el Programador de Tareas de Windows

param(
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$Status
)

$TaskName = "PM2-DiagramaServers-AutoStart"
$ScriptPath = "$PSScriptRoot\start-pm2.ps1"
$LogPath = "$PSScriptRoot\logs\pm2-autostart.log"

function Install-AutoStart {
    Write-Host "Configurando inicio automático de PM2..." -ForegroundColor Green
    
    try {
        # Crear directorio de logs si no existe
        $LogDir = Split-Path $LogPath
        if (!(Test-Path $LogDir)) {
            New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
        }
        
        # Crear la tarea programada
        $Action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
        $Trigger = New-ScheduledTaskTrigger -AtStartup
        $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
        $Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
        
        # Registrar la tarea
        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "Inicio automático de PM2 para DiagramaServers" -Force
        
        Write-Host "✓ Tarea programada '$TaskName' creada exitosamente" -ForegroundColor Green
        Write-Host "✓ PM2 se iniciará automáticamente al arrancar el sistema" -ForegroundColor Green
        Write-Host "✓ Los logs se guardarán en: $LogPath" -ForegroundColor Yellow
        
        # Probar la tarea inmediatamente
        Write-Host "`nProbando la tarea..." -ForegroundColor Blue
        Start-ScheduledTask -TaskName $TaskName
        Start-Sleep -Seconds 3
        
        Write-Host "`nEstado actual de PM2:" -ForegroundColor Blue
        pm2 list
        
    } catch {
        Write-Host "✗ Error al configurar el inicio automático: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
    
    return $true
}

function Uninstall-AutoStart {
    Write-Host "Desinstalando inicio automático de PM2..." -ForegroundColor Yellow
    
    try {
        # Verificar si la tarea existe
        $Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        
        if ($Task) {
            # Desregistrar la tarea
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
            Write-Host "✓ Tarea programada '$TaskName' eliminada exitosamente" -ForegroundColor Green
        } else {
            Write-Host "! La tarea '$TaskName' no existe" -ForegroundColor Yellow
        }
        
    } catch {
        Write-Host "✗ Error al desinstalar: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
    
    return $true
}

function Show-Status {
    Write-Host "Estado del inicio automático de PM2:" -ForegroundColor Blue
    Write-Host "=====================================`n" -ForegroundColor Blue
    
    # Verificar si la tarea existe
    $Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    
    if ($Task) {
        Write-Host "✓ Tarea programada: CONFIGURADA" -ForegroundColor Green
        Write-Host "  Nombre: $($Task.TaskName)" -ForegroundColor Gray
        Write-Host "  Estado: $($Task.State)" -ForegroundColor Gray
        Write-Host "  Última ejecución: $($Task.LastRunTime)" -ForegroundColor Gray
        Write-Host "  Próxima ejecución: Al inicio del sistema" -ForegroundColor Gray
    } else {
        Write-Host "✗ Tarea programada: NO CONFIGURADA" -ForegroundColor Red
    }
    
    Write-Host "`nEstado actual de PM2:" -ForegroundColor Blue
    try {
        pm2 list
    } catch {
        Write-Host "✗ PM2 no está ejecutándose" -ForegroundColor Red
    }
    
    Write-Host "`nArchivos de configuración:" -ForegroundColor Blue
    Write-Host "- Script de inicio: $ScriptPath" -ForegroundColor Gray
    Write-Host "- Archivo de logs: $LogPath" -ForegroundColor Gray
    Write-Host "- Configuración PM2: $PSScriptRoot\ecosystem.config.cjs" -ForegroundColor Gray
}

# Función principal
if ($Install) {
    if (Install-AutoStart) {
        Write-Host "`n🎉 Configuración completada exitosamente!" -ForegroundColor Green
        Write-Host "PM2 se iniciará automáticamente en el próximo reinicio del sistema." -ForegroundColor Green
    }
} elseif ($Uninstall) {
    if (Uninstall-AutoStart) {
        Write-Host "`n✓ Inicio automático desactivado" -ForegroundColor Green
    }
} elseif ($Status) {
    Show-Status
} else {
    Write-Host "Script de configuración automática para PM2 DiagramaServers" -ForegroundColor Cyan
    Write-Host "============================================================`n" -ForegroundColor Cyan
    
    Write-Host "Uso:" -ForegroundColor Yellow
    Write-Host "  .\setup-autostart.ps1 -Install    # Instalar inicio automático" -ForegroundColor White
    Write-Host "  .\setup-autostart.ps1 -Uninstall  # Desinstalar inicio automático" -ForegroundColor White
    Write-Host "  .\setup-autostart.ps1 -Status     # Mostrar estado actual" -ForegroundColor White
    Write-Host "`nEjemplos:" -ForegroundColor Yellow
    Write-Host "  .\setup-autostart.ps1 -Install" -ForegroundColor Gray
    Write-Host "  .\setup-autostart.ps1 -Status" -ForegroundColor Gray
}
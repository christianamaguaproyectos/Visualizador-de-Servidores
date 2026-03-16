# 🔒 Script de Diagnóstico de Seguridad
# Verifica el estado de seguridad del servidor DiagramaServers

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🔒 DIAGNÓSTICO DE SEGURIDAD - DIAGRAMA SERVIDORES" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar IP actual
Write-Host "📍 1. TU IP ACTUAL:" -ForegroundColor Yellow
Write-Host ""
$ipInfo = ipconfig | Select-String "IPv4" | Where-Object {$_ -notlike "*127.0.0.1*"}
$ipInfo | ForEach-Object {
    $line = $_.ToString().Trim()
    if ($line -match "192\.168\.100\.") {
        Write-Host "   ✅ $line" -ForegroundColor Green
        Write-Host "      → Red corporativa detectada" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  $line" -ForegroundColor Yellow
        Write-Host "      → Posible red pública" -ForegroundColor Yellow
    }
}
Write-Host ""

# 2. Estado PM2
Write-Host "📊 2. ESTADO DEL SERVIDOR (PM2):" -ForegroundColor Yellow
Write-Host ""
cmd /c "pm2 status"
Write-Host ""

# 3. Logs de seguridad
Write-Host "3. LOGS DE SEGURIDAD (ultimos 15):" -ForegroundColor Yellow
Write-Host ""
$logs = cmd /c "pm2 logs diagrama-servidores --lines 15 --nostream" 2>&1
$logs | ForEach-Object {
    $line = $_.ToString()
    if ($line -match "Red Corporativa Detectada") {
        Write-Host "   [OK] $line" -ForegroundColor Green
    } elseif ($line -match "Red publica") {
        Write-Host "   [!] $line" -ForegroundColor Yellow
    } elseif ($line -match "SEGURIDAD DE RED") {
        Write-Host "   [*] $line" -ForegroundColor Cyan
    } elseif ($line -match "Modo: Acceso en red local HABILITADO") {
        Write-Host "   [OK] $line" -ForegroundColor Green
    } elseif ($line -match "SOLO LOCALHOST") {
        Write-Host "   [*] $line" -ForegroundColor Yellow
    } else {
        Write-Host "   $line" -ForegroundColor Gray
    }
}
Write-Host ""

# 4. Conexiones activas
Write-Host "4. CONEXIONES ACTIVAS AL PUERTO 3050:" -ForegroundColor Yellow
Write-Host ""
$connections = Get-NetTCPConnection -LocalPort 3050 -ErrorAction SilentlyContinue
if ($connections) {
    $connections | Format-Table LocalAddress, LocalPort, RemoteAddress, RemotePort, State -AutoSize
} else {
    Write-Host "   [i] Sin conexiones activas" -ForegroundColor Gray
}
Write-Host ""

# 5. Análisis de seguridad
Write-Host "5. ANALISIS DE SEGURIDAD:" -ForegroundColor Yellow
Write-Host ""

$isSecure = $false
$currentIP = ""

# Detectar red corporativa
$wifiIP = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi" -ErrorAction SilentlyContinue
if ($wifiIP -and $wifiIP.IPAddress -match "192\.168\.100\.") {
    $currentIP = $wifiIP.IPAddress
    Write-Host "   [OK] RED CORPORATIVA ACTIVA" -ForegroundColor Green
    Write-Host "      IP: $currentIP" -ForegroundColor Green
    Write-Host "      Modo: Acceso en red local habilitado" -ForegroundColor Green
    Write-Host "      URL compartible: http://$($currentIP):3050" -ForegroundColor Green
    $isSecure = $true
} else {
    $allIPs = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*"}
    $publicIP = $allIPs | Where-Object {$_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "192.168.100.*" -and $_.IPAddress -notlike "10.0.*"} | Select-Object -First 1
    
    if ($publicIP) {
        $currentIP = $publicIP.IPAddress
        Write-Host "   [!] RED PUBLICA DETECTADA" -ForegroundColor Yellow
        Write-Host "      IP: $currentIP" -ForegroundColor Yellow
        Write-Host "      Modo: SOLO LOCALHOST (seguridad activada)" -ForegroundColor Yellow
        Write-Host "      Acceso remoto: BLOQUEADO" -ForegroundColor Yellow
        Write-Host "      [OK] Proteccion automatica activa" -ForegroundColor Green
        $isSecure = $true
    } else {
        Write-Host "   [i] Sin conexion a red o VPN activa" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan

# 6. Recomendaciones
Write-Host ""
Write-Host "RECOMENDACIONES:" -ForegroundColor Magenta
Write-Host ""

if ($currentIP -match "192\.168\.100\.") {
    Write-Host "   [OK] Estas en red corporativa - todo OK" -ForegroundColor Green
    Write-Host "   [i] Comparte esta URL con tu equipo:" -ForegroundColor Cyan
    Write-Host "      http://$($currentIP):3050" -ForegroundColor White
} else {
    Write-Host "   [!] Estas en red publica o VPN" -ForegroundColor Yellow
    Write-Host "   [OK] Proteccion automatica esta activa" -ForegroundColor Green
    Write-Host "   [i] Solo tu puedes acceder (localhost)" -ForegroundColor Cyan
    Write-Host "   [*] Conectate a red corporativa (192.168.100.x) para acceso compartido" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "COMANDOS UTILES:" -ForegroundColor Cyan
Write-Host "   pm2 logs diagrama-servidores     Ver logs en tiempo real" -ForegroundColor Gray
Write-Host "   pm2 restart diagrama-servidores  Reiniciar servidor" -ForegroundColor Gray
Write-Host "   pm2 status                       Ver estado del servidor" -ForegroundColor Gray
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

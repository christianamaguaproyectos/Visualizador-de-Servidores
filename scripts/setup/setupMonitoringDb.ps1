Param(
  [string]$PostgresUrl = $env:POSTGRES_URL,
  [string]$SchemaFile,
  [switch]$ImportHosts,
  [switch]$ApplyInventory,
  [string]$InventorySchemaFile,
  [string]$GrantToUser
)

Write-Host "== Setup Monitoreo DB ==" -ForegroundColor Cyan

# Resolver ruta del schema por defecto relative al script
if (-not $SchemaFile) {
  $SchemaFile = Join-Path $PSScriptRoot '..\\..\\scripts\\sql\\schema.monitoring.sql'
  $SchemaFile = Resolve-Path $SchemaFile
}

if ($ApplyInventory -and -not $InventorySchemaFile) {
  $InventorySchemaFile = Join-Path $PSScriptRoot '..\\..\\scripts\\sql\\schema.inventory.sql'
  $InventorySchemaFile = Resolve-Path $InventorySchemaFile
}

if (-not $PostgresUrl) { Write-Error "POSTGRES_URL no definido"; exit 1 }

# Parse simple postgres://user:pass@host:port/db
if ($PostgresUrl -notmatch "postgres://([^:]+):([^@]+)@([^:]+):(\d+)/(.*)") { Write-Error "Formato POSTGRES_URL inválido"; exit 1 }
$pgUser = $Matches[1]; $pgPass = $Matches[2]; $pgHost = $Matches[3]; $pgPort = $Matches[4]; $pgDb = $Matches[5];
$targetUser = if ($GrantToUser) { $GrantToUser } else { $pgUser }

Write-Host "Usuario: $pgUser Host: $pgHost Puerto: $pgPort DB: $pgDb" -ForegroundColor Yellow

# Aplicar esquema
Write-Host "Aplicando esquema..." -ForegroundColor Cyan
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Warning "psql no encontrado en PATH. Usando script Node para aplicar esquema.";
  node "$PSScriptRoot/../monitoring/applySchema.js" --url $PostgresUrl --file $SchemaFile
  if ($LASTEXITCODE -ne 0) { Write-Error "Error aplicando esquema via Node"; exit 1 }
  if ($ApplyInventory) {
    Write-Host "Aplicando esquema INVENTORY..." -ForegroundColor Cyan
    node "$PSScriptRoot/../monitoring/applySchema.js" --url $PostgresUrl --file $InventorySchemaFile
    if ($LASTEXITCODE -ne 0) { Write-Error "Error aplicando INVENTORY via Node"; exit 1 }
  }
} else {
  $env:PGPASSWORD = $pgPass
  psql -h $pgHost -p $pgPort -U $pgUser -d $pgDb -f $SchemaFile
  if ($LASTEXITCODE -ne 0) { Write-Error "Error aplicando esquema"; exit 1 }
  if ($ApplyInventory) {
    Write-Host "Aplicando esquema INVENTORY..." -ForegroundColor Cyan
    psql -h $pgHost -p $pgPort -U $pgUser -d $pgDb -f $InventorySchemaFile
    if ($LASTEXITCODE -ne 0) { Write-Error "Error aplicando INVENTORY"; exit 1 }
  }
}

Write-Host "Esquema aplicado." -ForegroundColor Green

# Otorgar privilegios al usuario para usar el esquema y operar sobre tablas/secuencias
Write-Host "Otorgando privilegios en esquema monitoring a $targetUser..." -ForegroundColor Cyan
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  node "$PSScriptRoot/../monitoring/grantPrivileges.js" --url $PostgresUrl --user $targetUser
  if ($LASTEXITCODE -ne 0) { Write-Warning "Fallo otorgando privilegios via Node." }
} else {
  $env:PGPASSWORD = $pgPass
  psql -h $pgHost -p $pgPort -U $pgUser -d $pgDb -c "GRANT USAGE ON SCHEMA monitoring TO \"$targetUser\";"
  if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudo otorgar USAGE en el esquema (quizá no eres el dueño del esquema)." }

  psql -h $pgHost -p $pgPort -U $pgUser -d $pgDb -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA monitoring TO \"$targetUser\";"
  if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudieron otorgar permisos sobre tablas existentes." }

  psql -h $pgHost -p $pgPort -U $pgUser -d $pgDb -c "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA monitoring TO \"$targetUser\";"
  if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudieron otorgar permisos sobre secuencias." }

  psql -h $pgHost -p $pgPort -U $pgUser -d $pgDb -c "ALTER DEFAULT PRIVILEGES IN SCHEMA monitoring GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO \"$targetUser\";"
  if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudieron establecer privilegios por defecto de tablas." }

  psql -h $pgHost -p $pgPort -U $pgUser -d $pgDb -c "ALTER DEFAULT PRIVILEGES IN SCHEMA monitoring GRANT USAGE, SELECT ON SEQUENCES TO \"$targetUser\";"
  if ($LASTEXITCODE -ne 0) { Write-Warning "No se pudieron establecer privilegios por defecto de secuencias." }
}

if ($ImportHosts) {
  Write-Host "Importando hosts desde cache..." -ForegroundColor Cyan
  node ..\import\importHostsFromCache.js
  if ($LASTEXITCODE -ne 0) { Write-Error "Error importando hosts"; exit 1 }
  Write-Host "Hosts importados." -ForegroundColor Green
}

Write-Host "Verificando conteo de hosts..." -ForegroundColor Cyan
psql -h $host -p $port -U $user -d $db -c "SELECT count(*) FROM monitoring.hosts;"

Write-Host "Listo." -ForegroundColor Green

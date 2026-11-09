$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$originalPassword = $env:POSTGRES_PASSWORD
$originalMatrix = $env:MATRIX_URL
$originalAdmins = $env:EXAM_ADMIN_IDS
try {
if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) { throw 'Install and start Docker Desktop first.' }
& docker.exe compose version
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose is unavailable.' }
if (-not $env:MATRIX_URL) { $env:MATRIX_URL = Read-Host 'Matrix homeserver URL (for example https://matrix-client.matrix.org)' }
if (-not $env:EXAM_ADMIN_IDS) { $env:EXAM_ADMIN_IDS = Read-Host 'Matrix administrator ID' }
if (-not $env:POSTGRES_PASSWORD) {
    $secure = Read-Host 'PostgreSQL password (reuse it for an existing database)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $env:POSTGRES_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
if (-not $env:MATRIX_URL -or -not $env:EXAM_ADMIN_IDS -or -not $env:POSTGRES_PASSWORD) { throw 'Matrix URL, admin ID and PostgreSQL password are required.' }
if ((Read-Host 'Build and start the project Docker services? Existing project containers may be recreated. [E/h]') -notmatch '^(e|E|y|Y)$') { throw 'Cancelled.' }
Push-Location $root
try {
    $composeArgs = @('compose')
    $serviceEnv = Join-Path $PSScriptRoot 'exam-service\.env'
    if (Test-Path -LiteralPath $serviceEnv -PathType Leaf) { $composeArgs += @('--env-file', $serviceEnv) }
    $composeArgs += @('up', '--build', '-d')
    & docker.exe @composeArgs
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose startup failed.' }
    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/config' -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { throw 'Docker services are not ready. Inspect docker compose logs; containers were not stopped.' }
} finally {
    Pop-Location
}
Write-Host 'HeapAccounting is ready at http://localhost:8080.'
try { Start-Process 'http://localhost:8080' } catch { Write-Warning 'Open http://localhost:8080 manually.' }
} finally {
    $env:POSTGRES_PASSWORD = $originalPassword
    $env:MATRIX_URL = $originalMatrix
    $env:EXAM_ADMIN_IDS = $originalAdmins
}

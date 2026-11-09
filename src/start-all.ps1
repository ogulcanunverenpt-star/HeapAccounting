param([string]$Msys2Root = (Join-Path $env:SystemDrive 'msys64'))
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$frontend = Join-Path $src 'serverroot'
$service = Join-Path $src 'exam-service'

function Confirm-Install([string]$message) {
    if ((Read-Host "$message [E/h]") -notmatch '^(e|E|y|Y)$') { throw 'Installation cancelled.' }
}
function Check-Exit([string]$step) {
    if ($LASTEXITCODE -ne 0) { throw "$step failed (exit $LASTEXITCODE)." }
}
function Port-InUse([int]$port) {
    $socket = New-Object System.Net.Sockets.TcpClient
    try { return $socket.ConnectAsync('127.0.0.1', $port).Wait(500) -and $socket.Connected }
    catch { return $false }
    finally { $socket.Close() }
}
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Confirm-Install 'Node.js is missing. Install Node.js LTS with winget?'
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) { throw 'winget is unavailable. Install Node.js 22.15+ manually.' }
    & winget.exe install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
    Check-Exit 'Node.js installation'
    $env:PATH = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
& node.exe -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=15)?0:1)"
Check-Exit 'Node.js 22.15+ check'
if (-not (Test-Path -LiteralPath (Join-Path $Msys2Root 'usr\bin\bash.exe'))) {
    Confirm-Install 'MSYS2 is missing. Allow the C build installer to install it?'
}
$clang = Join-Path $Msys2Root 'ucrt64\bin\clang.exe'
if (-not (Test-Path -LiteralPath $clang)) {
    if (-not (Test-Path -LiteralPath (Join-Path $Msys2Root 'usr\bin\bash.exe'))) {
        & (Join-Path $src 'install.ps1') -Msys2Root $Msys2Root
    }
    Confirm-Install 'The WebAssembly compiler is missing. Install Clang and lld with pacman?'
    & (Join-Path $Msys2Root 'usr\bin\bash.exe') -c 'pacman -S --needed --noconfirm mingw-w64-ucrt-x86_64-clang mingw-w64-ucrt-x86_64-lld'
    Check-Exit 'WebAssembly compiler installation'
}
$env:WASM_CC = $clang
foreach ($item in @(@($frontend, 'node_modules\vite'), @($frontend, 'node_modules\exceljs'), @($service, 'node_modules\pg'))) {
    if (-not (Test-Path -LiteralPath (Join-Path $item[0] $item[1]))) {
        Push-Location $item[0]
        try { & npm.cmd install --no-audit --no-fund; Check-Exit 'npm install' }
        finally { Pop-Location }
    }
}
$envFile = Join-Path $service '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
    $admin = Read-Host 'Matrix administrator ID (for example @name:matrix.org)'
    if ($admin -notmatch '^@[^:\s]+:[^\s]+$') { throw 'Invalid Matrix administrator ID.' }
    $content = [IO.File]::ReadAllText((Join-Path $service '.env.example')).Replace('EXAM_ADMIN_IDS=', "EXAM_ADMIN_IDS=$admin")
    [IO.File]::WriteAllText($envFile, $content, (New-Object System.Text.UTF8Encoding($false)))
}
Push-Location $service
try {
    $apiPort = & node.exe --input-type=module -e "import { loadServiceEnvironment } from './environment.js'; loadServiceEnvironment(); console.log(process.env.PORT || '3491')"
    Check-Exit 'API configuration check'
} finally { Pop-Location }
$webPort = if ($env:WEB_PORT) { $env:WEB_PORT } else { '3490' }
foreach ($port in @($apiPort, $webPort)) {
    if ($port -notmatch '^\d+$' -or [int]$port -lt 1 -or [int]$port -gt 65535) { throw 'Invalid API or web port.' }
    if (Port-InUse ([int]$port)) { throw "Port $port is already in use. Stop the existing service yourself and retry." }
}
if ($apiPort -eq $webPort) { throw 'API and web ports must be different.' }
if ($env:EXAM_API_PORT -and $env:EXAM_API_PORT -ne $apiPort) { throw 'EXAM_API_PORT does not match the API PORT.' }
$env:EXAM_API_PORT = $apiPort
Push-Location $frontend
try { & npm.cmd run build; Check-Exit 'Frontend build' }
finally { Pop-Location }
& (Join-Path $Msys2Root 'usr\bin\bash.exe') -c 'command -v make >/dev/null 2>&1 && command -v cc >/dev/null 2>&1'
if ($LASTEXITCODE -ne 0) { Confirm-Install 'C build tools are missing. Install gcc and make with pacman?' }
& (Join-Path $src 'install.ps1') -Msys2Root $Msys2Root
$env:PATH = (Join-Path $Msys2Root 'usr\bin') + ';' + $env:PATH
$api = $null
$web = $null
try {
    $api = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList 'server.js' -WorkingDirectory $service -PassThru
    $web = Start-Process -FilePath (Join-Path $src 'server.exe') -WorkingDirectory $src -PassThru
    $ready = $false
    for ($i = 0; $i -lt 40; $i++) {
        if ($api.HasExited -or $web.HasExited) { throw 'A service exited during startup. Check its console and .env.' }
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:$webPort/api/config" -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $ready) { throw 'Services did not become ready. Check their consoles and .env.' }
} catch {
    if ($web -and -not $web.HasExited) { Stop-Process -Id $web.Id }
    if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id }
    throw
}
Write-Host "HeapAccounting is ready at http://localhost:$webPort. Close the two service windows to stop it."
try { Start-Process "http://localhost:$webPort" } catch { Write-Warning "Open http://localhost:$webPort manually." }

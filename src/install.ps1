param(
    [string]$Msys2Root = (Join-Path $env:SystemDrive 'msys64')
)

$ErrorActionPreference = 'Stop'
$bash = Join-Path $Msys2Root 'usr\bin\bash.exe'

if (-not (Test-Path -LiteralPath $bash -PathType Leaf)) {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "MSYS2 was not found at $Msys2Root and winget is unavailable. Install MSYS2 from https://www.msys2.org/ or specify -Msys2Root."
    }

    Write-Host "Installing MSYS2 at $Msys2Root using winget..."
    & $winget.Source install --id MSYS2.MSYS2 --exact --silent --location $Msys2Root --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) {
        throw "MSYS2 installation failed (winget exit code $LASTEXITCODE)."
    }
    if (-not (Test-Path -LiteralPath $bash -PathType Leaf)) {
        throw "MSYS2 was not found at $Msys2Root after installation. Specify its installation directory with -Msys2Root."
    }
}

Push-Location $PSScriptRoot
try {
    & $bash -c 'export PATH=/usr/bin:/bin; if ! command -v make >/dev/null 2>&1 || ! command -v cc >/dev/null 2>&1; then pacman -S --needed --noconfirm gcc make || exit $?; fi; if ! command -v make >/dev/null 2>&1 || ! command -v cc >/dev/null 2>&1; then echo make or cc is still unavailable after installation >&2; exit 1; fi; exec make -B'
    if ($LASTEXITCODE -ne 0) {
        throw "MSYS2 dependency installation or build failed (exit code $LASTEXITCODE)."
    }
}
finally {
    Pop-Location
}

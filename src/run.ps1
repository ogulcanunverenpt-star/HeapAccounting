param(
    [string]$Msys2Root = (Join-Path $env:SystemDrive 'msys64')
)

$ErrorActionPreference = 'Stop'
$runtimePath = Join-Path $Msys2Root 'usr\bin'
$runtimeDll = Join-Path $runtimePath 'msys-2.0.dll'
$server = Join-Path $PSScriptRoot 'server.exe'

if (-not (Test-Path -LiteralPath $runtimeDll -PathType Leaf)) {
    throw "MSYS2 runtime not found at $runtimeDll. Run install.ps1 or specify -Msys2Root."
}
if (-not (Test-Path -LiteralPath $server -PathType Leaf)) {
    throw "Server not found at $server. Run install.ps1 first."
}

$originalPath = $env:PATH
try {
    $env:PATH = "$runtimePath;$originalPath"
    Push-Location $PSScriptRoot
    try {
        & $server
        $serverExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
}
finally {
    $env:PATH = $originalPath
}

exit $serverExitCode

# extract-hearthstone-fixtures.ps1
#
# Copies Assembly-CSharp.dll from the local Hearthstone installation to the
# hearthmirror-native test fixtures directory (.local/ is git-ignored).
#
# Usage:
#   .\scripts\extract-hearthstone-fixtures.ps1
#
# Optional: set HEARTHSTONE_DIR environment variable to override the default
# Hearthstone installation path.

param(
    [string]$HearthstoneDir = $env:HEARTHSTONE_DIR
)

if (-not $HearthstoneDir) {
    $default = "${env:ProgramFiles(x86)}\Hearthstone"
    if (Test-Path $default) {
        $HearthstoneDir = $default
    } else {
        Write-Error "Hearthstone installation not found. Set HEARTHSTONE_DIR or install Hearthstone."
        exit 1
    }
}

$src = Join-Path $HearthstoneDir "Hearthstone_Data\Managed\Assembly-CSharp.dll"
if (-not (Test-Path $src)) {
    Write-Error "Assembly-CSharp.dll not found at: $src"
    exit 1
}

$repoRoot = Split-Path $PSScriptRoot -Parent
$destDir  = Join-Path $repoRoot "packages\hearthmirror\native\tests\fixtures\.local"
$dest     = Join-Path $destDir "Assembly-CSharp.dll"

New-Item -ItemType Directory -Force $destDir | Out-Null
Copy-Item -Force $src $dest

$sizeMB = [math]::Round((Get-Item $dest).Length / 1MB, 1)
Write-Host "Copied Assembly-CSharp.dll ($sizeMB MB) -> $dest"

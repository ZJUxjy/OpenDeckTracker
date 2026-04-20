<#
.SYNOPSIS
  Run the dump_reflection cargo example and append results to the spike report.

.DESCRIPTION
  Executes cargo run --example dump_reflection against a running Hearthstone process,
  collects environment info, formats results as Markdown, and appends to
  docs/spikes/0003-hearthmirror-reflection-runtime-validation.md.

.EXAMPLE
  pwsh scripts/run-hearthmirror-spike.ps1
#>

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$SpikeReport = Join-Path $RepoRoot 'docs/spikes/0003-hearthmirror-reflection-runtime-validation.md'
$NativeDir = Join-Path $RepoRoot 'packages/hearthmirror/native'

# --- Environment Snapshot ---
function Get-EnvironmentSnapshot {
    $env_info = @{
        OS = "$([System.Environment]::OSVersion.VersionString) ($(if ([System.Environment]::Is64BitOperatingSystem) {'x64'} else {'x86'}))"
        TestDateUTC = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm')
    }

    # Hearthstone exe version
    $hsProcess = Get-Process -Name 'Hearthstone' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hsProcess) {
        try {
            $hsExe = $hsProcess.MainModule.FileName
            $vi = (Get-Item $hsExe).VersionInfo
            $env_info.HearthstoneVersion = "$($vi.FileVersion)"
            $env_info.HearthstoneExe = $hsExe
        } catch {
            $env_info.HearthstoneVersion = 'unavailable (access denied)'
        }
    } else {
        $env_info.HearthstoneVersion = 'not running'
    }

    # mono dll SHA1
    if ($hsProcess) {
        try {
            $hsDir = Split-Path $hsProcess.MainModule.FileName
            $candidates = @(
                (Join-Path $hsDir 'mono-2.0-bdwgc.dll'),
                (Join-Path $hsDir 'Mono/mono-2.0-bdwgc.dll'),
                (Join-Path $hsDir 'MonoBleedingEdge/EmbedRuntime/mono-2.0-bdwgc.dll')
            )
            $found = $false
            foreach ($monoDll in $candidates) {
                if (Test-Path $monoDll) {
                    $hash = (Get-FileHash $monoDll -Algorithm SHA1).Hash
                    $env_info.MonoDllSHA1 = $hash
                    $found = $true
                    break
                }
            }
            if (-not $found) {
                $env_info.MonoDllSHA1 = 'unavailable (file not found)'
            }
        } catch {
            $env_info.MonoDllSHA1 = 'unavailable'
        }
    } else {
        $env_info.MonoDllSHA1 = 'unavailable'
    }

    return $env_info
}

# --- Format JSON Lines as Markdown ---
function Format-AsMarkdown {
    param(
        [string[]]$JsonLines,
        [hashtable]$Env
    )

    # Tier mapping
    $tier1 = @('getBattleTag','getAccountId','getMedalInfo','getMatchInfo','getDecks','getCollection','getServerInfo','getBattlegroundRatingInfo')
    $tier2 = @('getGameType','isSpectating','isGameOver','getArenaDeck')

    $sb = [System.Text.StringBuilder]::new()

    # Environment table
    [void]$sb.AppendLine("### Environment")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("| Field | Value |")
    [void]$sb.AppendLine("|---|---|")
    [void]$sb.AppendLine("| OS | $($Env.OS) |")
    [void]$sb.AppendLine("| Hearthstone version | $($Env.HearthstoneVersion) |")
    [void]$sb.AppendLine("| mono-2.0-bdwgc.dll SHA1 | ``$($Env.MonoDllSHA1)`` |")
    [void]$sb.AppendLine("| Test date (UTC) | $($Env.TestDateUTC) |")
    [void]$sb.AppendLine("")

    # Results table
    [void]$sb.AppendLine("### Results")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("| Method | Tier | Tested | Status | Value | Error | Elapsed (ms) |")
    [void]$sb.AppendLine("|---|---|---|---|---|---|---|")

    foreach ($line in $JsonLines) {
        $line = $line.Trim()
        if (-not $line -or -not $line.StartsWith('{')) { continue }
        try {
            $obj = $line | ConvertFrom-Json
        } catch {
            continue
        }

        $method = $obj.method
        if ($method -eq 'MonoRuntime::init') {
            # Special: init failure means all methods are not tested
            [void]$sb.AppendLine("| MonoRuntime::init | - | tested | $($obj.status) | - | $($obj.error) | $($obj.elapsed_ms) |")
            continue
        }

        $tier = if ($tier1 -contains $method) { 'T1' } elseif ($tier2 -contains $method) { 'T2' } else { '?' }
        $value = if ($obj.value) { $obj.value } else { '-' }
        if ($value.Length -gt 80) { $value = $value.Substring(0, 77) + '...' }
        $error_val = if ($obj.error) { $obj.error } else { '-' }
        if ($error_val.Length -gt 80) { $error_val = $error_val.Substring(0, 77) + '...' }

        [void]$sb.AppendLine("| $method | $tier | tested | $($obj.status) | $value | $error_val | $($obj.elapsed_ms) |")
    }

    [void]$sb.AppendLine("")
    return $sb.ToString()
}

# --- Main ---
Write-Host "Running dump_reflection example..."

Push-Location $NativeDir
try {
    $output = & cargo run --example dump_reflection 2>&1
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

$jsonLines = $output | ForEach-Object { $_.ToString() } | Where-Object { $_.Trim().StartsWith('{') }
$stderrLines = $output | ForEach-Object { $_.ToString() } | Where-Object { -not $_.Trim().StartsWith('{') -and $_.Trim() -ne '' }

Write-Host "Example exit code: $exitCode"
Write-Host "JSON lines: $($jsonLines.Count)"

$envSnapshot = Get-EnvironmentSnapshot
$markdown = Format-AsMarkdown -JsonLines $jsonLines -Env $envSnapshot

# Determine run number
$existingContent = if (Test-Path $SpikeReport) { Get-Content $SpikeReport -Raw } else { '' }
$runNumbers = [regex]::Matches($existingContent, '## Run (\d+)') | ForEach-Object { [int]$_.Groups[1].Value }
$nextRun = if ($runNumbers.Count -gt 0) { ($runNumbers | Measure-Object -Maximum).Maximum + 1 } else { 1 }

# Append to report
$section = @"

## Run $nextRun

$markdown
"@

Add-Content -Path $SpikeReport -Value $section -Encoding UTF8

Write-Host "Appended Run $nextRun to $SpikeReport"
Write-Host "Done."

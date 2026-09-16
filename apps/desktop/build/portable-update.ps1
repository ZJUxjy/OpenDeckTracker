param(
    [Parameter(Mandatory = $true)][ValidateSet('Prepare', 'Apply')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$PlanPath
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Assert-NoLink([string]$path) {
    $cursor = [IO.Path]::GetFullPath($path)
    while ($cursor) {
        if ([IO.File]::Exists($cursor) -or [IO.Directory]::Exists($cursor)) {
            if (([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Update paths cannot contain links: $cursor"
            }
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
}
function Child-Path([string]$base, [string]$relative) {
    if (!$relative -or $relative.Contains('\') -or [IO.Path]::IsPathRooted($relative)) { throw "Unsafe ZIP path: $relative" }
    foreach ($part in $relative.Split('/')) {
        if (!$part -or $part -eq '.' -or $part -eq '..' -or $part -match '[<>:"|?*\x00-\x1f]' -or
            $part -match '[. ]$' -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)' -or
            $part.StartsWith('.opendecktracker-update-', [StringComparison]::OrdinalIgnoreCase)) {
            throw "Unsafe ZIP path: $relative"
        }
    }
    $prefix = [IO.Path]::GetFullPath($base).TrimEnd('\') + '\'
    $full = [IO.Path]::GetFullPath([IO.Path]::Combine($base, $relative.Replace('/', '\')))
    if (!$full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Path escapes update directory: $relative" }
    Assert-NoLink $full
    return $full
}
function Hash-File([string]$path) {
    $stream = [IO.File]::OpenRead($path)
    $sha = [Security.Cryptography.SHA512]::Create()
    try { return [Convert]::ToBase64String($sha.ComputeHash($stream)) }
    finally { $stream.Dispose(); $sha.Dispose() }
}
function Write-Json([string]$path, $value) {
    Assert-NoLink $path
    [IO.File]::WriteAllText($path, (ConvertTo-Json -InputObject $value -Depth 8), (New-Object Text.UTF8Encoding($false)))
}
function Move-File([string]$source, [string]$destination) {
    Assert-NoLink $source; Assert-NoLink $destination
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    for ($attempt = 0; ; $attempt++) {
        try { [IO.File]::Move($source, $destination); return }
        catch { if ($attempt -ge 9) { throw }; Start-Sleep -Milliseconds 200 }
    }
}
function Restart-App {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $target 'OpenDeckTracker.exe'
    $start.WorkingDirectory = $target
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    [Diagnostics.Process]::Start($start) | Out-Null
}

$changes = New-Object 'Collections.Generic.List[object]'
$ready = $false
$parentExited = $false
try {
    Assert-NoLink $PlanPath
    $plan = Get-Content -LiteralPath $PlanPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $target = [IO.Path]::GetFullPath($plan.target).TrimEnd('\')
    $stage = [IO.Path]::GetFullPath($plan.stage).TrimEnd('\')
    Assert-NoLink $target; Assert-NoLink $stage; Assert-NoLink $plan.archive; Assert-NoLink $plan.resultPath
    if ([IO.Path]::GetDirectoryName($stage) -ne $target -or [IO.Path]::GetFileName($stage) -notmatch '^\.opendecktracker-update-[a-f0-9]{32}$') {
        throw 'Invalid staging directory'
    }
    if ([IO.Path]::GetFullPath($PlanPath) -ne (Join-Path $stage 'plan.json')) { throw 'Invalid plan location' }
    if (![IO.File]::Exists((Join-Path $target 'OpenDeckTracker.exe'))) { throw 'Missing portable executable' }
    $payload = Child-Path $stage 'payload'
    $backup = Child-Path $stage 'backup'
    $manifestPath = Child-Path $stage 'prepared.json'
    if ($Mode -eq 'Prepare') {
        if ([IO.Directory]::Exists($payload)) { throw 'Staging directory is already prepared; download again' }
        if ((Hash-File $plan.archive) -cne $plan.sha512) { throw 'ZIP SHA-512 checksum mismatch' }
        [IO.Directory]::CreateDirectory($payload) | Out-Null
        $zip = [IO.Compression.ZipFile]::OpenRead($plan.archive)
        $files = New-Object 'Collections.Generic.List[object]'
        $names = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        [long]$total = 0
        try {
            if ($zip.Entries.Count -gt 20000) { throw 'Too many ZIP entries' }
            foreach ($entry in $zip.Entries) {
                $name = $entry.FullName.TrimEnd('/')
                $destination = Child-Path $payload $name
                $installed = Child-Path $target $name
                if (!$names.Add($name)) { throw "Duplicate ZIP path: $name" }
                if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000 -or
                    ($entry.ExternalAttributes -band 0x400) -ne 0) { throw "ZIP link is forbidden: $name" }
                $total += $entry.Length
                if ($total -gt 2GB) { throw 'ZIP exceeds extracted size limit' }
                if ($entry.FullName.EndsWith('/')) {
                    [IO.Directory]::CreateDirectory($destination) | Out-Null
                    continue
                }
                if ([IO.Directory]::Exists($installed)) { throw "Application file conflicts with a directory: $name" }
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $false)
                $files.Add(@{ path = $name; sha512 = (Hash-File $destination) })
            }
        } finally { $zip.Dispose() }
        if (!$names.Contains('OpenDeckTracker.exe') -or !$names.Contains('resources/app.asar')) { throw 'ZIP is not an OpenDeckTracker Windows application' }
        Write-Json $manifestPath @($files | Sort-Object { $_.path })
        Write-Output 'PREPARED'
        exit 0
    }

    $files = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (!$files.Count -or [IO.Directory]::Exists($backup)) { throw 'Invalid or previously used update; download again' }
    foreach ($file in $files) {
        $source = Child-Path $payload $file.path
        $null = Child-Path $target $file.path
        if ((Hash-File $source) -cne $file.sha512) { throw "Prepared file checksum mismatch: $($file.path)" }
    }
    # Open the actual parent process before acknowledging; a Process handle prevents PID reuse races.
    $parent = Get-Process -Id $plan.parentPid -ErrorAction SilentlyContinue
    if ($parent) { $null = $parent.Handle }
    Write-Output 'READY'
    [Console]::Out.Flush()
    $ready = $true
    if ($parent -and !$parent.WaitForExit(60000)) { throw 'Application did not exit; no files were changed' }
    $parentExited = $true
    [IO.Directory]::CreateDirectory($backup) | Out-Null
    foreach ($file in $files) {
        $installed = Child-Path $target $file.path
        $saved = Child-Path $backup $file.path
        $source = Child-Path $payload $file.path
        $change = @{ path = $file.path; saved = $false; placed = $false }
        $changes.Add($change)
        if ([IO.File]::Exists($installed)) { Move-File $installed $saved; $change.saved = $true }
        Move-File $source $installed
        $change.placed = $true
    }
    Write-Json $plan.resultPath @{ success = $true; target = $target }
    Restart-App
    # The stage is an explicitly validated, app-owned child, never the application directory itself.
    try {
        Assert-NoLink $stage
        Get-ChildItem -LiteralPath $stage -Recurse -Force | ForEach-Object { Assert-NoLink $_.FullName }
        Remove-Item -LiteralPath $stage -Recurse -Force
    } catch { } # Successful update must not roll back because cleanup failed.
    exit 0
} catch {
    $message = $_.Exception.Message + ' (helper line ' + $_.InvocationInfo.ScriptLineNumber + ')'
    if ($ready) {
        $rollbackErrors = New-Object 'Collections.Generic.List[string]'
        for ($i = $changes.Count - 1; $i -ge 0; $i--) {
            $change = $changes[$i]
            try {
                $installed = Child-Path $target $change.path
                if ($change.placed) { [IO.File]::Delete($installed) }
                if ($change.saved) { Move-File (Child-Path $backup $change.path) $installed }
            } catch { $rollbackErrors.Add($_.Exception.Message) }
        }
        if ($rollbackErrors.Count) { $message += "; Recovery incomplete. Backup: $backup. " + ($rollbackErrors -join '; ') }
        try { Write-Json $plan.resultPath @{ success = $false; target = $target; message = $message } } catch { }
        if ($parentExited -and !$rollbackErrors.Count) {
            try { Restart-App } catch { }
        }
    }
    [Console]::Error.WriteLine($message)
    exit 1
}

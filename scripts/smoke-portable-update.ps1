param([string]$OutputRoot = (Join-Path $PSScriptRoot '../tmp'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ('portable-smoke-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$helper = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../apps/desktop/build/portable-update.ps1'))
$ps = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$fixtureExe = Join-Path $root 'fixture.exe'
Add-Type -TypeDefinition 'using System; using System.IO; public class PortableSmoke { public static void Main() { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "restarted.txt"), "started"); } }' -OutputAssembly $fixtureExe -OutputType WindowsApplication
function New-Case([string]$name, [string]$badEntry = '') {
    $caseRoot = Join-Path $root $name
    $target = Join-Path $caseRoot 'app space [portable]'
    $stage = Join-Path $target ('.opendecktracker-update-' + [guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory((Join-Path $target 'resources')) | Out-Null
    [IO.Directory]::CreateDirectory($stage) | Out-Null
    [IO.File]::Copy($fixtureExe, (Join-Path $target 'OpenDeckTracker.exe'))
    [IO.File]::WriteAllText((Join-Path $target 'resources/app.asar'), 'old')
    [IO.File]::WriteAllText((Join-Path $target 'keep-my-notes.txt'), 'user data')
    [IO.File]::WriteAllText((Join-Path $target 'z-locked.dll'), 'old')
    $archive = Join-Path $caseRoot 'update.zip'
    $zip = [IO.Compression.ZipFile]::Open($archive, 'Create')
    try {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $fixtureExe, 'OpenDeckTracker.exe') | Out-Null
        foreach ($entryName in @('resources/app.asar', 'new-file.txt', 'z-locked.dll', $badEntry)) {
            if (!$entryName) { continue }
            $entry = $zip.CreateEntry($entryName)
            if ($entryName -eq 'symlink') { $entry.ExternalAttributes = 0xA000 -shl 16 }
            $writer = New-Object IO.StreamWriter($entry.Open())
            $writer.Write('new'); $writer.Dispose()
        }
    } finally { $zip.Dispose() }
    $bytes = [IO.File]::ReadAllBytes($archive)
    $sha = [Security.Cryptography.SHA512]::Create()
    try { $hash = [Convert]::ToBase64String($sha.ComputeHash($bytes)) } finally { $sha.Dispose() }
    $parent = Start-Process -FilePath $ps -ArgumentList '-NoProfile -Command "Start-Sleep -Seconds 1"' -WindowStyle Hidden -PassThru
    $plan = @{ target = $target; stage = $stage; archive = $archive; sha512 = $hash; parentPid = $parent.Id; resultPath = (Join-Path $caseRoot 'result.json') }
    $planPath = Join-Path $stage 'plan.json'
    [IO.File]::WriteAllText($planPath, ($plan | ConvertTo-Json))
    return @{ Plan = $plan; Path = $planPath; Target = $target }
}
function Run-Helper($case, [string]$mode, [bool]$success) {
    $ErrorActionPreference = 'Continue'
    $output = & $ps -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -Mode $mode -PlanPath $case.Path 2>&1
    $ErrorActionPreference = 'Stop'
    if (($LASTEXITCODE -eq 0) -ne $success) { throw "Unexpected $mode result: $output" }
    return ($output | Out-String)
}
if (!(Test-Path -LiteralPath $helper)) { throw 'Missing portable update helper' }
$ok = New-Case 'success'
Run-Helper $ok Prepare $true | Out-Null
if ([IO.File]::ReadAllText((Join-Path $ok.Target 'resources/app.asar')) -ne 'old') { throw 'Preparation modified application' }
Run-Helper $ok Apply $true | Out-Null
if ([IO.File]::ReadAllText((Join-Path $ok.Target 'resources/app.asar')) -ne 'new') { throw 'Replacement failed' }
if ([IO.File]::ReadAllText((Join-Path $ok.Target 'keep-my-notes.txt')) -ne 'user data') { throw 'User file changed' }
for ($attempt = 0; $attempt -lt 30 -and !(Test-Path -LiteralPath (Join-Path $ok.Target 'restarted.txt')); $attempt++) { Start-Sleep -Milliseconds 100 }
if (!(Test-Path -LiteralPath (Join-Path $ok.Target 'restarted.txt'))) { throw 'Relaunch failed' }

$locked = New-Case 'locked'
Run-Helper $locked Prepare $true | Out-Null
$lock = [IO.File]::Open((Join-Path $locked.Target 'z-locked.dll'), 'Open', 'ReadWrite', 'None')
try { Run-Helper $locked Apply $false | Out-Null } finally { $lock.Dispose() }
$asset = Join-Path $locked.Target 'resources/app.asar'
if ((Get-Content -LiteralPath $asset) -ne 'old') { throw 'Rollback failed' }
if (Test-Path -LiteralPath (Join-Path $locked.Target 'new-file.txt')) { throw 'Rollback left new file' }
$result = Get-Content -LiteralPath $locked.Plan.resultPath -Raw | ConvertFrom-Json
if ($result.success -or !$result.message) { throw 'Missing recovery error' }
for ($attempt = 0; $attempt -lt 30 -and !(Test-Path -LiteralPath (Join-Path $locked.Target 'restarted.txt')); $attempt++) { Start-Sleep -Milliseconds 100 }
if (!(Test-Path -LiteralPath (Join-Path $locked.Target 'restarted.txt'))) { throw 'Old application was not restarted after rollback' }

foreach ($bad in @('../escape.txt', 'resources/../../escape.txt', 'resources/app.asar', 'RESOURCES/APP.ASAR', 'CON.txt', 'file.txt:stream', 'symlink', 'C:/absolute.txt', 'back\slash.txt')) {
    $unsafe = New-Case ('unsafe-' + [guid]::NewGuid().ToString('N')) $bad
    Run-Helper $unsafe Prepare $false | Out-Null
    if ([IO.File]::ReadAllText((Join-Path $unsafe.Target 'resources/app.asar')) -ne 'old') { throw 'Unsafe ZIP changed target' }
}
$corrupt = New-Case 'checksum'
[IO.File]::AppendAllText($corrupt.Plan.archive, 'corrupt')
Run-Helper $corrupt Prepare $false | Out-Null

$junction = New-Case 'junction' 'linked/escape.txt'
$external = Join-Path $root 'junction-external'
[IO.Directory]::CreateDirectory($external) | Out-Null
New-Item -ItemType Junction -Path (Join-Path $junction.Target 'linked') -Target $external | Out-Null
Run-Helper $junction Prepare $false | Out-Null
if (Test-Path -LiteralPath (Join-Path $external 'escape.txt')) { throw 'Update followed a junction' }

$waitCase = New-Case 'parent-wait'
Run-Helper $waitCase Prepare $true | Out-Null
$parent = Start-Process -FilePath $ps -ArgumentList '-NoProfile -Command "Start-Sleep -Seconds 4"' -WindowStyle Hidden -PassThru
$waitCase.Plan.parentPid = $parent.Id
[IO.File]::WriteAllText($waitCase.Path, ($waitCase.Plan | ConvertTo-Json))
$watch = [Diagnostics.Stopwatch]::StartNew()
Run-Helper $waitCase Apply $true | Out-Null
if ($watch.Elapsed.TotalSeconds -lt 3) { throw 'Helper did not wait for parent exit' }
Write-Output "Portable smoke passed: replacement, relaunch, parent exit wait, preserved files, locked-file rollback/relaunch, checksum, traversal, links, duplicate and Windows paths. Artifacts: $root"

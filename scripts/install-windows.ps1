<#
.SYNOPSIS
  Install dsh-remote-web-gateway into a DSH profile from an EXTERNAL terminal or
  script. Default target is the DSH Desktop (Windows GUI) "desktop" profile.

.DESCRIPTION
  Why an external runner: the DSH Desktop GUI is itself a cordis/bundle host and
  must never be mutated by a second DSH process while it is running (that
  combination corrupted profile state and sent Desktop into its recovery window).
  This installer therefore:

    * defaults to the "desktop" profile (the Windows GUI host),
    * requires DSH Desktop to be CLOSED when the target is "desktop"
      (abort with a message, or stop the app automatically with -Force),
    * stages a local tarball to an ASCII-only path (the profile persists a
      "file:" dependency that must stay resolvable),
    * snapshots the profile package.json and restores it if the install fails,
    * installs exclusively through the official `dsh plugin` CLI,
    * reminds you to RESTART DSH Desktop afterwards when target is "desktop".

  Verified 2026-09-07 on DSH Desktop 2.0.5 / dsh core 0.1.2-rc.1 / Windows x64:
  plugin installed into "desktop" this way loads after a Desktop restart and the
  full phone remote flow (pair -> session -> WSS -> send -> revoke -> stop) works.

.PARAMETER TarballPath
  Path to a locally built tarball. When omitted, the published npm package name
  is installed from the registry.

.PARAMETER Package
  npm package name used when no -TarballPath is given. Defaults to
  dsh-remote-web-gateway.

.PARAMETER ProfileName
  Target profile. Defaults to "desktop" (DSH Desktop GUI). Use "web" for a
  headless `dsh web` host.

.PARAMETER Force
  Stop a running DSH Desktop automatically (with a confirmation prompt in
  interactive sessions) instead of aborting.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 `
      -TarballPath D:\out\dsh-remote-web-gateway-0.2.2.tgz

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 `
      -TarballPath D:\out\dsh-remote-web-gateway-0.2.2.tgz -Force
#>
[CmdletBinding()]
param(
    [string]$TarballPath,
    [string]$Package = 'dsh-remote-web-gateway',
    [string]$ProfileName = 'desktop',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Write-Step($Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok($Message) { Write-Host "    $Message" -ForegroundColor Green }
function Write-Warn($Message) { Write-Host "    WARN: $Message" -ForegroundColor Yellow }
function Write-Fail($Message) { Write-Host "ERROR: $Message" -ForegroundColor Red }

Write-Step 'Target check'
Write-Ok "Target profile: '$ProfileName'"

# --------------------------------------------------------- running app guard
$isDesktopTarget = $ProfileName -ieq 'desktop'
if ($isDesktopTarget) {
    $running = Get-Process -Name 'DSH Desktop' -ErrorAction SilentlyContinue
    if ($running) {
        if (-not $Force) {
            Write-Fail 'DSH Desktop is running. Installing into the desktop profile while it is'
            Write-Fail 'running can corrupt profile state and send Desktop into recovery mode.'
            Write-Fail 'Close DSH Desktop first, or rerun with -Force to stop it automatically.'
            exit 2
        }
        Write-Warn 'DSH Desktop is running; stopping it now (unsaved GUI work may be lost).'
        $interactive = $Host.UI.RawUI -and -not $env:DSH_CI
        if ($interactive) {
            $answer = Read-Host 'Type "yes" to stop DSH Desktop'
            if ($answer -ne 'yes') { Write-Fail 'Aborted by user.'; exit 2 }
        }
        $running | Stop-Process -Force -ErrorAction Stop
        Start-Sleep -Seconds 3
        if (Get-Process -Name 'DSH Desktop' -ErrorAction SilentlyContinue) {
            Write-Fail 'DSH Desktop did not stop; aborting to protect the profile.'
            exit 2
        }
        Write-Ok 'DSH Desktop stopped.'
    } else {
        Write-Ok 'DSH Desktop is closed - safe to install into the desktop profile.'
    }
}

# --------------------------------------------------------------- install arg
$installArg = $Package
if ($TarballPath) {
    if (-not (Test-Path -LiteralPath $TarballPath -PathType Leaf)) {
        Write-Fail "Tarball not found: $TarballPath"
        exit 2
    }
    $appData = Join-Path $env:APPDATA 'DSH Desktop'
    $stagingDir = Join-Path $appData 'plugin-staging'
    if (-not (Test-Path -LiteralPath $stagingDir)) {
        New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
    }
    $staged = Join-Path $stagingDir (Split-Path -Leaf $TarballPath)
    if ((Resolve-Path -LiteralPath $TarballPath).Path -ne $staged) {
        Copy-Item -LiteralPath $TarballPath -Destination $staged -Force
    }
    if ($staged -notmatch '^[\x20-\x7E]+$') {
        Write-Fail "Staged path is not ASCII-only: $staged"
        exit 2
    }
    $installArg = $staged
    Write-Ok "Using staged tarball: $staged"
} else {
    Write-Ok "Using registry package: $Package"
}

# --------------------------------------------------------------- profile dir
$profileDir = Join-Path $env:USERPROFILE (Join-Path '.dsh' (Join-Path 'profiles' $ProfileName))
$profilePackage = Join-Path $profileDir 'package.json'
if (-not (Test-Path -LiteralPath $profilePackage)) {
    Write-Fail "Profile '$ProfileName' does not exist at $profileDir"
    Write-Host "Boot it once first (e.g. open DSH Desktop for 'desktop', or run 'dsh web' for 'web')."
    exit 2
}

# ------------------------------------------------------- locate dsh CLI/pnpm
$dshCmd = $null
$hostRoot = Join-Path $env:APPDATA 'DSH Desktop\host-commands'
if (Test-Path -LiteralPath $hostRoot) {
    $candidates = Get-ChildItem -LiteralPath $hostRoot -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName 'bin\dsh.cmd' } |
        Where-Object { Test-Path -LiteralPath $_ }
    $dshCmd = $candidates | Select-Object -First 1
}
if (-not $dshCmd) { $dshCmd = (Get-Command dsh -ErrorAction SilentlyContinue).Source }
if (-not $dshCmd) { Write-Fail 'Cannot locate the dsh CLI.'; exit 2 }
$runtimeBin = Join-Path $env:APPDATA 'DSH Desktop\runtime-commands\bin'
if (Test-Path -LiteralPath $runtimeBin) { $env:PATH = "$runtimeBin;$env:PATH" }

# ---------------------------------------------------------- snapshot & apply
$backup = Join-Path $profileDir 'package.json.preinstall.bak'
Copy-Item -LiteralPath $profilePackage -Destination $backup -Force
Write-Ok "Snapshot: $backup"

try {
    Write-Step 'Installing via the official dsh plugin CLI'
    & $dshCmd plugin --profile $ProfileName add $installArg
    if ($LASTEXITCODE -ne 0) { throw "dsh plugin add failed with exit code $LASTEXITCODE" }

    $pkg = Get-Content -LiteralPath $profilePackage -Raw | ConvertFrom-Json
    $inBundles = @($pkg.dsh.profile.bundles) -contains 'dsh-remote-web-gateway'
    if (-not $inBundles) { throw 'dsh-remote-web-gateway missing from dsh.profile.bundles' }
    Write-Ok 'Bundle row present in dsh.profile.bundles.'

    $privateNode = Join-Path $env:APPDATA 'DSH Desktop\runtime-commands\private\node-bin\node.cmd'
    $nodeExe = if (Test-Path -LiteralPath $privateNode) { $privateNode }
               elseif (Get-Command node -ErrorAction SilentlyContinue) { (Get-Command node).Source }
               else { $null }
    if ($nodeExe) {
        $check = "const p=require('node:path');console.log(require.resolve('dsh-remote-web-gateway',{paths:[p.join(process.env.USERPROFILE,'.dsh','profiles','$ProfileName')]}))"
        $resolved = & $nodeExe -e $check 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $resolved) {
            throw 'Plugin package cannot be resolved from the profile after install.'
        }
        Write-Ok "Resolvable: $resolved"
    }
}
catch {
    Write-Warn 'Install failed - restoring the profile package.json snapshot.'
    try { Copy-Item -LiteralPath $backup -Destination $profilePackage -Force } catch { Write-Warn "Restore failed: $_" }
    Write-Host ''
    Write-Fail "Install FAILED (exit $LASTEXITCODE)."
    if ($isDesktopTarget) {
        Write-Host 'Reopen DSH Desktop; if it lands in the recovery window, use "Rollback" to the' -ForegroundColor Yellow
        Write-Host 'latest healthy-start slot.' -ForegroundColor Yellow
    }
    exit 1
}

# -------------------------------------------------------------- completion
Write-Host ''
Write-Ok 'Install complete.'
if ($isDesktopTarget) {
    Write-Host 'RESTART DSH Desktop now to load the plugin.' -ForegroundColor Green
    Write-Host 'Then: Settings -> Remote Control -> Enable -> scan the QR from your phone.' -ForegroundColor Yellow
} else {
    Write-Host "Restart the '$ProfileName' host (e.g. 'dsh web') to load the plugin." -ForegroundColor Green
}
exit 0

# Desktop shortcut opens the GitHub Pages door only. Never point at exe or bat.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Icon = Join-Path $Root "web\icons\piggy-v1.ico"
if (-not (Test-Path -LiteralPath $Icon)) {
  throw "icon not found: $Icon"
}
$Pages = "https://theoldfathertw.github.io/piggybank/"
$Edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path -LiteralPath $Edge)) {
  $Edge = Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"
}
if (-not (Test-Path -LiteralPath $Edge)) {
  throw "msedge.exe not found"
}

function Write-PiggyShortcut([string]$LnkPath) {
  $dir = Split-Path -Parent $LnkPath
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $w = New-Object -ComObject WScript.Shell
  $lnk = $w.CreateShortcut($LnkPath)
  $existingArgs = [string]$lnk.Arguments
  $existingTarget = [string]$lnk.TargetPath
  $keep = ($existingArgs -match 'theoldfathertw\.github\.io/piggybank') -or ($existingTarget -match 'theoldfathertw\.github\.io/piggybank')
  if (-not $keep) {
    $lnk.TargetPath = $Edge
    $lnk.Arguments = "--app=$Pages"
    $lnk.WorkingDirectory = Split-Path $Edge
  }
  $lnk.Description = "小金庫"
  $lnk.WindowStyle = 1
  $lnk.IconLocation = "$Icon,0"
  $lnk.Save()
  Write-Host $LnkPath
  Write-Host "  Target=$($lnk.TargetPath)"
  Write-Host "  Arguments=$($lnk.Arguments)"
  Write-Host "  IconLocation=$($lnk.IconLocation)"
}

$userDesktop = [Environment]::GetFolderPath("Desktop")
$publicDesktop = [Environment]::GetFolderPath("CommonDesktopDirectory")
$scan = @(
  $userDesktop,
  $publicDesktop,
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu"),
  (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

$lnkPaths = New-Object System.Collections.Generic.List[string]
foreach ($root in $scan) {
  Get-ChildItem -LiteralPath $root -Recurse -Force -Filter "*.lnk" -ErrorAction SilentlyContinue |
    Where-Object { $_.BaseName -match 'PiggyBank|小金庫' } |
    ForEach-Object { [void]$lnkPaths.Add($_.FullName) }
}

$userLnk = Join-Path $userDesktop "小金庫.lnk"
if (-not $lnkPaths.Contains($userLnk)) {
  [void]$lnkPaths.Add($userLnk)
}

foreach ($p in $lnkPaths) {
  Write-PiggyShortcut $p
}

Write-Host "PiggyBank.lnk -> Pages; IconLocation rewritten to $Icon"

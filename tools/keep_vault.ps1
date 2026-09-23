# Keep the PiggyBank vault reachable. Starts python -m piggybank vault,
# opens a Cloudflare quick tunnel, and publishes VAULT_ORIGIN to Pages.
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
. "F:\agent-ops\keep-vault-shutdown.ps1"
. "F:\agent-ops\keep-vault-publish.ps1"

$Root = Split-Path -Parent $PSScriptRoot
$Web = Join-Path $Root "web"
$Logs = Join-Path $Root "logs"
$LogFile = Join-Path $Logs "keep_vault.log"
$TunnelLog = Join-Path $Logs "cloudflared.log"
$ConfigJs = Join-Path $Web "config.js"
$Python = (Get-Command python -ErrorAction SilentlyContinue).Source
$Cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$VaultUrl = "http://127.0.0.1:8771"
$PollSec = 30

New-Item -ItemType Directory -Force -Path $Logs | Out-Null

$created = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\PiggyBankKeepVault", [ref]$created)
if (-not $created) {
  exit 0
}

function Write-Keep([string]$Message) {
  $line = "{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $Message
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Test-HttpOk([string]$Url) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 $Url
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Get-VaultProcess {
  @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -match "piggybank(\.vault| vault)") })
}

function Get-TunnelProcess {
  @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains("127.0.0.1:8771") })
}

function Ensure-Vault {
  if (Test-SessionEnding) { return $false }
  if (Test-HttpOk "$VaultUrl/api/health") { return $true }
  $running = @(Get-VaultProcess)
  foreach ($proc in $running) {
    Write-Keep "stop silent vault pid=$($proc.ProcessId)"
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
  }
  if ($running.Count -ge 1) {
    Start-Sleep -Seconds 2
  }
  if (-not $Python -or -not (Test-Path $Python)) {
    Write-Keep "python missing"
    return $false
  }
  Write-Keep "start piggybank vault"
  $env:PYTHONPATH = Join-Path $Root "src"
  Start-Process -FilePath $Python -ArgumentList @(
    "-m", "piggybank", "vault", "--host", "127.0.0.1", "--port", "8771"
  ) -WorkingDirectory $Root -WindowStyle Hidden | Out-Null
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    if (Test-HttpOk "$VaultUrl/api/health") {
      Write-Keep "vault up"
      return $true
    }
  }
  Write-Keep "vault still down after start"
  return $false
}

function Read-TunnelOrigin {
  if (-not (Test-Path $TunnelLog)) { return "" }
  $text = Get-Content -Path $TunnelLog -Raw -ErrorAction SilentlyContinue
  if (-not $text) { return "" }
  $hits = [regex]::Matches($text, "https://[a-z0-9-]+\.trycloudflare\.com")
  if ($hits.Count -eq 0) { return "" }
  return $hits[$hits.Count - 1].Value
}

function Stop-Tunnel {
  foreach ($p in Get-TunnelProcess) {
    Write-Keep ("stop cloudflared pid={0}" -f $p.ProcessId)
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Start-Tunnel {
  if (Test-SessionEnding) { return }
  if (-not (Test-Path $Cloudflared)) {
    Write-Keep "cloudflared missing"
    return
  }
  if (Test-Path $TunnelLog) {
    Remove-Item -Path $TunnelLog -Force -ErrorAction SilentlyContinue
  }
  Write-Keep "start cloudflared"
  Start-Process -FilePath $Cloudflared -ArgumentList @(
    "tunnel", "--url", $VaultUrl, "--no-autoupdate", "--logfile", $TunnelLog
  ) -WindowStyle Hidden | Out-Null
}

function Ensure-Tunnel {
  if (-not (Test-HttpOk "$VaultUrl/api/health")) { return "" }
  $origin = Read-TunnelOrigin
  if ((Get-TunnelProcess).Count -eq 0) {
    Start-Tunnel
    $origin = ""
  }
  if (-not $origin) {
    for ($i = 0; $i -lt 40; $i++) {
      Start-Sleep -Seconds 1
      $origin = Read-TunnelOrigin
      if ($origin) { break }
    }
  }
  if (-not $origin) {
    Write-Keep "tunnel hostname not in log yet"
    return ""
  }
  for ($i = 0; $i -lt 15; $i++) {
    if (Test-HttpOk ($origin + "/api/health")) { return $origin }
    Start-Sleep -Seconds 3
  }
  Write-Keep "tunnel hostname not serving, restart"
  Stop-Tunnel
  Start-Sleep -Seconds 2
  Start-Tunnel
  return ""
}

function Publish-Origin([string]$Origin) {
  $writeConfig = {
    param($NextOrigin)
    & $Python (Join-Path $Root "scripts\update_tunnel.py") $NextOrigin
  }
  $afterPush = {
    $sha = git subtree split --prefix web
    if ($LASTEXITCODE -ne 0 -or -not $sha) { return $false }
    git push origin ($sha + ":gh-pages")
    if ($LASTEXITCODE -ne 0) { return $false }
    return $true
  }
  Publish-VaultOrigin -Origin $Origin -Web $Web -ConfigJs $ConfigJs -Logs $Logs `
    -HtmlFiles @("index.html", "hey.html", "exchange.html") `
    -GitRoot $Root `
    -GitAddPaths @("web/config.js", "web/index.html", "web/hey.html", "web/exchange.html") `
    -WriteConfig $writeConfig `
    -AfterPush $afterPush
}

Write-Keep "keep_vault start"
while ($true) {
  if (Test-SessionEnding) {
    Write-Keep "session ending, exit"
    break
  }
  try {
    if (Ensure-Vault) {
      $origin = Ensure-Tunnel
      Publish-Origin $origin
    }
  } catch {
    Write-Keep ("loop error " + $_.Exception.Message)
  }
  if (-not (Wait-KeepPoll $PollSec)) {
    Write-Keep "session ending, exit"
    break
  }
}

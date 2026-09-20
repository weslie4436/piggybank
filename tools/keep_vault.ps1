# Keep the PiggyBank vault reachable. Starts python -m piggybank vault,
# opens a Cloudflare quick tunnel, and publishes VAULT_ORIGIN to Pages.
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
. "F:\agent-ops\keep-vault-shutdown.ps1"

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

function Read-PublishedOrigin {
  if (-not (Test-Path $ConfigJs)) { return "" }
  $text = Get-Content -Path $ConfigJs -Raw -ErrorAction SilentlyContinue
  $m = [regex]::Match($text, 'VAULT_ORIGIN\s*=\s*"(https://[^"]+)"')
  if ($m.Success) { return $m.Groups[1].Value }
  return ""
}

function Read-PushedOrigin {
  $okFile = Join-Path $Logs "published_origin.txt"
  if (-not (Test-Path $okFile)) { return "" }
  return ((Get-Content -Path $okFile -Raw -ErrorAction SilentlyContinue) + "").Trim()
}

function Publish-Origin([string]$Origin) {
  if (Test-SessionEnding) { return }
  if (-not $Origin) { return }
  if ((Read-PublishedOrigin) -eq $Origin -and (Read-PushedOrigin) -eq $Origin) { return }
  if ((Read-PublishedOrigin) -ne $Origin) {
    & $Python (Join-Path $Root "scripts\update_tunnel.py") $Origin
    if ($LASTEXITCODE -ne 0) {
      Write-Keep "update_tunnel failed"
      return
    }
    $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    foreach ($name in @("index.html", "hey.html", "exchange.html")) {
      $htmlPath = Join-Path $Web $name
      if (Test-Path $htmlPath) {
        $html = [IO.File]::ReadAllText($htmlPath)
        $html = [regex]::Replace($html, 'src="./config\.js(?:\?v=\d+)?"', ('src="./config.js?v=' + $stamp + '"'))
        [IO.File]::WriteAllText($htmlPath, $html)
      }
    }
  }
  Write-Keep "publish origin $Origin"
  $env:GH_PROMPT_DISABLED = "1"
  $env:GIT_TERMINAL_PROMPT = "0"
  Push-Location $Root
  try {
    git add -- web/config.js web/index.html web/hey.html web/exchange.html
    $staged = @(git diff --cached --name-only)
    if ($staged.Count -ge 1) {
      git commit -m "Point the public door at the current vault tunnel."
      if ($LASTEXITCODE -ne 0) {
        Write-Keep "git commit failed"
        return
      }
    }
    git fetch origin main
    $behind = 0
    [void][int]::TryParse(@(git rev-list --count HEAD..origin/main)[0], [ref]$behind)
    if ($behind -gt 0) {
      git merge --no-edit origin/main
      if ($LASTEXITCODE -ne 0) {
        Write-Keep "git merge failed"
        git merge --abort
        return
      }
    }
    git push origin main
    if ($LASTEXITCODE -ne 0) {
      Write-Keep "git push failed"
      return
    }
    $sha = git subtree split --prefix web
    if ($LASTEXITCODE -ne 0 -or -not $sha) {
      Write-Keep "subtree split failed"
      return
    }
    git push origin ($sha + ":gh-pages")
    if ($LASTEXITCODE -ne 0) {
      Write-Keep "gh-pages push failed"
      return
    }
    [IO.File]::WriteAllText((Join-Path $Logs "published_origin.txt"), $Origin)
    Write-Keep "published to GitHub Pages"
  } finally {
    Pop-Location
  }
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

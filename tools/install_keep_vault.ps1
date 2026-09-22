# Register a hidden logon task that keeps the PiggyBank vault + Cloudflare tunnel alive.
# Same shape as FamilyPhotosVault / FamiBookVault / YRoomVault.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $Root "tools\keep_vault.ps1"
$Task = "PiggyBankVault"

if (-not (Test-Path $Script)) { throw "missing $Script" }

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Script`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$trigger.Delay = "PT30S"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $Task -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Keep the PiggyBank vault and public tunnel up after login." -Force | Out-Null

# Same as FamilyPhotosVault: logon task only. A HKCU Run copy starts first, grabs
# the mutex, then this task exits 0 and will not restart on failure.
$run = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
if (Get-ItemProperty -Path $run -Name "PiggyBankVault" -ErrorAction SilentlyContinue) {
  Remove-ItemProperty -Path $run -Name "PiggyBankVault" -ErrorAction SilentlyContinue
}

# AtLogOn only fires next login; start now so this session is already covered.
if ((Get-ScheduledTask -TaskName $Task).State -ne "Running") {
  Start-ScheduledTask -TaskName $Task
}

Write-Host "scheduled $Task"
schtasks /Query /TN $Task | Out-Host

# Start Celery autoscaler (dynamic worker pool).
# Usage: from repo  powershell -File backend/scripts/start_autoscale.ps1

$ErrorActionPreference = "Stop"
$Backend = Split-Path -Parent $PSScriptRoot
Set-Location $Backend

Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -match 'celery.*celery_app.*worker' -or
      $_.CommandLine -match 'app\.workers\.autoscale'
    )
  } |
  ForEach-Object {
    Write-Host "stop pid=$($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

Start-Sleep -Seconds 2
$py = Join-Path $Backend ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "venv python not found: $py" }

Write-Host "starting autoscale..."
Start-Process -WindowStyle Hidden -FilePath $py -ArgumentList "-m","app.workers.autoscale" -WorkingDirectory $Backend
Write-Host "ok - logs under .celery_autoscale/worker-*.log"

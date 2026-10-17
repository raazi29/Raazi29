# Daily refresh of the profile telemetry, run by Windows Task Scheduler (GitHub Actions are unavailable).
# Regenerates dist/targeting.svg and dist/grid.svg and publishes them to the `output` branch.
# Needs git, node and an authenticated gh CLI. Log: .output.log next to this repo's README.
$repo = Split-Path $PSScriptRoot -Parent
$out = Join-Path $repo '.output'
$log = Join-Path $repo '.output.log'

function Say($msg) { Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $msg) }
function Run($what) {
    $output = & $what 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "$($what.ToString().Trim()) failed ($LASTEXITCODE): $output" }
    $output.Trim()
}

try {
    Run { git -C $repo pull --ff-only --quiet } | Out-Null
    $env:GITHUB_TOKEN = Run { gh auth token }
    Push-Location $repo
    try { Say (Run { node scripts/holonet.mjs }) } finally { Pop-Location }

    if (-not (Test-Path $out)) {
        $url = Run { git -C $repo remote get-url origin }
        Run { git clone --quiet --branch output --single-branch $url $out } | Out-Null
    }
    Run { git -C $out pull --ff-only --quiet } | Out-Null
    Copy-Item (Join-Path $repo 'dist\targeting.svg'), (Join-Path $repo 'dist\grid.svg') $out -Force
    Run { git -C $out add targeting.svg grid.svg } | Out-Null
    git -C $out diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        Run { git -C $out commit --quiet -m "Telemetry $(Get-Date -Format yyyy-MM-dd)" } | Out-Null
        Run { git -C $out push --quiet origin output } | Out-Null
        Say 'published'
    } else {
        Say 'no change'
    }
} catch {
    Say "ERROR: $_"
    exit 1
}

# Keep the log short.
$lines = Get-Content $log -ErrorAction SilentlyContinue
if ($lines.Count -gt 400) { $lines | Select-Object -Last 200 | Set-Content $log }

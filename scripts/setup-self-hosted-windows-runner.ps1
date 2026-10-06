[CmdletBinding()]
param(
    [string]$RepositoryUrl = "https://github.com/skacimo1985-star/FOGGARA-PLATFORM-DZ",
    [string]$RunnerDirectory = "$env:USERPROFILE\foggara-actions-runner",
    [string]$RunnerName = "FOGGARA-WIN-$env:COMPUTERNAME"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not [Environment]::Is64BitOperatingSystem) {
    throw "FOGGARA self-hosted CI requires 64-bit Windows."
}

Write-Host "FOGGARA-DZ self-hosted runner bootstrap"
Write-Host "Repository: $RepositoryUrl"
Write-Host "Runner directory: $RunnerDirectory"
Write-Host ""
Write-Host "Security boundary: this runner is intended only for trusted, manually dispatched FOGGARA workflows."
Write-Host "Never paste the registration token into chat, source code, README files, or shell history."

New-Item -ItemType Directory -Path $RunnerDirectory -Force | Out-Null
Set-Location $RunnerDirectory

if (Test-Path ".runner") {
    Write-Host "Runner is already configured. Starting it..."
    & ".\run.cmd"
    exit $LASTEXITCODE
}

$headers = @{
    "Accept" = "application/vnd.github+json"
    "User-Agent" = "FOGGARA-DZ-self-hosted-runner-bootstrap"
}

Write-Host "Resolving latest official GitHub Actions runner release..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/actions/runner/releases/latest" -Headers $headers

$asset = $release.assets | Where-Object { $_.name -match '^actions-runner-win-x64-[0-9.]+\.zip$' } | Select-Object -First 1

if (-not $asset) {
    throw "Could not locate the official Windows x64 runner archive in the latest GitHub release."
}

$archive = Join-Path $RunnerDirectory $asset.name
Write-Host "Downloading $($asset.name) from the official actions/runner repository..."
Invoke-WebRequest -Uri $asset.browser_download_url -Headers $headers -OutFile $archive

Write-Host "Extracting runner..."
Expand-Archive -Path $archive -DestinationPath $RunnerDirectory -Force
Remove-Item $archive -Force

if (-not (Test-Path ".\config.cmd")) {
    throw "Runner archive did not contain config.cmd."
}

Write-Host ""
Write-Host "Open this page in your browser to create a short-lived registration token:"
Write-Host "$RepositoryUrl/settings/actions/runners/new"
Write-Host ""
Write-Host "Choose Windows / x64, then copy ONLY the temporary registration token."
$secureToken = Read-Host "Paste the runner registration token here (input hidden)" -AsSecureString

$tokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPtr)
    if ([string]::IsNullOrWhiteSpace($plainToken)) {
        throw "Registration token was empty."
    }

    Write-Host "Registering runner without storing the token in this script..."
    & ".\config.cmd" --url $RepositoryUrl --token $plainToken --name $RunnerName --labels "foggara-ci" --work "_work" --unattended --replace

    if ($LASTEXITCODE -ne 0) {
        throw "GitHub runner registration failed with exit code $LASTEXITCODE."
    }
}
finally {
    if ($tokenPtr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPtr)
    }
    Remove-Variable plainToken -ErrorAction SilentlyContinue
    Remove-Variable secureToken -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Runner registered successfully."
Write-Host "Keep this PowerShell window open while CI runs."
Write-Host "Starting the runner now..."
& ".\run.cmd"
exit $LASTEXITCODE

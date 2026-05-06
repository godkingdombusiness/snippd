$RepoRoot = Split-Path -Parent $PSScriptRoot
$Gcloud = Join-Path $RepoRoot ".tools\google-cloud-sdk\bin\gcloud.cmd"
$Python = (Get-Command python -ErrorAction Stop).Source
$Config = Join-Path $RepoRoot ".tools\gcloud-config"

if (!(Test-Path $Gcloud)) {
  throw "gcloud was not found at $Gcloud. Re-run the Google Cloud SDK install step."
}

New-Item -ItemType Directory -Force -Path $Config | Out-Null

$env:CLOUDSDK_PYTHON = $Python
$env:CLOUDSDK_PYTHON_SITEPACKAGES = "1"
$env:CLOUDSDK_CONFIG = $Config

# Some sandboxed shells set proxy variables to 127.0.0.1:9, which breaks
# Google API calls after authentication. Clear them for local gcloud use.
$proxyVars = @(
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "GIT_HTTP_PROXY",
  "GIT_HTTPS_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy"
)
foreach ($name in $proxyVars) {
  Remove-Item "Env:$name" -ErrorAction SilentlyContinue
}

function Invoke-LocalGcloud {
  & $Gcloud @args
}

Write-Output "gcloud ready: $Gcloud"
Write-Output "CLOUDSDK_CONFIG=$Config"

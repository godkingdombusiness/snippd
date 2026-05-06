. "$PSScriptRoot\gcloud-env.ps1"

Invoke-LocalGcloud auth application-default login --no-launch-browser
if ($LASTEXITCODE -ne 0) {
  throw "gcloud ADC login failed. Install missing dependencies or rerun the login command."
}

Invoke-LocalGcloud auth application-default set-quota-project "gen-lang-client-0848527535"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to set ADC quota project."
}

Invoke-LocalGcloud auth application-default print-access-token | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to print ADC access token."
}

Write-Output "Application Default Credentials are ready for Terraform."

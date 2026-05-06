param(
  [switch]$Enforce
)

$Root = Split-Path -Parent $PSScriptRoot
$TfDir = Join-Path $Root "infra\vpc-sc"
$Terraform = Join-Path $Root ".tools\terraform\terraform.exe"
$Adc = Join-Path $Root ".tools\gcloud-config\application_default_credentials.json"
$PlanFile = if ($Enforce) { "snippd-vpc-sc-enforce.tfplan" } else { "snippd-vpc-sc.tfplan" }

if (!(Test-Path $Terraform)) {
  throw "Terraform not found at $Terraform"
}
if (!(Test-Path $Adc)) {
  throw "ADC credentials not found at $Adc. Run scripts\gcloud-adc-login.ps1 first."
}
if (!(Test-Path (Join-Path $TfDir $PlanFile))) {
  throw "Plan file not found: $PlanFile. Run scripts\vpc-sc-plan.ps1 first."
}

$env:GOOGLE_APPLICATION_CREDENTIALS = $Adc
$env:GOOGLE_CLOUD_PROJECT = "gen-lang-client-0848527535"
$env:GOOGLE_CLOUD_QUOTA_PROJECT = "gen-lang-client-0848527535"

Push-Location $TfDir
try {
  & $Terraform apply $PlanFile
} finally {
  Pop-Location
}

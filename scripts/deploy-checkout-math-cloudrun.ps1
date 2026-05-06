. "$PSScriptRoot\gcloud-env.ps1"

$ProjectId = if ($env:PROJECT_ID) { $env:PROJECT_ID } else { "gen-lang-client-0848527535" }
$Region = if ($env:REGION) { $env:REGION } else { "us-central1" }
$ServiceName = if ($env:SERVICE_NAME) { $env:SERVICE_NAME } else { "checkout-math" }
$MinSavingsPct = if ($env:MIN_SAVINGS_PCT) { $env:MIN_SAVINGS_PCT } else { "60" }
$MaxStoreCount = if ($env:MAX_STORE_COUNT) { $env:MAX_STORE_COUNT } else { "2" }
$MaxStackItems = if ($env:MAX_STACK_ITEMS) { $env:MAX_STACK_ITEMS } else { "12" }

$required = @("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
foreach ($name in $required) {
  if (-not [Environment]::GetEnvironmentVariable($name)) {
    throw "Missing required environment variable: $name"
  }
}

$anon = [Environment]::GetEnvironmentVariable("SUPABASE_ANON_KEY")
if (-not $anon) {
  $anon = [Environment]::GetEnvironmentVariable("EXPO_PUBLIC_SUPABASE_ANON_KEY")
}
if (-not $anon) {
  throw "Missing required environment variable: SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY"
}

$hmac = [Environment]::GetEnvironmentVariable("CHECKOUT_MATH_HMAC_SECRET")
if (-not $hmac) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $hmac = -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Upsert-Secret([string]$Name, [string]$Value) {
  $tmp = New-TemporaryFile
  try {
    Set-Content -LiteralPath $tmp -Value $Value -NoNewline
    & $Gcloud secrets describe $Name *> $null
    if ($LASTEXITCODE -eq 0) {
      & $Gcloud secrets versions add $Name --data-file=$tmp
    } else {
      & $Gcloud secrets create $Name --data-file=$tmp
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

Invoke-LocalGcloud config set project $ProjectId
Invoke-LocalGcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com

Upsert-Secret "SUPABASE_URL" ([Environment]::GetEnvironmentVariable("SUPABASE_URL"))
Upsert-Secret "SUPABASE_ANON_KEY" $anon
Upsert-Secret "SUPABASE_SERVICE_ROLE_KEY" ([Environment]::GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY"))
Upsert-Secret "CHECKOUT_MATH_HMAC_SECRET" $hmac

Invoke-LocalGcloud run deploy $ServiceName `
  --source "services/checkout_math" `
  --region $Region `
  --allow-unauthenticated `
  --set-secrets "SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,CHECKOUT_MATH_HMAC_SECRET=CHECKOUT_MATH_HMAC_SECRET:latest" `
  --set-env-vars "MIN_SAVINGS_PCT=$MinSavingsPct,MAX_STORE_COUNT=$MaxStoreCount,MAX_STACK_ITEMS=$MaxStackItems"

$serviceUrl = (& $Gcloud run services describe $ServiceName --region $Region --format="value(status.url)")
Write-Output "CHECKOUT_MATH_URL=$serviceUrl"
Write-Output "Set EXPO_PUBLIC_CHECKOUT_MATH_URL=$serviceUrl"

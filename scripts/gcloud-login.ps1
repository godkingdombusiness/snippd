. "$PSScriptRoot\gcloud-env.ps1"

Invoke-LocalGcloud auth login --no-launch-browser
Invoke-LocalGcloud config set project "gen-lang-client-0848527535"
Invoke-LocalGcloud auth list
Invoke-LocalGcloud config list

. "$PSScriptRoot\gcloud-env.ps1"

Invoke-LocalGcloud --version
Invoke-LocalGcloud auth list
Invoke-LocalGcloud config list

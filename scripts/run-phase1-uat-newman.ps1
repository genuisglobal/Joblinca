param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$CookieHeader = "",
  [string]$CronSecret = "",
  [string]$RecruiterId = "",
  [string]$RecruiterJobId = "",
  [string]$AdminJobId = "",
  [string]$ApplicationId = "",
  [string]$PipelineStageId = "",
  [string]$Folder = "",
  [switch]$CriticalPath,
  [string]$ReportJsonPath = "reports/phase1-uat-report.json"
)

$localNewmanPath = Join-Path $PSScriptRoot "..\\node_modules\\.bin\\newman.cmd"
$newmanExecutable = $null

if (Test-Path $localNewmanPath) {
  $newmanExecutable = (Resolve-Path $localNewmanPath).Path
} else {
  $newmanCommand = Get-Command newman -ErrorAction SilentlyContinue
  if ($newmanCommand) {
    $newmanExecutable = $newmanCommand.Source
  }
}

if (-not $newmanExecutable) {
  Write-Error "Newman is not installed. Install it first with: npm install --save-dev newman"
  exit 1
}

$collectionPath = "docs/joblinca-phase1-uat.postman_collection.json"
$environmentPath = "docs/joblinca-phase1-uat.postman_environment.json"

if ($CriticalPath -and -not $Folder) {
  $Folder = "Critical Path"
}

$reportDirectory = Split-Path -Parent $ReportJsonPath
if ($reportDirectory -and -not (Test-Path $reportDirectory)) {
  New-Item -ItemType Directory -Path $reportDirectory | Out-Null
}

$arguments = @(
  "run",
  $collectionPath,
  "-e",
  $environmentPath,
  "--reporters",
  "cli,json",
  "--reporter-json-export",
  $ReportJsonPath,
  "--env-var",
  "base_url=$BaseUrl",
  "--env-var",
  "cookie_header=$CookieHeader",
  "--env-var",
  "cron_secret=$CronSecret",
  "--env-var",
  "recruiter_id=$RecruiterId",
  "--env-var",
  "recruiter_job_id=$RecruiterJobId",
  "--env-var",
  "admin_job_id=$AdminJobId",
  "--env-var",
  "application_id=$ApplicationId",
  "--env-var",
  "pipeline_stage_id=$PipelineStageId"
)

if ($Folder) {
  $arguments += @("--folder", $Folder)
}

& $newmanExecutable @arguments
exit $LASTEXITCODE

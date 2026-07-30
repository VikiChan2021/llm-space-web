param(
  [switch]$SkipBuild,
  [string]$SshHost = "codex-admin@124.223.55.134",
  [string]$SshKey = "$env:USERPROFILE\.ssh\booksim-codex-admin"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$stageRoot = [IO.Path]::GetFullPath(
  (Join-Path $tempRoot ("llm-space-deploy-" + [guid]::NewGuid().ToString("N")))
)
$archivePath = $null

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

Push-Location $repoRoot
try {
  if (-not $SkipBuild) {
    Invoke-Checked -Command "mise" -Arguments @("run", "build:guest-web")
    Invoke-Checked -Command "mise" -Arguments @("run", "pack:guest-api")
  }

  $webDist = Join-Path $repoRoot "apps\web\dist"
  $apiBundle = Join-Path $repoRoot "apps\cloud\dist\llm-space-guest-api.mjs"
  if (-not (Test-Path -LiteralPath (Join-Path $webDist "index.html"))) {
    throw "Guest Web build output is missing."
  }
  if (-not (Test-Path -LiteralPath $apiBundle)) {
    throw "Guest API bundle is missing."
  }

  $commit = (git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $commit -notmatch "^[0-9a-f]{40}$") {
    throw "Unable to read the current Git commit."
  }
  $releaseName =
    (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss") +
    "-" +
    $commit.Substring(0, 12)
  $archivePath = [IO.Path]::GetFullPath(
    (Join-Path $tempRoot ($releaseName + ".tgz"))
  )
  if (
    -not $stageRoot.StartsWith(
      $tempRoot,
      [StringComparison]::OrdinalIgnoreCase
    ) -or
    -not $archivePath.StartsWith(
      $tempRoot,
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "Temporary release path is outside the system temp directory."
  }

  $stageWeb = Join-Path $stageRoot "web"
  New-Item -ItemType Directory -Path $stageWeb -Force | Out-Null
  Get-ChildItem -LiteralPath $webDist -Force |
    Copy-Item -Destination $stageWeb -Recurse -Force
  Copy-Item -LiteralPath $apiBundle -Destination $stageRoot
  [IO.File]::WriteAllText(
    (Join-Path $stageRoot "RELEASE_COMMIT"),
    $commit + "`n",
    [Text.UTF8Encoding]::new($false)
  )

  $indexHtml = [IO.File]::ReadAllText((Join-Path $stageWeb "index.html"))
  $assetPath = [regex]::Match(
    $indexHtml,
    '/llm-space-web/assets/index-[^"'']+\.js'
  ).Value
  if (-not $assetPath) {
    throw "Unable to identify the main asset in index.html."
  }

  Invoke-Checked -Command "tar.exe" -Arguments @(
    "-czf",
    $archivePath,
    "-C",
    $stageRoot,
    "."
  )
  $remoteArchive = "/tmp/$releaseName.tgz"
  $remoteScript = "/tmp/deploy-llm-space-guest.sh"
  Invoke-Checked -Command "scp" -Arguments @(
    "-i",
    $SshKey,
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    $archivePath,
    "${SshHost}:$remoteArchive"
  )
  Invoke-Checked -Command "scp" -Arguments @(
    "-i",
    $SshKey,
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    (Join-Path $PSScriptRoot "deploy-guest-tencent-remote.sh"),
    "${SshHost}:$remoteScript"
  )
  Invoke-Checked -Command "ssh" -Arguments @(
    "-i",
    $SshKey,
    "-o",
    "BatchMode=yes",
    $SshHost,
    "sudo bash $remoteScript $releaseName $commit $assetPath"
  )

  Write-Output "Deployment completed: $releaseName"
  Write-Output "Commit: $commit"
} finally {
  Pop-Location
  if (Test-Path -LiteralPath $stageRoot) {
    $resolvedStage = [IO.Path]::GetFullPath($stageRoot)
    if (
      $resolvedStage.StartsWith(
        $tempRoot,
        [StringComparison]::OrdinalIgnoreCase
      )
    ) {
      Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
  }
  if ($archivePath -and (Test-Path -LiteralPath $archivePath)) {
    $resolvedArchive = [IO.Path]::GetFullPath($archivePath)
    if (
      $resolvedArchive.StartsWith(
        $tempRoot,
        [StringComparison]::OrdinalIgnoreCase
      )
    ) {
      Remove-Item -LiteralPath $resolvedArchive -Force
    }
  }
}

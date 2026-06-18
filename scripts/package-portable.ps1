param(
  [string]$OutputRoot = ''
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
if (-not $OutputRoot) {
  $OutputRoot = Join-Path $root 'release'
}
$outputRootPath = [System.IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Force -Path $outputRootPath | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$packageName = "gaode-map-portable-$timestamp"
$packageDir = Join-Path $outputRootPath $packageName
$zipFile = Join-Path $outputRootPath "$packageName.zip"

Write-Host "Building project..."
Push-Location $root
try {
  npm run build
} finally {
  Pop-Location
}

Write-Host "Creating package directory..."
New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

function Copy-RequiredPath {
  param(
    [string]$RelativePath,
    [string]$DestinationRelativePath = $RelativePath
  )

  $source = Join-Path $root $RelativePath
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing required path: $RelativePath"
  }

  $destination = Join-Path $packageDir $DestinationRelativePath
  $parent = Split-Path -Parent $destination
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

$projectPaths = @(
  'map3d.html',
  'src',
  'scripts',
  'config',
  'package.json',
  'package-lock.json',
  'vite.config.mjs',
  'node_modules',
  '.env.example',
  '宽厚里.dxf'
)

foreach ($relativePath in $projectPaths) {
  Copy-RequiredPath $relativePath
}

if (Test-Path -LiteralPath (Join-Path $root '.env')) {
  Copy-RequiredPath '.env'
}

New-Item -ItemType Directory -Force -Path (Join-Path $packageDir 'exports') | Out-Null

Write-Host "Copying portable Node runtime..."
$nodeCommand = Get-Command node -ErrorAction Stop
$nodeSource = $nodeCommand.Source
$runtimeNodeDir = Join-Path $packageDir 'runtime\node'
New-Item -ItemType Directory -Force -Path $runtimeNodeDir | Out-Null
Copy-Item -LiteralPath $nodeSource -Destination (Join-Path $runtimeNodeDir 'node.exe') -Force

Write-Host "Locating Playwright Chromium..."
$chromiumPath = & $nodeSource -e "console.log(require('playwright').chromium.executablePath())"
if (-not (Test-Path -LiteralPath $chromiumPath)) {
  throw "Playwright Chromium was not found. Run: npx playwright install chromium"
}
$chromiumExeDir = Split-Path -Parent $chromiumPath
$chromiumRevisionDir = Split-Path -Parent $chromiumExeDir
$playwrightCacheRoot = Split-Path -Parent $chromiumRevisionDir
$browserRuntimeDir = Join-Path $packageDir 'runtime\ms-playwright'
New-Item -ItemType Directory -Force -Path $browserRuntimeDir | Out-Null
$browserPatterns = @('chromium-*', 'chromium_headless_shell-*', 'ffmpeg-*', 'winldd-*')
$copiedBrowserDirs = 0
foreach ($browserDir in Get-ChildItem -LiteralPath $playwrightCacheRoot -Directory) {
  foreach ($pattern in $browserPatterns) {
    if ($browserDir.Name -like $pattern) {
      Copy-Item -LiteralPath $browserDir.FullName -Destination (Join-Path $browserRuntimeDir $browserDir.Name) -Recurse -Force
      $copiedBrowserDirs++
      break
    }
  }
}
if ($copiedBrowserDirs -eq 0) {
  throw "No Playwright browser directories were copied from $playwrightCacheRoot"
}

function Write-Utf8BomFile {
  param(
    [string]$Path,
    [string]$Value
  )

  $encoding = New-Object System.Text.UTF8Encoding -ArgumentList $true
  $content = $Value -replace "`r?`n", "`r`n"
  [System.IO.File]::WriteAllText($Path, $content, $encoding)
}

function Write-AsciiFile {
  param(
    [string]$Path,
    [string]$Value
  )

  $content = $Value -replace "`r?`n", "`r`n"
  [System.IO.File]::WriteAllText($Path, $content, [System.Text.Encoding]::ASCII)
}

$startPs1 = @'
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$node = Join-Path $root 'runtime\node\node.exe'
$browserRoot = Join-Path $root 'runtime\ms-playwright'
$serverScript = Join-Path $root 'scripts\export-server.js'

if (-not (Test-Path -LiteralPath $node)) {
  Write-Host '缺少内置 Node 运行时：runtime\node\node.exe'
  exit 1
}
if (-not (Test-Path -LiteralPath $browserRoot)) {
  Write-Host '缺少内置 Chromium：runtime\ms-playwright'
  exit 1
}
if (-not (Test-Path -LiteralPath $serverScript)) {
  Write-Host '缺少启动脚本：scripts\export-server.js'
  exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $root '.env'))) {
  Write-Host '缺少 .env。请参考 .env.example 配置 VITE_AMAP_KEY。'
}

$env:PLAYWRIGHT_BROWSERS_PATH = $browserRoot
$env:PATH = (Join-Path $root 'runtime\node') + ';' + $env:PATH

$requestedPort = 8765
$envFile = Join-Path $root '.env'
if (Test-Path -LiteralPath $envFile) {
  Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^\s*PORT\s*=\s*(\d+)') {
      $script:requestedPort = [int]$Matches[1]
    }
  }
}

Write-Host '正在启动 3D 地图服务...'
$server = Start-Process -FilePath $node -ArgumentList @('scripts\export-server.js') -WorkingDirectory $root -PassThru -NoNewWindow

try {
  $url = $null
  for ($round = 0; $round -lt 30 -and -not $url; $round++) {
    for ($offset = 0; $offset -le 20; $offset++) {
      $port = $requestedPort + $offset
      $candidate = "http://127.0.0.1:$port/map3d.html"
      try {
        Invoke-WebRequest -UseBasicParsing -Uri $candidate -TimeoutSec 1 | Out-Null
        $url = $candidate
        break
      } catch {
      }
    }
    if (-not $url) {
      Start-Sleep -Seconds 1
    }
  }

  if ($url) {
    Write-Host "已启动：$url"
    $chrome = Get-ChildItem -LiteralPath $browserRoot -Recurse -Filter chrome.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($chrome) {
      $profileDir = Join-Path $root 'runtime\browser-profile'
      New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
      Start-Process -FilePath $chrome.FullName -ArgumentList @("--user-data-dir=$profileDir", $url)
    } else {
      Start-Process $url
    }
  } else {
    Write-Host '服务已启动，但未能自动确认端口。请查看本窗口中的 Open http://127.0.0.1:端口/map3d.html 提示。'
  }

  Write-Host ''
  Write-Host '使用期间请不要关闭此窗口。关闭窗口或按 Ctrl+C 会停止本地服务。'
  Wait-Process -Id $server.Id
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
  }
}
'@

$startBat = @'
@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Gaode.ps1"
pause
'@

$readme = @'
高德 3D 地图便携版

启动方式：
1. 解压整个文件夹。
2. 双击“启动地图.bat”。
3. 程序会启动本地服务，并用包内 Chromium 打开地图页面。
4. 使用期间不要关闭启动窗口；关闭窗口会停止本地服务。

依赖说明：
- 已内置 Node.js 运行时。
- 已内置 npm 依赖 node_modules。
- 已内置 Playwright Chromium，用于打开页面和执行“导出高清图”。
- 已包含当前 .env 配置、config 配置和 DXF 数据文件。

目标电脑仍需满足：
- Windows x64 系统。
- 能访问互联网，用于加载高德地图 SDK 和底图瓦片。
- 高德 Key 仍需有效；如 Key 失效，请编辑 .env 中的 VITE_AMAP_KEY。

文件说明：
- 启动地图.bat：双击启动入口。
- Start-Gaode.ps1：实际启动脚本。
- exports：高清图导出目录。
- .env：端口、高德 Key、默认 DXF 文件名等配置。

如端口 8765 被占用，程序会自动尝试后续端口，并在启动窗口打印实际地址。
'@

$startPs1Path = Join-Path $packageDir 'Start-Gaode.ps1'
Write-Utf8BomFile $startPs1Path $startPs1
Write-AsciiFile (Join-Path $packageDir '启动地图.bat') $startBat
Write-Utf8BomFile (Join-Path $packageDir '使用说明.txt') $readme

$windowsPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (Test-Path -LiteralPath $windowsPowerShell) {
  & $windowsPowerShell -NoProfile -Command @"
`$tokens = `$null
`$errors = `$null
[System.Management.Automation.Language.Parser]::ParseFile('$($startPs1Path.Replace("'", "''"))', [ref]`$tokens, [ref]`$errors) > `$null
if (`$errors.Count) {
  `$errors | ForEach-Object { Write-Error `$_.Message }
  exit 1
}
"@
  if ($LASTEXITCODE -ne 0) {
    throw "Generated Start-Gaode.ps1 failed Windows PowerShell syntax validation"
  }
}

Write-Host "Creating zip archive..."
if (Test-Path -LiteralPath $zipFile) {
  Remove-Item -LiteralPath $zipFile -Force
}
Compress-Archive -LiteralPath $packageDir -DestinationPath $zipFile -Force

Write-Host "Portable package directory: $packageDir"
Write-Host "Portable package zip: $zipFile"

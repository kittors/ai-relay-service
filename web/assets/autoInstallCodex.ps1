<#
--- 警告：请仔细阅读！ ---
此脚本将：
1) 卸载全局的 @openai/codex 包
2) 删除用户目录下的 .codex 配置目录
3) 重新全局安装 @openai/codex（需要已安装 Node.js 和 npm）
4) 在用户目录创建 ~/.codex/config.toml 与 ~/.codex/auth.json

请在 PowerShell 中运行，必要时以“管理员身份运行”。
#>

Write-Host "--- 正在开始 Codex 配置脚本 ---" -ForegroundColor Cyan

function Test-Command($Name) {
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

# 检查 Node/npm
if (-not (Test-Command node) -or -not (Test-Command npm)) {
  Write-Host "未检测到 Node.js 或 npm，请先安装后再运行本脚本。" -ForegroundColor Red
  Write-Host "下载地址: https://nodejs.org/ (建议 LTS 版本)" -ForegroundColor Yellow
  exit 1
}

Write-Host "1. 卸载全局 @openai/codex 包..." -ForegroundColor Yellow
try {
  npm uninstall -g @openai/codex | Out-Null
  Write-Host "   @openai/codex 卸载完成或未安装，继续..." -ForegroundColor DarkGray
} catch {
  Write-Host "   卸载时出现问题（可忽略），继续..." -ForegroundColor DarkGray
}

# 删除 ~/.codex 目录
$HOME = $env:USERPROFILE
$CodexDir = Join-Path $HOME ".codex"
Write-Host "2. 删除 $CodexDir 目录..." -ForegroundColor Yellow
try {
  if (Test-Path $CodexDir) { Remove-Item -Recurse -Force $CodexDir }
  Write-Host "   $CodexDir 已删除或不存在，继续..." -ForegroundColor DarkGray
} catch {
  Write-Host "   无法删除 $CodexDir，请检查权限。" -ForegroundColor Red
}

Write-Host "3. 全局安装 @openai/codex 包..." -ForegroundColor Yellow
try {
  npm install -g @openai/codex
} catch {
  Write-Host "   安装失败，请以管理员身份运行 PowerShell 或检查 npm 权限。" -ForegroundColor Red
  exit 1
}

# 写入配置文件
Write-Host "4. 创建配置目录和 config.toml..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $CodexDir -Force | Out-Null

$ConfigFile = Join-Path $CodexDir "config.toml"
$ConfigContent = @'
model_provider = "codex"
model = "gpt-5" # 可更改为 "gpt-5-codex"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.codex]
name = "codex"
base_url = "https://code.07230805.xyz/openai"
wire_api = "responses"
requires_openai_auth = true
'@

[System.IO.File]::WriteAllText($ConfigFile, $ConfigContent, [System.Text.Encoding]::UTF8)
if (-not (Test-Path $ConfigFile)) {
  Write-Host "   无法创建 $ConfigFile" -ForegroundColor Red
  exit 1
}

# 读入 API Key
Write-Host ""; Write-Host "--- Codex 配置完成，现在需要您的 API 密钥 ---" -ForegroundColor Cyan
$key = Read-Host -Prompt "请输入您的 OpenAI API 密钥 (cr-xxxxxxxxxxxxxxxxxxxx)"
if ([string]::IsNullOrWhiteSpace($key)) {
  Write-Host "未输入密钥，已取消。" -ForegroundColor Red
  exit 1
}

$AuthFile = Join-Path $CodexDir "auth.json"
$AuthContent = "{`n    \"OPENAI_API_KEY\": \"$key\"`n}"
[System.IO.File]::WriteAllText($AuthFile, $AuthContent, [System.Text.Encoding]::UTF8)
if (-not (Test-Path $AuthFile)) {
  Write-Host "   无法创建 $AuthFile" -ForegroundColor Red
  exit 1
}

Write-Host ""; Write-Host "--- Codex 配置脚本执行完毕！ ---" -ForegroundColor Green
Write-Host "现在您可以使用 codex 了。" -ForegroundColor Green
Write-Host "配置文件路径: $ConfigFile" -ForegroundColor DarkGray
Write-Host "认证文件路径: $AuthFile" -ForegroundColor DarkGray
Write-Host "使用以下命令检查版本: codex -V" -ForegroundColor Yellow


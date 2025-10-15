#!/bin/bash

# --- 警告：请仔细阅读！ ---
# 这个脚本将卸载全局的 @openai/codex 包，删除相关的数据，
# 然后重新安装 @openai/codex，并在您的主目录和root目录中创建配置和认证文件。
# 请确保您理解这些操作，并且有权限执行它们。
# 如果您不确定，请不要运行此脚本。

echo "--- 正在开始 Codex 配置脚本 ---"

# --- 步骤 1: 卸载旧的 @openai/codex 包和相关数据 ---
echo "1. 卸载全局 @openai/codex 包..."
if sudo npm uninstall -g @openai/codex; then
    echo "   @openai/codex 已成功卸载。"
else
    echo "   @openai/codex 卸载失败或未安装，继续..."
fi

echo "2. 删除 ~/.codex 目录..."
if rm -rf ~/.codex; then
    echo "   ~/.codex 目录已删除。"
else
    echo "   ~/.codex 目录删除失败或不存在，继续..."
fi

# --- 步骤 2: 重新安装 @openai/codex 包 ---
echo "3. 重新安装全局 @openai/codex 包 (需要 sudo 权限)..."
if sudo npm install -g @openai/codex; then
    echo "   @openai/codex 已成功安装。"
else
    echo "   @openai/codex 安装失败。请检查您的 npm 和 sudo 权限。"
    exit 1 # 如果安装失败，则退出脚本
fi

# --- 步骤 3: 在 root 目录中创建 .codex 文件夹和 config.toml ---
echo "4. 在当前用户根目录 (~/) 创建 .codex 文件夹..."
# 注意：您的描述是“在root目录中创建 .codex文件夹”，这通常指 /root 目录（仅限 root 用户访问），
# 或者在当前用户的“根目录”（~，即 $HOME 目录）。
# 我假设您指的是当前用户的根目录 (~/)，这是更常见且用户可访问的位置。
# 如果您确实想在 /root 目录创建，请将 ~/.codex 改为 /root/.codex 并确保您有运行权限。
CODEX_DIR="$HOME/.codex"
if mkdir -p "$CODEX_DIR"; then
    echo "   $CODEX_DIR 目录已创建。"
else
    echo "   无法创建 $CODEX_DIR 目录。请检查权限。"
    exit 1
fi

CONFIG_FILE="$CODEX_DIR/config.toml"
echo "5. 创建 $CONFIG_FILE 文件..."
cat << EOF > "$CONFIG_FILE"
model_provider = "codex"
model = "gpt-5" #可更改为model = "gpt-5-codex"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.codex]
name = "codex"
base_url = "https://code.07230805.xyz/openai"
wire_api = "responses"
requires_openai_auth = true
EOF

if [ -f "$CONFIG_FILE" ]; then
    echo "   $CONFIG_FILE 已成功创建。"
else
    echo "   $CONFIG_FILE 创建失败。"
    exit 1
fi

# --- 步骤 4: 询问 API 密钥并创建 auth.json ---
echo ""
echo "--- Codex 配置完成，现在需要您的 API 密钥 ---"
read -p "请输入您的 OpenAI API 密钥 (cr-xxxxxxxxxxxxxxxxxxxx): " OPENAI_API_KEY

AUTH_FILE="$CODEX_DIR/auth.json"
echo "6. 创建 $AUTH_FILE 文件..."
cat << EOF > "$AUTH_FILE"
{
    "OPENAI_API_KEY": "$OPENAI_API_KEY"
}
EOF

if [ -f "$AUTH_FILE" ]; then
    echo "   $AUTH_FILE 已成功创建。"
else
    echo "   $AUTH_FILE 创建失败。"
    exit 1
fi

echo ""
echo "--- Codex 配置脚本执行完毕！ ---"
echo "您现在应该可以使用 @openai/codex 了。"
echo "配置文件路径: $CONFIG_FILE"
echo "认证文件路径: $AUTH_FILE"
echo "您的 API 密钥已保存在 $AUTH_FILE 中。"


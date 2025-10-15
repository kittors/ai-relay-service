#!/bin/sh
set -e

echo "🚀 AI Relay Service 启动中..."

# 检查关键环境变量
if [ -z "$JWT_SECRET" ]; then
  echo "❌ 错误: JWT_SECRET 环境变量未设置"
  echo "   请在 docker-compose.yml 中设置 JWT_SECRET"
  echo "   例如: JWT_SECRET=your-random-secret-key-at-least-32-chars"
  exit 1
fi

if [ -z "$ENCRYPTION_KEY" ]; then
  echo "❌ 错误: ENCRYPTION_KEY 环境变量未设置"
  echo "   请在 docker-compose.yml 中设置 ENCRYPTION_KEY"
  echo "   例如: ENCRYPTION_KEY=your-32-character-encryption-key"
  exit 1
fi

# 确保配置目录存在
mkdir -p /app/config

# 检查并准备配置文件
if [ ! -f "/app/config/config.js" ]; then
  echo "📋 检测到 config.js 不存在，尝试从模板创建..."
  if [ -f "/app/config/config.example.js" ]; then
    cp /app/config/config.example.js /app/config/config.js
    echo "✅ config.js 已从 /app/config/config.example.js 创建"
  else
    echo "⚠️  警告: 未找到 /app/config/config.example.js，使用内置默认模板生成 config.js"
    # 使用内置模板生成最小可用的配置（所有值从环境变量读取）
    cat > /app/config/config.js <<'EOF'
const path = require('path')
require('dotenv').config()

const config = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'production',
    trustProxy: process.env.TRUST_PROXY === 'true'
  },
  security: {
    jwtSecret: process.env.JWT_SECRET || 'CHANGE-THIS-JWT-SECRET-IN-PRODUCTION',
    adminSessionTimeout: parseInt(process.env.ADMIN_SESSION_TIMEOUT) || 86400000,
    apiKeyPrefix: process.env.API_KEY_PREFIX || 'cr_',
    encryptionKey: process.env.ENCRYPTION_KEY || 'CHANGE-THIS-32-CHARACTER-KEY-NOW'
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB) || 0,
    connectTimeout: 10000,
    commandTimeout: 5000,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableTLS: process.env.REDIS_ENABLE_TLS === 'true',
    enableReadyCheck: process.env.REDIS_ENABLE_READY_CHECK !== 'false',
    tlsOptions: {
      rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED === 'false' ? false : true,
      servername: process.env.REDIS_TLS_SERVERNAME || undefined
    }
  },
  session: {
    stickyTtlHours: parseFloat(process.env.STICKY_SESSION_TTL_HOURS) || 1,
    renewalThresholdMinutes: parseInt(process.env.STICKY_SESSION_RENEWAL_THRESHOLD_MINUTES) || 0
  },
  claude: {
    apiUrl: process.env.CLAUDE_API_URL || 'https://api.anthropic.com/v1/messages',
    apiVersion: process.env.CLAUDE_API_VERSION || '2023-06-01',
    betaHeader: process.env.CLAUDE_BETA_HEADER || 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14',
    overloadHandling: { enabled: (parseInt(process.env.CLAUDE_OVERLOAD_HANDLING_MINUTES) || 0) > 0 }
  },
  bedrock: {
    enabled: process.env.CLAUDE_CODE_USE_BEDROCK === '1',
    defaultRegion: process.env.AWS_REGION || 'us-east-1',
    smallFastModelRegion: process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION,
    defaultModel: process.env.ANTHROPIC_MODEL || 'us.anthropic.claude-sonnet-4-20250514-v1:0',
    smallFastModel: process.env.ANTHROPIC_SMALL_FAST_MODEL || 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
    maxOutputTokens: parseInt(process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS) || 4096,
    maxThinkingTokens: parseInt(process.env.MAX_THINKING_TOKENS) || 1024,
    enablePromptCaching: process.env.DISABLE_PROMPT_CACHING !== '1'
  },
  proxy: {
    timeout: parseInt(process.env.DEFAULT_PROXY_TIMEOUT) || 600000,
    maxRetries: parseInt(process.env.MAX_PROXY_RETRIES) || 3,
    useIPv4: process.env.PROXY_USE_IPV4 !== 'false'
  },
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 600000,
  limits: { defaultTokenLimit: parseInt(process.env.DEFAULT_TOKEN_LIMIT) || 1000000 },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dirname: path.join(__dirname, '..', 'logs'),
    maxSize: process.env.LOG_MAX_SIZE || '10m',
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
  },
  system: {
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL) || 3600000,
    tokenUsageRetention: parseInt(process.env.TOKEN_USAGE_RETENTION) || 2592000000,
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 60000,
    timezone: process.env.SYSTEM_TIMEZONE || 'Asia/Shanghai',
    timezoneOffset: parseInt(process.env.TIMEZONE_OFFSET) || 8
  },
  web: {
    title: process.env.WEB_TITLE || 'AI Relay Service',
    description: process.env.WEB_DESCRIPTION || 'Multi-account Claude API relay service with beautiful management interface',
    logoUrl: process.env.WEB_LOGO_URL || '/assets/logo.png',
    enableCors: process.env.ENABLE_CORS === 'true',
    sessionSecret: process.env.WEB_SESSION_SECRET || 'CHANGE-THIS-SESSION-SECRET'
  },
  ldap: {
    enabled: process.env.LDAP_ENABLED === 'true',
    server: {
      url: process.env.LDAP_URL || 'ldap://localhost:389',
      bindDN: process.env.LDAP_BIND_DN || 'cn=admin,dc=example,dc=com',
      bindCredentials: process.env.LDAP_BIND_PASSWORD || 'admin',
      searchBase: process.env.LDAP_SEARCH_BASE || 'dc=example,dc=com',
      searchFilter: process.env.LDAP_SEARCH_FILTER || '(uid={{username}})',
      searchAttributes: process.env.LDAP_SEARCH_ATTRIBUTES ? process.env.LDAP_SEARCH_ATTRIBUTES.split(',') : ['dn', 'uid', 'cn', 'mail', 'givenName', 'sn'],
      timeout: parseInt(process.env.LDAP_TIMEOUT) || 5000,
      connectTimeout: parseInt(process.env.LDAP_CONNECT_TIMEOUT) || 10000,
      tls: {
        rejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== 'false',
        ca: process.env.LDAP_TLS_CA_FILE ? require('fs').readFileSync(process.env.LDAP_TLS_CA_FILE) : undefined,
        cert: process.env.LDAP_TLS_CERT_FILE ? require('fs').readFileSync(process.env.LDAP_TLS_CERT_FILE) : undefined,
        key: process.env.LDAP_TLS_KEY_FILE ? require('fs').readFileSync(process.env.LDAP_TLS_KEY_FILE) : undefined,
        servername: process.env.LDAP_TLS_SERVERNAME || undefined
      }
    },
    userMapping: {
      username: process.env.LDAP_USER_ATTR_USERNAME || 'uid',
      displayName: process.env.LDAP_USER_ATTR_DISPLAY_NAME || 'cn',
      email: process.env.LDAP_USER_ATTR_EMAIL || 'mail',
      firstName: process.env.LDAP_USER_ATTR_FIRST_NAME || 'givenName',
      lastName: process.env.LDAP_USER_ATTR_LAST_NAME || 'sn'
    }
  },
  userManagement: {
    enabled: process.env.USER_MANAGEMENT_ENABLED === 'true',
    defaultUserRole: process.env.DEFAULT_USER_ROLE || 'user',
    userSessionTimeout: parseInt(process.env.USER_SESSION_TIMEOUT) || 86400000,
    maxApiKeysPerUser: parseInt(process.env.MAX_API_KEYS_PER_USER) || 1,
    allowUserDeleteApiKeys: process.env.ALLOW_USER_DELETE_API_KEYS === 'true'
  },
  webhook: {
    enabled: process.env.WEBHOOK_ENABLED !== 'false',
    urls: process.env.WEBHOOK_URLS ? process.env.WEBHOOK_URLS.split(',').map((url) => url.trim()) : [],
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 10000,
    retries: parseInt(process.env.WEBHOOK_RETRIES) || 3
  },
  // 支付配置（包含虎皮椒）
  payment: {
    redirectBaseUrl: process.env.PAYMENT_REDIRECT_BASE_URL || '',
    xunhu: {
      appId: process.env.XH_APPID || '',
      appSecret: process.env.XH_SECRET || '',
      doUrl: process.env.XH_DO_URL || 'https://api.xunhupay.com/payment/do.html',
      queryUrl: process.env.XH_QUERY_URL || 'https://api.xunhupay.com/payment/query.html',
      backupQueryUrl: process.env.XH_QUERY_URL_BACKUP || 'https://api.dpweixin.com/payment/query.html',
      plugin: process.env.XH_PLUGIN || '',
      version: process.env.XH_VERSION || '1.1',
      type: process.env.XH_TYPE || '',
      wapUrl: process.env.XH_WAP_URL || '',
      wapName: process.env.XH_WAP_NAME || '',
      notifyPath: process.env.XH_NOTIFY_PATH || '/webhook/xunhu',
      returnPath: process.env.XH_RETURN_PATH || '/admin-next/api-stats'
    }
  },
  development: {
    debug: process.env.DEBUG === 'true',
    hotReload: process.env.HOT_RELOAD === 'true'
  }
}

module.exports = config
EOF
    echo "✅ 已生成默认 config.js（基于环境变量）"
  fi
fi

# 显示配置信息
echo "✅ 环境配置已就绪"
echo "   JWT_SECRET: [已设置]"
echo "   ENCRYPTION_KEY: [已设置]"
echo "   REDIS_HOST: ${REDIS_HOST:-localhost}"
echo "   PORT: ${PORT:-3000}"

# 确保依赖已安装（开发环境使用挂载时 node_modules 可能为空）
if [ ! -d "/app/node_modules/chalk" ]; then
  echo "📦 检测到依赖未安装，正在安装..."
  if [ "${NODE_ENV}" = "development" ]; then
    npm install
  else
    npm ci --omit=dev
  fi
  echo "✅ 依赖安装完成"
fi

# 检查是否需要初始化
if [ ! -f "/app/data/init.json" ]; then
  echo "📋 首次启动，执行初始化设置..."
  
  # 如果设置了环境变量，显示提示
  if [ -n "$ADMIN_USERNAME" ] || [ -n "$ADMIN_PASSWORD" ]; then
    echo "📌 检测到预设的管理员凭据"
  fi
  
  # 执行初始化脚本
  node /app/scripts/setup.js
  
  echo "✅ 初始化完成"
else
  echo "✅ 检测到已有配置，跳过初始化"
  
  # 如果 init.json 存在但环境变量也设置了，显示警告
  if [ -n "$ADMIN_USERNAME" ] || [ -n "$ADMIN_PASSWORD" ]; then
    echo "⚠️  警告: 检测到环境变量 ADMIN_USERNAME/ADMIN_PASSWORD，但系统已初始化"
    echo "   如需使用新凭据，请删除 data/init.json 文件后重启容器"
  fi
fi

# 启动应用
echo "🌐 启动 AI Relay Service..."
exec "$@"

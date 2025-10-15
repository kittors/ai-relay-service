// 显示用的通知类型名称与描述
export const NOTIFICATION_TYPE_META = {
  accountAnomaly: { name: '账号异常', desc: '账号状态异常、认证失败等' },
  quotaWarning: { name: '配额警告', desc: 'API调用配额不足警告' },
  systemError: { name: '系统错误', desc: '系统运行错误和故障' },
  securityAlert: { name: '安全警报', desc: '安全相关的警报通知' },
  rateLimitRecovery: { name: '限流恢复', desc: '限流状态恢复时发送提醒' },
  test: { name: '测试通知', desc: '用于测试Webhook连接是否正常' }
}

export const DEFAULT_NOTIFICATION_TYPES = {
  accountAnomaly: true,
  quotaWarning: true,
  systemError: true,
  securityAlert: true,
  rateLimitRecovery: true
}

// 平台显示元信息（名称、图标、提示）
export const PLATFORM_META = {
  wechat_work: {
    name: '企业微信',
    icon: 'fab fa-weixin text-green-600',
    hint: '请在企业微信群机器人设置中获取Webhook地址'
  },
  dingtalk: {
    name: '钉钉',
    icon: 'fas fa-bell text-blue-600',
    hint: '请在钉钉群机器人设置中获取Webhook地址'
  },
  feishu: {
    name: '飞书',
    icon: 'fas fa-paper-plane text-indigo-600',
    hint: '请在飞书群机器人设置中获取Webhook地址'
  },
  slack: {
    name: 'Slack',
    icon: 'fab fa-slack text-purple-600',
    hint: '请在 Slack App 的 Incoming Webhook 中获取 URL'
  },
  discord: {
    name: 'Discord',
    icon: 'fab fa-discord text-indigo-500',
    hint: '请在 Discord 频道的 Integrations -> Webhooks 中获取 URL'
  },
  telegram: {
    name: 'Telegram',
    icon: 'fab fa-telegram text-sky-500',
    hint: '需要 Bot Token 与 Chat ID，可选 API 基础地址与代理'
  },
  bark: {
    name: 'Bark',
    icon: 'fas fa-bell text-emerald-600',
    hint: '在 Bark App 中查看您的设备密钥，可选服务器地址'
  },
  smtp: {
    name: '邮件通知',
    icon: 'fas fa-envelope text-orange-600',
    hint: '请配置 SMTP 服务器信息，支持Gmail、QQ邮箱等'
  },
  custom: {
    name: '自定义',
    icon: 'fas fa-cog text-gray-600',
    hint: '请输入完整的Webhook接收地址'
  }
}

export function getNotificationTypeName(type) {
  return NOTIFICATION_TYPE_META[type]?.name || type
}

export function getNotificationTypeDescription(type) {
  return NOTIFICATION_TYPE_META[type]?.desc || ''
}

export function getPlatformName(type) {
  return PLATFORM_META[type]?.name || type
}

export function getPlatformIcon(type) {
  return PLATFORM_META[type]?.icon || 'fas fa-bell'
}

export function getWebhookHint(type) {
  return PLATFORM_META[type]?.hint || ''
}

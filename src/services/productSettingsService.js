const redis = require('../models/redis')

const DEFAULT_PRODUCT_PLANS = [
  {
    id: 'trial_24h_300',
    name: '体验（24小时）',
    description: '24小时内有效，适合快速体验和测试',
    price: '4.88',
    priceNote: '一次性',
    durationDesc: '24小时有效',
    dailyLimit: 300,
    tag: '体验',
    apiKeyTemplateId: '',
    active: true,
    order: 1
  },
  {
    id: 'vip_month_200',
    name: 'VIP（月）',
    description: '标准日配额，满足日常使用需求',
    price: '55',
    priceNote: '每月',
    durationDesc: '一个月',
    dailyLimit: 200,
    tag: 'VIP',
    apiKeyTemplateId: '',
    active: true,
    order: 2
  },
  {
    id: 'svip_month_500',
    name: 'SVIP（月）',
    description: '更高日配额，适合重度使用',
    price: '98',
    priceNote: '每月',
    durationDesc: '一个月',
    dailyLimit: 500,
    tag: 'SVIP',
    apiKeyTemplateId: '',
    active: true,
    order: 3
  },
  {
    id: 'max_month_1200',
    name: 'Max（月）',
    description: '高配额，适合团队与专业用户',
    price: '198',
    priceNote: '每月',
    durationDesc: '一个月',
    dailyLimit: 1200,
    tag: 'Max',
    apiKeyTemplateId: '',
    active: true,
    order: 4
  },
  {
    id: 'ultra_month_2500',
    name: 'Ultra（月）',
    description: '超高日配额，满足企业级需求',
    price: '398',
    priceNote: '每月',
    durationDesc: '一个月',
    dailyLimit: 2500,
    tag: 'Ultra',
    apiKeyTemplateId: '',
    active: true,
    order: 5
  }
]

async function getProductSettings() {
  const client = redis.getClient()
  const data = await client.get('product:settings')
  if (!data) {
    return { plans: DEFAULT_PRODUCT_PLANS, updatedAt: new Date().toISOString() }
  }
  try {
    const settings = JSON.parse(data)
    if (!Array.isArray(settings?.plans)) {
      return { plans: DEFAULT_PRODUCT_PLANS, updatedAt: new Date().toISOString() }
    }
    return settings
  } catch (e) {
    return { plans: DEFAULT_PRODUCT_PLANS, updatedAt: new Date().toISOString() }
  }
}

async function findPlanById(planId) {
  const settings = await getProductSettings()
  return (settings.plans || []).find((p) => p.id === planId) || null
}

module.exports = {
  getProductSettings,
  findPlanById
}

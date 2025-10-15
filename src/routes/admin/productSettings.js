const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const settingsStore = require('../../models/systemSettingsStore')

// 默认套餐列表
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

// 获取产品套餐（公开接口，用于展示）
router.get('/product-settings', async (req, res) => {
  try {
    const client = redis.getClient()
    // 优先从 PG 获取
    let settings = null
    try {
      settings = await settingsStore.get('product_settings')
    } catch (e) {
      logger.debug('product-settings PG get failed, fallback to Redis:', e.message)
    }
    if (!settings) {
      const data = await client.get('product:settings')
      if (data) {
        try {
          settings = JSON.parse(data)
        } catch (e) {
          logger.warn('⚠️ Failed to parse product settings, using defaults:', e.message)
        }
      }
    }
    if (!settings || !Array.isArray(settings.plans)) {
      settings = { plans: DEFAULT_PRODUCT_PLANS, updatedAt: new Date().toISOString() }
    }
    const activePlans = settings.plans
      .filter((p) => p && p.active !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
    // 如果从 PG 读取而 Redis 无值则同步写回 Redis 以兼容旧读取
    if (settings && settings.plans && !(await client.get('product:settings'))) {
      try {
        await client.set('product:settings', JSON.stringify(settings))
      } catch {}
    }
    return res.json({ success: true, data: { plans: activePlans, updatedAt: settings.updatedAt } })
  } catch (error) {
    logger.error('❌ Failed to get product settings:', error)
    return res.status(500).json({ error: 'Failed to get product settings', message: error.message })
  }
})

// 更新产品套餐（需要管理员）
router.put('/product-settings', authenticateAdmin, async (req, res) => {
  try {
    const { plans } = req.body || {}
    if (!Array.isArray(plans)) {
      return res.status(400).json({ error: 'Invalid plans payload' })
    }
    const normalized = plans.slice(0, 50).map((p, idx) => ({
      id:
        String(p.id || '')
          .trim()
          .slice(0, 64) || `plan_${idx + 1}`,
      name:
        String(p.name || '')
          .trim()
          .slice(0, 64) || `套餐${idx + 1}`,
      description: String(p.description || '')
        .trim()
        .slice(0, 200),
      price: String(p.price || '')
        .trim()
        .slice(0, 32),
      priceNote: String(p.priceNote || '')
        .trim()
        .slice(0, 64),
      durationDesc: String(p.durationDesc || '')
        .trim()
        .slice(0, 64),
      dailyLimit: Math.max(0, parseInt(p.dailyLimit, 10) || 0),
      tag: String(p.tag || '')
        .trim()
        .slice(0, 32),
      apiKeyTemplateId: String(p.apiKeyTemplateId || '')
        .trim()
        .slice(0, 64),
      active: p.active !== false,
      order: Number.isFinite(p.order) ? p.order : idx + 1
    }))
    const settings = { plans: normalized, updatedAt: new Date().toISOString() }
    const client = redis.getClient()
    // 写入 PG
    try {
      await settingsStore.set('product_settings', settings)
    } catch (e) {
      logger.warn('⚠️ Failed to save product settings to Postgres:', e.message)
    }
    // 同步写入 Redis 以兼容旧读取
    try {
      await client.set('product:settings', JSON.stringify(settings))
    } catch (e) {
      logger.warn('⚠️ Failed to save product settings to Redis:', e.message)
    }
    logger.info(`✅ Product settings updated: ${normalized.length} plans`)
    return res.json({ success: true, message: 'Product settings updated', data: settings })
  } catch (error) {
    logger.error('❌ Failed to update product settings:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update product settings', message: error.message })
  }
})

module.exports = router

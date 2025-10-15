const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')

// 创建虎皮椒订单（公开）
router.post('/xunhu/create', async (req, res) => {
  try {
    const appCfg = require('../../../config/config')
    const xh = appCfg.payment?.xunhu || {}
    if (!xh.appId || !xh.appSecret || !xh.doUrl) {
      return res.status(400).json({ error: 'XunhuPay not configured' })
    }
    const { planId, email } = req.body || {}
    if (!planId) {
      return res.status(400).json({ error: 'planId is required' })
    }
    const isValidEmail = (v) =>
      typeof v === 'string' &&
      v.trim().length >= 5 &&
      v.trim().length <= 128 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'invalid email' })
    }
    const productService = require('../../services/productSettingsService')
    const orderService = require('../../services/orderService')
    const xhService = require('../../services/xunhuPayService')
    const plan = await productService.findPlanById(String(planId))
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' })
    }
    const price = plan.price || '0.01'
    const title = plan.name || 'AI Relay 订购'
    const outTradeOrder = `xh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await orderService.createOrder({
      id: outTradeOrder,
      planId: plan.id,
      price,
      title,
      status: 'INIT',
      email: String(email || '')
        .trim()
        .slice(0, 128)
    })
    const origin = `${req.protocol}://${req.get('host')}`
    const notify_url = new URL(xh.notifyPath || '/webhook/xunhu', origin).toString()
    const returnTo = new URL(xh.returnPath || '/admin-next/api-stats', origin)
    returnTo.searchParams.set('order', outTradeOrder)
    if (planId) {
      returnTo.searchParams.set('plan', planId)
    }
    const return_url = returnTo.toString()
    const payload = xhService.buildCreatePayload({
      out_trade_order: outTradeOrder,
      total_fee: price,
      title,
      notify_url,
      return_url,
      plugin: xh.plugin || '',
      attach: String(email || '').trim()
    })
    const axios = require('axios')
    const resp = await axios.post(xh.doUrl, new URLSearchParams(payload), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000
    })
    const data = resp.data || {}
    const payUrl = data?.data?.url || data?.url || data?.data?.payurl || data?.payurl
    const qrUrl = data?.data?.url_qrcode || data?.url_qrcode || ''
    if (!payUrl) {
      return res
        .status(500)
        .json({ error: 'Failed to create payment', message: data?.errmsg || 'no url' })
    }
    return res.json({
      success: true,
      data: { orderId: outTradeOrder, payUrl, qrUrl, price, title }
    })
  } catch (error) {
    logger.error('❌ Failed to create xunhu order:', error)
    return res.status(500).json({ error: 'Create failed', message: error.message })
  }
})

// 虎皮椒 - 订单查询（公开）
router.post('/xunhu/query', async (req, res) => {
  try {
    const { out_trade_order, open_order_id } = req.body || {}
    if (!out_trade_order && !open_order_id) {
      return res.status(400).json({ error: 'out_trade_order or open_order_id is required' })
    }
    const xunhuPayService = require('../../services/xunhuPayService')
    const orderService = require('../../services/orderService')
    const productSettingsService = require('../../services/productSettingsService')
    const result = await xunhuPayService.queryOrder({ out_trade_order, open_order_id })
    const data = (result && result.data) || {}
    const status = data.status || data.trade_status || ''
    const openId = data.open_order_id || data.open_orderid || ''
    const localId = out_trade_order || data.out_trade_order || data.trade_order_id || ''
    if (localId) {
      await orderService.updateOrder(localId, {
        status: status || undefined,
        openOrderId: openId || undefined
      })
      if (status === 'OD') {
        const order = await orderService.getOrder(localId)
        if (order && order.planId && !order.apiKeyId) {
          try {
            const plan = await productSettingsService.findPlanById(order.planId)
            if (plan?.apiKeyTemplateId) {
              const apiKeyTemplateService = require('../../services/apiKeyTemplateService')
              const apiKeyService = require('../../services/apiKeyService')
              const tpl = await apiKeyTemplateService.getTemplate(plan.apiKeyTemplateId)
              if (tpl) {
                const created = await apiKeyService.generateApiKey({
                  name: `Order_${localId}`,
                  description: tpl.description || '',
                  tokenLimit: tpl.tokenLimit || 0,
                  claudeAccountId: tpl.claudeAccountId || '',
                  claudeConsoleAccountId: tpl.claudeConsoleAccountId || '',
                  geminiAccountId: tpl.geminiAccountId || '',
                  openaiAccountId: tpl.openaiAccountId || '',
                  azureOpenaiAccountId: tpl.azureOpenaiAccountId || '',
                  bedrockAccountId: tpl.bedrockAccountId || '',
                  droidAccountId: tpl.droidAccountId || '',
                  permissions: tpl.permissions || 'all',
                  isActive: tpl.isActive !== false,
                  expiresAt: tpl.expiresAt || '',
                  concurrencyLimit: tpl.concurrencyLimit || 0,
                  rateLimitWindow: tpl.rateLimitWindow || 0,
                  rateLimitRequests: tpl.rateLimitRequests || 0,
                  rateLimitCost: tpl.rateLimitCost || 0,
                  dailyRequestsLimit: tpl.dailyRequestsLimit || 0,
                  enableModelRestriction: !!tpl.enableModelRestriction,
                  restrictedModels: tpl.restrictedModels || [],
                  enableClientRestriction: !!tpl.enableClientRestriction,
                  allowedClients: tpl.allowedClients || [],
                  dailyCostLimit: tpl.dailyCostLimit || 0,
                  totalCostLimit: tpl.totalCostLimit || 0,
                  weeklyOpusCostLimit: tpl.weeklyOpusCostLimit || 0,
                  activationDays: tpl.activationDays || 0,
                  activationUnit: tpl.activationUnit || 'days',
                  expirationMode: tpl.expirationMode || 'fixed',
                  icon: tpl.icon || '',
                  tags: Array.isArray(tpl.tags)
                    ? tpl.tags.concat(['order', order.planId])
                    : ['order', order.planId],
                  createdBy: 'system',
                  createdByType: 'system'
                })
                await orderService.updateOrder(localId, {
                  apiKeyId: created.id,
                  apiKeyPlain: created.apiKey || ''
                })
              }
            }
          } catch (e) {
            logger.error('❌ Failed to create API key during query reconcile:', e)
          }
        }
      }
    }
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to query xunhu order:', error)
    return res.status(500).json({ error: 'Query failed', message: error.message })
  }
})

// 按邮箱查询订单与API Key（管理员）
router.get('/orders/search', authenticateAdmin, async (req, res) => {
  try {
    const { email = '' } = req.query
    const e = String(email || '').trim()
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      return res.status(400).json({ error: 'invalid email' })
    }
    const orderService = require('../../services/orderService')
    const results = await orderService.findOrdersByEmail(e)
    const redisModel = require('../../models/redis')
    const client = redisModel.getClient()
    const enriched = []
    for (const o of results) {
      let key = null
      if (o.apiKeyId) {
        const kd = await client.hgetall(`apikey:${o.apiKeyId}`)
        if (kd && Object.keys(kd).length) {
          key = {
            id: kd.id,
            name: kd.name,
            isActive: kd.isActive === 'true',
            createdAt: kd.createdAt,
            expiresAt: kd.expiresAt,
            permissions: kd.permissions,
            isDeleted: kd.isDeleted === 'true',
            deletedAt: kd.deletedAt || null,
            deletedBy: kd.deletedBy || null,
            deletedByType: kd.deletedByType || null
          }
        }
      }
      enriched.push({ order: o, apiKey: key })
    }
    return res.json({ success: true, data: enriched })
  } catch (error) {
    logger.error('❌ Failed to search orders by email:', error)
    return res
      .status(500)
      .json({ error: 'Failed to search orders by email', message: error.message })
  }
})

// 订单状态查询（公开）
router.get('/orders/:id', async (req, res) => {
  try {
    const orderService = require('../../services/orderService')
    const { id } = req.params
    const order = await orderService.getOrder(id)
    if (!order) {
      return res.status(404).json({ error: 'Order not found' })
    }
    return res.json({ success: true, data: order })
  } catch (error) {
    logger.error('❌ Failed to get order:', error)
    return res.status(500).json({ error: 'Failed to get order', message: error.message })
  }
})

module.exports = router

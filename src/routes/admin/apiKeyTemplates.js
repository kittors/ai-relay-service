const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')

const apiKeyTemplateService = require('../../services/apiKeyTemplateService')
const apiKeyService = require('../../services/apiKeyService')

// === API Key 套餐模板管理 ===
// 列表
router.get('/api-key-templates', authenticateAdmin, async (req, res) => {
  try {
    const list = await apiKeyTemplateService.listTemplates()
    return res.json({ success: true, data: list })
  } catch (error) {
    logger.error('❌ Failed to list API key templates:', error)
    return res.status(500).json({ error: 'Failed to list templates', message: error.message })
  }
})

// 创建
router.post('/api-key-templates', authenticateAdmin, async (req, res) => {
  try {
    const { name } = req.body
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Template name is required' })
    }
    const t = await apiKeyTemplateService.createTemplate(req.body)
    return res.json({ success: true, data: t })
  } catch (error) {
    logger.error('❌ Failed to create API key template:', error)
    return res.status(500).json({ error: 'Failed to create template', message: error.message })
  }
})

// 更新
router.put('/api-key-templates/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const t = await apiKeyTemplateService.updateTemplate(id, req.body)
    return res.json({ success: true, data: t })
  } catch (error) {
    logger.error('❌ Failed to update API key template:', error)
    return res.status(500).json({ error: 'Failed to update template', message: error.message })
  }
})

// 删除
router.delete('/api-key-templates/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const result = await apiKeyTemplateService.deleteTemplate(id)
    return res.json({ success: true, ...result })
  } catch (error) {
    logger.error('❌ Failed to delete API key template:', error)
    return res.status(500).json({ error: 'Failed to delete template', message: error.message })
  }
})

// 使用模板快速创建 API Key（支持批量）
router.post('/api-keys/from-template', authenticateAdmin, async (req, res) => {
  try {
    const { templateId, name, count = 1, tags = [] } = req.body
    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' })
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' })
    }
    const t = await apiKeyTemplateService.getTemplate(templateId)
    if (!t) {
      return res.status(404).json({ error: 'Template not found' })
    }

    const base = {
      description: t.description || '',
      tokenLimit: t.tokenLimit || 0,
      claudeAccountId: t.claudeAccountId || '',
      claudeConsoleAccountId: t.claudeConsoleAccountId || '',
      geminiAccountId: t.geminiAccountId || '',
      openaiAccountId: t.openaiAccountId || '',
      azureOpenaiAccountId: t.azureOpenaiAccountId || '',
      bedrockAccountId: t.bedrockAccountId || '',
      droidAccountId: t.droidAccountId || '',
      permissions: t.permissions || 'all',
      isActive: t.isActive !== false,
      expiresAt: t.expiresAt || '',
      concurrencyLimit: t.concurrencyLimit || 0,
      rateLimitWindow: t.rateLimitWindow || 0,
      rateLimitRequests: t.rateLimitRequests || 0,
      rateLimitCost: t.rateLimitCost || 0,
      dailyRequestsLimit: t.dailyRequestsLimit || 0,
      enableModelRestriction: !!t.enableModelRestriction,
      restrictedModels: t.restrictedModels || [],
      enableClientRestriction: !!t.enableClientRestriction,
      allowedClients: t.allowedClients || [],
      dailyCostLimit: t.dailyCostLimit || 0,
      totalCostLimit: t.totalCostLimit || 0,
      weeklyOpusCostLimit: t.weeklyOpusCostLimit || 0,
      activationDays: t.activationDays || 0,
      activationUnit: t.activationUnit || 'days',
      expirationMode: t.expirationMode || 'fixed',
      icon: t.icon || '',
      tags: Array.isArray(tags) && tags.length ? tags : t.tags || []
    }

    if (count > 1) {
      const createdKeys = []
      const errors = []
      for (let i = 1; i <= Math.min(500, count); i++) {
        try {
          const created = await apiKeyService.generateApiKey({ ...base, name: `${name}_${i}` })
          createdKeys.push({ ...created, apiKey: created.apiKey })
        } catch (err) {
          errors.push({ index: i, name: `${name}_${i}`, error: err.message })
        }
      }
      if (createdKeys.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: 'Failed to create any API keys', errors })
      }
      return res.json({
        success: true,
        data: createdKeys,
        errors: errors.length ? errors : undefined
      })
    } else {
      const created = await apiKeyService.generateApiKey({ ...base, name })
      return res.json({ success: true, data: { ...created, apiKey: created.apiKey } })
    }
  } catch (error) {
    logger.error('❌ Failed to create API key from template:', error)
    return res.status(500).json({ error: 'Failed to create from template', message: error.message })
  }
})

module.exports = router

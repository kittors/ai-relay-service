const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const openaiResponsesAccountService = require('../../services/openaiResponsesAccountService')
const accountGroupService = require('../../services/accountGroupService')
const apiKeyService = require('../../services/apiKeyService')
const webhookNotifier = require('../../utils/webhookNotifier')

// 获取所有 OpenAI-Responses 账户
router.get('/openai-responses-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await openaiResponsesAccountService.getAllAccounts(true)
    if (platform && platform !== 'openai-responses') {
      accounts = []
    }
    if (groupId) {
      const group = await accountGroupService.getGroup(groupId)
      if (group && group.platform === 'openai' && group.memberIds && group.memberIds.length > 0) {
        accounts = accounts.filter((account) => group.memberIds.includes(account.id))
      } else {
        accounts = []
      }
    }
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const today = redis.getDateStringInTimezone()
          if (account.lastResetDate !== today) {
            await openaiResponsesAccountService.updateAccount(account.id, {
              dailyUsage: '0',
              lastResetDate: today,
              quotaStoppedAt: ''
            })
            account.dailyUsage = '0'
            account.lastResetDate = today
            account.quotaStoppedAt = ''
          }
          await openaiResponsesAccountService.checkAndClearRateLimit(account.id)
          let usageStats
          try {
            usageStats = await redis.getAccountUsageStats(account.id, 'openai-responses')
          } catch (error) {
            logger.debug(
              `Failed to get usage stats for OpenAI-Responses account ${account.id}:`,
              error
            )
            usageStats = {
              daily: { requests: 0, tokens: 0, allTokens: 0 },
              total: { requests: 0, tokens: 0, allTokens: 0 },
              monthly: { requests: 0, tokens: 0, allTokens: 0 }
            }
          }
          const allKeys = await redis.getAllApiKeys()
          let boundCount = 0
          for (const key of allKeys) {
            if (
              key.openaiAccountId === account.id ||
              key.openaiAccountId === `responses:${account.id}`
            ) {
              boundCount++
            }
          }
          if (boundCount > 0) {
            logger.info(`OpenAI-Responses account ${account.id} has ${boundCount} bound API keys`)
          }
          return {
            ...account,
            boundApiKeysCount: boundCount,
            usage: { daily: usageStats.daily, total: usageStats.total, monthly: usageStats.monthly }
          }
        } catch (error) {
          logger.error(`Failed to process OpenAI-Responses account ${account.id}:`, error)
          return {
            ...account,
            boundApiKeysCount: 0,
            usage: {
              daily: { requests: 0, tokens: 0, allTokens: 0 },
              total: { requests: 0, tokens: 0, allTokens: 0 },
              monthly: { requests: 0, tokens: 0, allTokens: 0 }
            }
          }
        }
      })
    )
    res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('Failed to get OpenAI-Responses accounts:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 创建 OpenAI-Responses 账户
router.post('/openai-responses-accounts', authenticateAdmin, async (req, res) => {
  try {
    const account = await openaiResponsesAccountService.createAccount(req.body)
    res.json({ success: true, account })
  } catch (error) {
    logger.error('Failed to create OpenAI-Responses account:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 更新 OpenAI-Responses 账户
router.put('/openai-responses-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    if (updates.priority !== undefined) {
      const priority = parseInt(updates.priority)
      if (isNaN(priority) || priority < 1 || priority > 100) {
        return res
          .status(400)
          .json({ success: false, message: 'Priority must be a number between 1 and 100' })
      }
      updates.priority = priority.toString()
    }
    const result = await openaiResponsesAccountService.updateAccount(id, updates)
    if (!result.success) {
      return res.status(400).json(result)
    }
    res.json({ success: true, ...result })
  } catch (error) {
    logger.error('Failed to update OpenAI-Responses account:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 删除 OpenAI-Responses 账户
router.delete('/openai-responses-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const account = await openaiResponsesAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' })
    }
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(id, 'openai-responses')
    const groups = await accountGroupService.getAllGroups()
    for (const group of groups) {
      if (group.platform === 'openai' && group.memberIds && group.memberIds.includes(id)) {
        await accountGroupService.removeMemberFromGroup(group.id, id)
        logger.info(`Removed OpenAI-Responses account ${id} from group ${group.id}`)
      }
    }
    const result = await openaiResponsesAccountService.deleteAccount(id)
    let message = 'OpenAI-Responses账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }
    logger.success(`🗑️ Admin deleted OpenAI-Responses account: ${id}, unbound ${unboundCount} keys`)
    res.json({ success: true, ...result, message, unboundKeys: unboundCount })
  } catch (error) {
    logger.error('Failed to delete OpenAI-Responses account:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 切换 OpenAI-Responses 账户调度状态
router.put(
  '/openai-responses-accounts/:id/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { id } = req.params
      const result = await openaiResponsesAccountService.toggleSchedulable(id)
      if (!result.success) {
        return res.status(400).json(result)
      }
      if (!result.schedulable) {
        await webhookNotifier.sendAccountEvent('account.status_changed', {
          accountId: id,
          platform: 'openai-responses',
          schedulable: result.schedulable,
          changedBy: 'admin',
          action: 'stopped_scheduling'
        })
      }
      res.json(result)
    } catch (error) {
      logger.error('Failed to toggle OpenAI-Responses account schedulable status:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  }
)

// 切换 OpenAI-Responses 账户激活状态
router.put('/openai-responses-accounts/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const account = await openaiResponsesAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' })
    }
    const newActiveStatus = account.isActive === 'true' ? 'false' : 'true'
    await openaiResponsesAccountService.updateAccount(id, { isActive: newActiveStatus })
    res.json({ success: true, isActive: newActiveStatus === 'true' })
  } catch (error) {
    logger.error('Failed to toggle OpenAI-Responses account status:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 重置 OpenAI-Responses 账户限流状态
router.post(
  '/openai-responses-accounts/:id/reset-rate-limit',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { id } = req.params
      await openaiResponsesAccountService.updateAccount(id, {
        rateLimitedAt: '',
        rateLimitStatus: '',
        status: 'active',
        errorMessage: ''
      })
      logger.info(`🔄 Admin manually reset rate limit for OpenAI-Responses account ${id}`)
      res.json({ success: true, message: 'Rate limit reset successfully' })
    } catch (error) {
      logger.error('Failed to reset OpenAI-Responses account rate limit:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  }
)

// 重置 OpenAI-Responses 账户状态
router.post('/openai-responses-accounts/:id/reset-status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const result = await openaiResponsesAccountService.resetAccountStatus(id)
    logger.success(`✅ Admin reset status for OpenAI-Responses account: ${id}`)
    return res.json({ success: true, data: result })
  } catch (error) {
    logger.error('❌ Failed to reset OpenAI-Responses account status:', error)
    return res.status(500).json({ error: 'Failed to reset status', message: error.message })
  }
})

// 手动重置 OpenAI-Responses 账户的每日使用量
router.post('/openai-responses-accounts/:id/reset-usage', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await openaiResponsesAccountService.updateAccount(id, {
      dailyUsage: '0',
      lastResetDate: redis.getDateStringInTimezone(),
      quotaStoppedAt: ''
    })
    logger.success(`✅ Admin manually reset daily usage for OpenAI-Responses account ${id}`)
    res.json({ success: true, message: 'Daily usage reset successfully' })
  } catch (error) {
    logger.error('Failed to reset OpenAI-Responses account usage:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

module.exports = router

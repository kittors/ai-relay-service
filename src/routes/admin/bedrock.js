const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const accountGroupService = require('../../services/accountGroupService')
const bedrockAccountService = require('../../services/bedrockAccountService')
const apiKeyService = require('../../services/apiKeyService')
const webhookNotifier = require('../../utils/webhookNotifier')

// 获取所有Bedrock账户
router.get('/bedrock-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    const result = await bedrockAccountService.getAllAccounts()
    if (!result.success) {
      return res
        .status(500)
        .json({ error: 'Failed to get Bedrock accounts', message: result.error })
    }
    let accounts = result.data
    if (platform && platform !== 'all' && platform !== 'bedrock') {
      accounts = []
    }
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await accountGroupService.getAccountGroups(account.id)
          if (!groups || groups.length === 0) {
            filteredAccounts.push(account)
          }
        }
        accounts = filteredAccounts
      } else {
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      }
    }
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'openai')
          const groupInfos = await accountGroupService.getAccountGroups(account.id)
          return {
            ...account,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (statsError) {
          logger.warn(
            `⚠️ Failed to get usage stats for Bedrock account ${account.id}:`,
            statsError.message
          )
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            return {
              ...account,
              groupInfos,
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          } catch (groupError) {
            logger.warn(
              `⚠️ Failed to get group info for account ${account.id}:`,
              groupError.message
            )
            return {
              ...account,
              groupInfos: [],
              usage: {
                daily: { tokens: 0, requests: 0, allTokens: 0 },
                total: { tokens: 0, requests: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          }
        }
      })
    )
    return res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('❌ Failed to get Bedrock accounts:', error)
    return res.status(500).json({ error: 'Failed to get Bedrock accounts', message: error.message })
  }
})

// 创建新的Bedrock账户
router.post('/bedrock-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      region,
      awsCredentials,
      defaultModel,
      priority,
      accountType,
      credentialType
    } = req.body
    if (!name) {
      return res.status(400).json({ error: 'Name is required' })
    }
    if (priority !== undefined && (priority < 1 || priority > 100)) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }
    if (accountType && !['shared', 'dedicated'].includes(accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared" or "dedicated"' })
    }
    if (credentialType && !['default', 'access_key', 'bearer_token'].includes(credentialType)) {
      return res.status(400).json({
        error: 'Invalid credential type. Must be "default", "access_key", or "bearer_token"'
      })
    }
    const result = await bedrockAccountService.createAccount({
      name,
      description: description || '',
      region: region || 'us-east-1',
      awsCredentials,
      defaultModel,
      priority: priority || 50,
      accountType: accountType || 'shared',
      credentialType: credentialType || 'default'
    })
    if (!result.success) {
      return res
        .status(500)
        .json({ error: 'Failed to create Bedrock account', message: result.error })
    }
    logger.success(`☁️ Admin created Bedrock account: ${name}`)
    return res.json({ success: true, data: result.data })
  } catch (error) {
    logger.error('❌ Failed to create Bedrock account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to create Bedrock account', message: error.message })
  }
})

// 更新Bedrock账户
router.put('/bedrock-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const updates = req.body
    if (updates.priority !== undefined && (updates.priority < 1 || updates.priority > 100)) {
      return res.status(400).json({ error: 'Priority must be between 1 and 100' })
    }
    if (updates.accountType && !['shared', 'dedicated'].includes(updates.accountType)) {
      return res
        .status(400)
        .json({ error: 'Invalid account type. Must be "shared" or "dedicated"' })
    }
    if (
      updates.credentialType &&
      !['default', 'access_key', 'bearer_token'].includes(updates.credentialType)
    ) {
      return res.status(400).json({
        error: 'Invalid credential type. Must be "default", "access_key", or "bearer_token"'
      })
    }
    const result = await bedrockAccountService.updateAccount(accountId, updates)
    if (!result.success) {
      return res
        .status(500)
        .json({ error: 'Failed to update Bedrock account', message: result.error })
    }
    logger.success(`📝 Admin updated Bedrock account: ${accountId}`)
    return res.json({ success: true, message: 'Bedrock account updated successfully' })
  } catch (error) {
    logger.error('❌ Failed to update Bedrock account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to update Bedrock account', message: error.message })
  }
})

// 删除Bedrock账户
router.delete('/bedrock-accounts/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(accountId, 'bedrock')
    const result = await bedrockAccountService.deleteAccount(accountId)
    if (!result.success) {
      return res
        .status(500)
        .json({ error: 'Failed to delete Bedrock account', message: result.error })
    }
    let message = 'Bedrock账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }
    logger.success(`🗑️ Admin deleted Bedrock account: ${accountId}, unbound ${unboundCount} keys`)
    return res.json({ success: true, message, unboundKeys: unboundCount })
  } catch (error) {
    logger.error('❌ Failed to delete Bedrock account:', error)
    return res
      .status(500)
      .json({ error: 'Failed to delete Bedrock account', message: error.message })
  }
})

// 切换Bedrock账户状态
router.put('/bedrock-accounts/:accountId/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const accountResult = await bedrockAccountService.getAccount(accountId)
    if (!accountResult.success) {
      return res.status(404).json({ error: 'Account not found' })
    }
    const newStatus = !accountResult.data.isActive
    const updateResult = await bedrockAccountService.updateAccount(accountId, {
      isActive: newStatus
    })
    if (!updateResult.success) {
      return res
        .status(500)
        .json({ error: 'Failed to toggle account status', message: updateResult.error })
    }
    logger.success(
      `🔄 Admin toggled Bedrock account status: ${accountId} -> ${newStatus ? 'active' : 'inactive'}`
    )
    return res.json({ success: true, isActive: newStatus })
  } catch (error) {
    logger.error('❌ Failed to toggle Bedrock account status:', error)
    return res
      .status(500)
      .json({ error: 'Failed to toggle account status', message: error.message })
  }
})

// 切换Bedrock账户调度状态
router.put(
  '/bedrock-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params
      const accountResult = await bedrockAccountService.getAccount(accountId)
      if (!accountResult.success) {
        return res.status(404).json({ error: 'Account not found' })
      }
      const newSchedulable = !accountResult.data.schedulable
      const updateResult = await bedrockAccountService.updateAccount(accountId, {
        schedulable: newSchedulable
      })
      if (!updateResult.success) {
        return res
          .status(500)
          .json({ error: 'Failed to toggle schedulable status', message: updateResult.error })
      }
      if (!newSchedulable) {
        await webhookNotifier.sendAccountAnomalyNotification({
          accountId: accountResult.data.id,
          accountName: accountResult.data.name || 'Bedrock Account',
          platform: 'bedrock',
          status: 'disabled',
          errorCode: 'BEDROCK_MANUALLY_DISABLED',
          reason: '账号已被管理员手动禁用调度',
          timestamp: new Date().toISOString()
        })
      }
      logger.success(
        `🔄 Admin toggled Bedrock account schedulable status: ${accountId} -> ${newSchedulable ? 'schedulable' : 'not schedulable'}`
      )
      return res.json({ success: true, schedulable: newSchedulable })
    } catch (error) {
      logger.error('❌ Failed to toggle Bedrock account schedulable status:', error)
      return res
        .status(500)
        .json({ error: 'Failed to toggle schedulable status', message: error.message })
    }
  }
)

// 测试Bedrock账户连接
router.post('/bedrock-accounts/:accountId/test', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    const result = await bedrockAccountService.testAccount(accountId)
    if (!result.success) {
      return res.status(500).json({ error: 'Account test failed', message: result.error })
    }
    logger.success(`🧪 Admin tested Bedrock account: ${accountId} - ${result.data.status}`)
    return res.json({ success: true, data: result.data })
  } catch (error) {
    logger.error('❌ Failed to test Bedrock account:', error)
    return res.status(500).json({ error: 'Failed to test Bedrock account', message: error.message })
  }
})

module.exports = router

const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const axios = require('axios')

const accountGroupService = require('../../services/accountGroupService')
const azureOpenaiAccountService = require('../../services/azureOpenaiAccountService')
const redis = require('../../models/redis')
const apiKeyService = require('../../services/apiKeyService')
const webhookNotifier = require('../../utils/webhookNotifier')

// 获取所有 Azure OpenAI 账户
router.get('/azure-openai-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await azureOpenaiAccountService.getAllAccounts()
    if (platform && platform !== 'all' && platform !== 'azure_openai') {
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
        } catch (error) {
          logger.debug(`Failed to get usage stats for Azure OpenAI account ${account.id}:`, error)
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            return {
              ...account,
              groupInfos,
              usage: {
                daily: { requests: 0, tokens: 0, allTokens: 0 },
                total: { requests: 0, tokens: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          } catch (groupError) {
            logger.debug(`Failed to get group info for account ${account.id}:`, groupError)
            return {
              ...account,
              groupInfos: [],
              usage: {
                daily: { requests: 0, tokens: 0, allTokens: 0 },
                total: { requests: 0, tokens: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          }
        }
      })
    )
    res.json({ success: true, data: accountsWithStats })
  } catch (error) {
    logger.error('Failed to fetch Azure OpenAI accounts:', error)
    res
      .status(500)
      .json({ success: false, message: 'Failed to fetch accounts', error: error.message })
  }
})

// 创建 Azure OpenAI 账户
router.post('/azure-openai-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      accountType,
      azureEndpoint,
      apiVersion,
      deploymentName,
      apiKey,
      supportedModels,
      proxy,
      groupId,
      groupIds,
      priority,
      isActive,
      schedulable
    } = req.body
    if (!name) {
      return res.status(400).json({ success: false, message: 'Account name is required' })
    }
    if (!azureEndpoint) {
      return res.status(400).json({ success: false, message: 'Azure endpoint is required' })
    }
    if (!apiKey) {
      return res.status(400).json({ success: false, message: 'API key is required' })
    }
    if (!deploymentName) {
      return res.status(400).json({ success: false, message: 'Deployment name is required' })
    }
    if (!azureEndpoint.match(/^https:\/\/[\w-]+\.openai\.azure\.com$/)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid Azure OpenAI endpoint format. Expected: https://your-resource.openai.azure.com'
      })
    }
    try {
      const testUrl = `${azureEndpoint}/openai/deployments/${deploymentName}?api-version=${apiVersion || '2024-02-01'}`
      await axios.get(testUrl, { headers: { 'api-key': apiKey }, timeout: 5000 })
    } catch (testError) {
      if (testError.response?.status === 404) {
        logger.warn('Azure OpenAI deployment not found, but continuing with account creation')
      } else if (testError.response?.status === 401) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid API key or unauthorized access' })
      }
    }
    const account = await azureOpenaiAccountService.createAccount({
      name,
      description,
      accountType: accountType || 'shared',
      azureEndpoint,
      apiVersion: apiVersion || '2024-02-01',
      deploymentName,
      apiKey,
      supportedModels,
      proxy,
      groupId,
      priority: priority || 50,
      isActive: isActive !== false,
      schedulable: schedulable !== false
    })
    if (accountType === 'group') {
      if (groupIds && groupIds.length > 0) {
        await accountGroupService.setAccountGroups(account.id, groupIds, 'azure_openai')
      } else if (groupId) {
        await accountGroupService.addAccountToGroup(account.id, groupId, 'azure_openai')
      }
    }
    res.json({ success: true, data: account, message: 'Azure OpenAI account created successfully' })
  } catch (error) {
    logger.error('Failed to create Azure OpenAI account:', error)
    res
      .status(500)
      .json({ success: false, message: 'Failed to create account', error: error.message })
  }
})

// 更新 Azure OpenAI 账户
router.put('/azure-openai-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    const account = await azureOpenaiAccountService.updateAccount(id, updates)
    res.json({ success: true, data: account, message: 'Azure OpenAI account updated successfully' })
  } catch (error) {
    logger.error('Failed to update Azure OpenAI account:', error)
    res
      .status(500)
      .json({ success: false, message: 'Failed to update account', error: error.message })
  }
})

// 删除 Azure OpenAI 账户
router.delete('/azure-openai-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const unboundCount = await apiKeyService.unbindAccountFromAllKeys(id, 'azure_openai')
    await azureOpenaiAccountService.deleteAccount(id)
    let message = 'Azure OpenAI账号已成功删除'
    if (unboundCount > 0) {
      message += `，${unboundCount} 个 API Key 已切换为共享池模式`
    }
    logger.success(`🗑️ Admin deleted Azure OpenAI account: ${id}, unbound ${unboundCount} keys`)
    res.json({ success: true, message, unboundKeys: unboundCount })
  } catch (error) {
    logger.error('Failed to delete Azure OpenAI account:', error)
    res
      .status(500)
      .json({ success: false, message: 'Failed to delete account', error: error.message })
  }
})

// 切换 Azure OpenAI 账户状态
router.put('/azure-openai-accounts/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const account = await azureOpenaiAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' })
    }
    const newStatus = account.isActive === 'true' ? 'false' : 'true'
    await azureOpenaiAccountService.updateAccount(id, { isActive: newStatus })
    res.json({
      success: true,
      message: `Account ${newStatus === 'true' ? 'activated' : 'deactivated'} successfully`,
      isActive: newStatus === 'true'
    })
  } catch (error) {
    logger.error('Failed to toggle Azure OpenAI account status:', error)
    res
      .status(500)
      .json({ success: false, message: 'Failed to toggle account status', error: error.message })
  }
})

// 切换 Azure OpenAI 账户调度状态
router.put(
  '/azure-openai-accounts/:accountId/toggle-schedulable',
  authenticateAdmin,
  async (req, res) => {
    try {
      const { accountId } = req.params
      const result = await azureOpenaiAccountService.toggleSchedulable(accountId)
      if (!result.schedulable) {
        const account = await azureOpenaiAccountService.getAccount(accountId)
        if (account) {
          await webhookNotifier.sendAccountAnomalyNotification({
            accountId: account.id,
            accountName: account.name || 'Azure OpenAI Account',
            platform: 'azure-openai',
            status: 'disabled',
            errorCode: 'AZURE_OPENAI_MANUALLY_DISABLED',
            reason: '账号已被管理员手动禁用调度',
            timestamp: new Date().toISOString()
          })
        }
      }
      return res.json({
        success: true,
        schedulable: result.schedulable,
        message: result.schedulable ? '已启用调度' : '已禁用调度'
      })
    } catch (error) {
      logger.error('切换 Azure OpenAI 账户调度状态失败:', error)
      return res
        .status(500)
        .json({ success: false, message: '切换调度状态失败', error: error.message })
    }
  }
)

// 健康检查单个 Azure OpenAI 账户
router.post('/azure-openai-accounts/:id/health-check', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const healthResult = await azureOpenaiAccountService.healthCheckAccount(id)
    res.json({ success: true, data: healthResult })
  } catch (error) {
    logger.error('Failed to perform health check:', error)
    res
      .status(500)
      .json({ success: false, message: 'Failed to perform health check', error: error.message })
  }
})

// 批量健康检查所有 Azure OpenAI 账户
router.post('/azure-openai-accounts/health-check-all', authenticateAdmin, async (req, res) => {
  try {
    const healthResults = await azureOpenaiAccountService.performHealthChecks()
    res.json({ success: true, data: healthResults })
  } catch (error) {
    logger.error('Failed to perform batch health check:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to perform batch health check',
      error: error.message
    })
  }
})

// 迁移 API Keys 以支持 Azure OpenAI
router.post('/migrate-api-keys-azure', authenticateAdmin, async (req, res) => {
  try {
    const migratedCount = await azureOpenaiAccountService.migrateApiKeysForAzureSupport()
    res.json({
      success: true,
      message: `Successfully migrated ${migratedCount} API keys for Azure OpenAI support`
    })
  } catch (error) {
    logger.error('Failed to migrate API keys:', error)
    res
      .status(500)
      .json({ success: false, message: 'Failed to migrate API keys', error: error.message })
  }
})

module.exports = router

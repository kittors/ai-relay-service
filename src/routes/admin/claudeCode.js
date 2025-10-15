const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')
const claudeCodeHeadersService = require('../../services/claudeCodeHeadersService')

// 📋 获取所有账号的 Claude Code headers 信息
router.get('/claude-code-headers', authenticateAdmin, async (req, res) => {
  try {
    const allHeaders = await claudeCodeHeadersService.getAllAccountHeaders()
    const claudeAccountService = require('../../services/claudeAccountService')
    const accounts = await claudeAccountService.getAllAccounts()
    const accountMap = {}
    accounts.forEach((account) => {
      accountMap[account.id] = account.name
    })
    const formattedData = Object.entries(allHeaders).map(([accountId, data]) => ({
      accountId,
      accountName: accountMap[accountId] || 'Unknown',
      version: data.version,
      userAgent: data.headers['user-agent'],
      updatedAt: data.updatedAt,
      headers: data.headers
    }))
    return res.json({ success: true, data: formattedData })
  } catch (error) {
    logger.error('❌ Failed to get Claude Code headers:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get Claude Code headers', message: error.message })
  }
})

// 🗑️ 清除指定账号的 Claude Code headers
router.delete('/claude-code-headers/:accountId', authenticateAdmin, async (req, res) => {
  try {
    const { accountId } = req.params
    await claudeCodeHeadersService.clearAccountHeaders(accountId)
    return res.json({
      success: true,
      message: `Claude Code headers cleared for account ${accountId}`
    })
  } catch (error) {
    logger.error('❌ Failed to clear Claude Code headers:', error)
    return res
      .status(500)
      .json({ error: 'Failed to clear Claude Code headers', message: error.message })
  }
})

// 📋 获取统一Claude Code User-Agent信息
router.get('/claude-code-version', authenticateAdmin, async (req, res) => {
  try {
    const CACHE_KEY = 'claude_code_user_agent:daily'
    const unifiedUserAgent = await redis.client.get(CACHE_KEY)
    const ttl = unifiedUserAgent ? await redis.client.ttl(CACHE_KEY) : 0
    res.json({
      success: true,
      userAgent: unifiedUserAgent,
      isActive: !!unifiedUserAgent,
      ttlSeconds: ttl,
      lastUpdated: unifiedUserAgent ? new Date().toISOString() : null
    })
  } catch (error) {
    logger.error('❌ Get unified Claude Code User-Agent error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get User-Agent information',
      error: error.message
    })
  }
})

// 🗑️ 清除统一Claude Code User-Agent缓存
router.post('/claude-code-version/clear', authenticateAdmin, async (req, res) => {
  try {
    const CACHE_KEY = 'claude_code_user_agent:daily'
    await redis.client.del(CACHE_KEY)
    logger.info('🗑️ Admin manually cleared unified Claude Code User-Agent cache')
    res.json({ success: true, message: 'Unified User-Agent cache cleared successfully' })
  } catch (error) {
    logger.error('❌ Clear unified User-Agent cache error:', error)
    res.status(500).json({ success: false, message: 'Failed to clear cache', error: error.message })
  }
})

module.exports = router

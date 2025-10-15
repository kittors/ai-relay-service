const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const redis = require('../../models/redis')

const apiKeyService = require('../../services/apiKeyService')
const claudeAccountService = require('../../services/claudeAccountService')

// 清理过期数据
router.post('/cleanup', authenticateAdmin, async (req, res) => {
  try {
    const [expiredKeys, errorAccounts] = await Promise.all([
      apiKeyService.cleanupExpiredKeys(),
      claudeAccountService.cleanupErrorAccounts()
    ])
    await redis.cleanup()
    logger.success(
      `🧹 Admin triggered cleanup: ${expiredKeys} expired keys, ${errorAccounts} error accounts`
    )
    return res.json({
      success: true,
      message: 'Cleanup completed',
      data: { expiredKeysRemoved: expiredKeys, errorAccountsReset: errorAccounts }
    })
  } catch (error) {
    logger.error('❌ Cleanup failed:', error)
    return res.status(500).json({ error: 'Cleanup failed', message: error.message })
  }
})

module.exports = router

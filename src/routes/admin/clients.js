const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')

// 获取支持的客户端列表（使用新的验证器）
router.get('/supported-clients', authenticateAdmin, async (req, res) => {
  try {
    const ClientValidator = require('../../validators/clientValidator')
    const availableClients = ClientValidator.getAvailableClients()
    const clients = availableClients.map((client) => ({
      id: client.id,
      name: client.name,
      description: client.description,
      icon: client.icon
    }))
    logger.info(`📱 Returning ${clients.length} supported clients`)
    return res.json({ success: true, data: clients })
  } catch (error) {
    logger.error('❌ Failed to get supported clients:', error)
    return res
      .status(500)
      .json({ error: 'Failed to get supported clients', message: error.message })
  }
})

module.exports = router

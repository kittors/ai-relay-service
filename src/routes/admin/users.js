const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')

// services are required lazily in handler to avoid circulars on startup

// 👥 用户管理 - 获取所有用户列表（用于API Key分配）
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const userService = require('../../services/userService')

    const { role, isActive } = req.query
    const options = { limit: 1000 }

    if (role) {
      options.role = role
    }
    if (isActive !== undefined) {
      options.isActive = isActive === 'true'
    } else {
      options.isActive = true
    }

    const result = await userService.getAllUsers(options)
    const allUsers = result.users || []

    const activeUsers = allUsers.map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      email: user.email,
      role: user.role
    }))

    const usersWithAdmin = [
      { id: 'admin', username: 'admin', displayName: 'Admin', email: '', role: 'admin' },
      ...activeUsers
    ]

    return res.json({ success: true, data: usersWithAdmin })
  } catch (error) {
    logger.error('❌ Failed to get users list:', error)
    return res.status(500).json({ error: 'Failed to get users list', message: error.message })
  }
})

module.exports = router

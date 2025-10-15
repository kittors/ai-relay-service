const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')

const accountGroupService = require('../../services/accountGroupService')
const claudeAccountService = require('../../services/claudeAccountService')
const claudeConsoleAccountService = require('../../services/claudeConsoleAccountService')
const geminiAccountService = require('../../services/geminiAccountService')
const openaiAccountService = require('../../services/openaiAccountService')

// 👥 账户分组管理

router.post('/account-groups', authenticateAdmin, async (req, res) => {
  try {
    const { name, platform, description } = req.body
    const group = await accountGroupService.createGroup({ name, platform, description })
    return res.json({ success: true, data: group })
  } catch (error) {
    logger.error('❌ Failed to create account group:', error)
    return res.status(400).json({ error: error.message })
  }
})

router.get('/account-groups', authenticateAdmin, async (req, res) => {
  try {
    const { platform } = req.query
    const groups = await accountGroupService.getAllGroups(platform)
    return res.json({ success: true, data: groups })
  } catch (error) {
    logger.error('❌ Failed to get account groups:', error)
    return res.status(500).json({ error: error.message })
  }
})

router.get('/account-groups/:groupId', authenticateAdmin, async (req, res) => {
  try {
    const { groupId } = req.params
    const group = await accountGroupService.getGroup(groupId)
    if (!group) {
      return res.status(404).json({ error: '分组不存在' })
    }
    return res.json({ success: true, data: group })
  } catch (error) {
    logger.error('❌ Failed to get account group:', error)
    return res.status(500).json({ error: error.message })
  }
})

router.put('/account-groups/:groupId', authenticateAdmin, async (req, res) => {
  try {
    const { groupId } = req.params
    const updates = req.body
    const updatedGroup = await accountGroupService.updateGroup(groupId, updates)
    return res.json({ success: true, data: updatedGroup })
  } catch (error) {
    logger.error('❌ Failed to update account group:', error)
    return res.status(400).json({ error: error.message })
  }
})

router.delete('/account-groups/:groupId', authenticateAdmin, async (req, res) => {
  try {
    const { groupId } = req.params
    await accountGroupService.deleteGroup(groupId)
    return res.json({ success: true, message: '分组删除成功' })
  } catch (error) {
    logger.error('❌ Failed to delete account group:', error)
    return res.status(400).json({ error: error.message })
  }
})

router.get('/account-groups/:groupId/members', authenticateAdmin, async (req, res) => {
  try {
    const { groupId } = req.params
    const memberIds = await accountGroupService.getGroupMembers(groupId)
    const members = []
    for (const memberId of memberIds) {
      let account = null
      account = await claudeAccountService.getAccount(memberId)
      if (!account) {
        account = await claudeConsoleAccountService.getAccount(memberId)
      }
      if (!account) {
        account = await geminiAccountService.getAccount(memberId)
      }
      if (!account) {
        account = await openaiAccountService.getAccount(memberId)
      }
      if (account) {
        members.push(account)
      }
    }
    return res.json({ success: true, data: members })
  } catch (error) {
    logger.error('❌ Failed to get group members:', error)
    return res.status(500).json({ error: error.message })
  }
})

module.exports = router

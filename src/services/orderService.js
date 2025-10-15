const redis = require('../models/redis')

const ORDER_PREFIX = 'order:'

function _key(id) {
  return `${ORDER_PREFIX}${id}`
}

async function createOrder(order) {
  const client = redis.getClient()
  const { id } = order
  const now = new Date().toISOString()
  const data = {
    id,
    planId: order.planId,
    price: String(order.price || ''),
    title: order.title || '',
    status: order.status || 'INIT',
    openOrderId: order.openOrderId || '',
    apiKeyId: order.apiKeyId || '',
    apiKeyPlain: order.apiKeyPlain || '',
    email: order.email || '',
    createdAt: now,
    updatedAt: now
  }
  await client.hset(_key(id), data)
  // 默认保存7天
  await client.expire(_key(id), 7 * 24 * 3600)
  return data
}

async function updateOrder(id, updates) {
  const client = redis.getClient()
  const existing = await client.hgetall(_key(id))
  if (!existing || Object.keys(existing).length === 0) {
    return null
  }
  const data = { ...existing, ...updates, updatedAt: new Date().toISOString() }
  await client.hset(_key(id), data)
  return data
}

async function getOrder(id) {
  const client = redis.getClient()
  const data = await client.hgetall(_key(id))
  if (!data || Object.keys(data).length === 0) {
    return null
  }
  return data
}

async function findOrdersByEmail(email) {
  const client = redis.getClient()
  const keys = await client.keys(`${ORDER_PREFIX}*`)
  if (!keys || keys.length === 0) {
    return []
  }
  const pipeline = client.pipeline()
  keys.forEach((k) => pipeline.hgetall(k))
  const results = await pipeline.exec()
  const target = String(email || '')
    .trim()
    .toLowerCase()
  const list = []
  for (const [, data] of results) {
    if (!data || Object.keys(data).length === 0) {
      continue
    }
    if ((data.email || '').toLowerCase() === target) {
      list.push(data)
    }
  }
  list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  return list
}

module.exports = {
  createOrder,
  updateOrder,
  getOrder,
  findOrdersByEmail
}

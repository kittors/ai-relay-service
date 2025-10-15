const axios = require('axios')
// const crypto = require('crypto')
const config = require('../../config/config')
const logger = require('../utils/logger')
const xhSdk = require('../../sdk/jsSDK')

function sortAndSerialize(data) {
  const entries = Object.entries(data)
    .filter(([k, v]) => k !== 'hash' && v !== undefined && v !== null && String(v) !== '')
    .sort(([a], [b]) => (a > b ? 1 : a < b ? -1 : 0))
  return entries.map(([k, v]) => `${k}=${String(v).replace(/\\/g, '')}`).join('&')
}

function sanitizeTitle(input) {
  if (!input) {
    return ''
  }
  let t = String(input)
  // 移除非BMP字符（表情等）
  t = t.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
  // 替换 % 为全角，避免网关拒绝
  t = t.replace(/%/g, '％')
  // 限长 127
  if (t.length > 127) {
    t = t.slice(0, 127)
  }
  return t
}

function generateHash(payload, appSecret) {
  const hash = xhSdk.getHash(payload, appSecret)
  if (config.development?.debug) {
    try {
      const base = sortAndSerialize(payload)
      const safePreview = base.replace(/(appid=)([^&]+)/, '$1****')
      logger.debug(`[Xunhu] canonical="${safePreview}" md5="${hash}"`)
    } catch (e) {
      // ignore
    }
  }
  return hash
}

function getConfig() {
  const raw = config.payment?.xunhu || {}
  const appId = String(raw.appId || '').trim()
  const appSecret = String(raw.appSecret || '').trim()
  if (!appId || !appSecret) {
    throw new Error('XunhuPay not configured')
  }
  return { ...raw, appId, appSecret }
}

async function queryOrder({ out_trade_order, open_order_id }) {
  const xh = getConfig()
  const payload = xhSdk.buildQueryParams(
    {
      appid: xh.appId,
      out_trade_order: out_trade_order || '',
      open_order_id: open_order_id || ''
    },
    xh.appSecret
  )

  const urls = [xh.queryUrl, xh.backupQueryUrl].filter(Boolean)
  let lastErr = null
  for (const url of urls) {
    try {
      const resp = await axios.post(url, new URLSearchParams(payload), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      })
      return resp.data
    } catch (e) {
      lastErr = e
      logger.warn(`⚠️ Xunhu query failed at ${url}: ${e.message}`)
    }
  }
  throw lastErr || new Error('Query failed')
}

function buildCreatePayload({
  out_trade_order,
  total_fee,
  title,
  notify_url,
  return_url,
  plugin,
  attach
}) {
  const xh = getConfig()
  const safeTitle = sanitizeTitle(title)
  // 计算默认 wap_url（当需要 WAP 时）
  let derivedWapUrl = ''
  try {
    if (notify_url) {
      const u = new URL(notify_url)
      derivedWapUrl = u.origin
    }
  } catch (e) {
    // ignore
  }
  return xhSdk.buildPayParams(
    {
      version: xh.version || '1.1',
      appid: xh.appId,
      trade_order_id: out_trade_order,
      total_fee,
      title: safeTitle,
      notify_url,
      return_url,
      callback_url: return_url,
      plugins: plugin || xh.plugin || '',
      type: xh.type || '',
      wap_url: xh.wapUrl || derivedWapUrl || '',
      wap_name: xh.wapName || '',
      attach: attach ? String(attach).slice(0, 256) : ''
    },
    xh.appSecret
  )
}

module.exports = {
  generateHash,
  buildCreatePayload,
  queryOrder
}

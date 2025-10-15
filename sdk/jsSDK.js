const axios = require('axios')
const md5 = require('md5')

// 严格遵循虎皮椒签名规范：
// 1) 过滤空值与 hash
// 2) 参数名 ASCII 升序
// 3) 使用 key=value& 拼接
// 4) 最后拼接 appSecret，再做 MD5(32位小写)
function getHash(params, appSecret) {
  const sortedParams = Object.keys(params)
    .filter(
      (key) =>
        params[key] !== undefined && params[key] !== null && params[key] !== '' && key !== 'hash'
    )
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  return md5(sortedParams + appSecret)
}

function nowTs() {
  return Math.floor(Date.now() / 1000)
}

function nonceStr() {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
}

function sanitizeTitle(input) {
  if (!input) return ''
  let t = String(input)
  // 移除表情字符
  t = t.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
  // 替换 % 为全角
  t = t.replace(/%/g, '％')
  if (t.length > 127) t = t.slice(0, 127)
  return t
}

// 构建支付参数（do.html）并计算 hash
function buildPayParams(opts, appSecret) {
  const p = {
    version: opts.version || '1.1',
    appid: opts.appid,
    trade_order_id: opts.trade_order_id,
    total_fee: opts.total_fee,
    title: sanitizeTitle(opts.title),
    time: opts.time || nowTs(),
    notify_url: opts.notify_url,
    return_url: opts.return_url || '',
    callback_url: opts.callback_url || opts.return_url || '',
    nonce_str: opts.nonce_str || nonceStr(),
    plugins: opts.plugins || '',
    type: opts.type || '',
    wap_url: opts.wap_url || '',
    wap_name: opts.wap_name || '',
    attach: opts.attach || ''
  }
  p.hash = getHash(p, appSecret)
  return p
}

// 构建查询参数（query.html）并计算 hash
function buildQueryParams(opts, appSecret) {
  const p = {
    appid: opts.appid,
    time: opts.time || nowTs(),
    nonce_str: opts.nonce_str || nonceStr(),
    out_trade_order: opts.out_trade_order || '',
    open_order_id: opts.open_order_id || ''
  }
  p.hash = getHash(p, appSecret)
  return p
}

function verifyWebhook(formData, appSecret) {
  return String(formData?.hash || '').toLowerCase() === getHash(formData || {}, appSecret)
}

module.exports = {
  axios,
  getHash,
  buildPayParams,
  buildQueryParams,
  verifyWebhook
}

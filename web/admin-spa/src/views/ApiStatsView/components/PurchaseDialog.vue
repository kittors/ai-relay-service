<template>
  <el-dialog
    v-model="visible"
    title="订购套餐"
    :width="isMobile ? '100%' : '520px'"
    :fullscreen="isMobile"
    align-center
    append-to-body
    :class="['purchase-dialog', { mobile: isMobile }]"
    @closed="$emit('close')"
  >
    <div v-if="!orderCreated">
      <div class="mb-3 text-sm text-gray-600">您选择的套餐：<b>{{ plan?.name || plan?.id }}</b></div>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="联系邮箱" prop="email" required>
          <el-input v-model="form.email" placeholder="请输入常用邮箱（用于查找与接收密钥）" />
        </el-form-item>
      </el-form>
      <div :class="['dialog-actions', { mobile: isMobile }]">
        <el-button class="action-btn" @click="cancel">取消</el-button>
        <el-button class="action-btn" type="primary" :loading="submitting" @click="createOrder">下一步</el-button>
      </div>
    </div>

    <div v-else>
      <div class="mb-1 text-sm text-gray-600">请使用微信扫描二维码完成支付</div>
      <div v-if="amount" class="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
        支付金额：<span class="text-green-600 dark:text-green-400">¥{{ amount }}</span>
      </div>
      <div class="flex items-center justify-center py-3">
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="支付二维码" class="qr-img" />
      </div>
      <!-- 隐藏原始支付链接，避免干扰用户扫码体验 -->
      <div :class="['dialog-actions', { mobile: isMobile }]">
        <el-button class="action-btn" @click="cancel">关闭</el-button>
        <el-button class="action-btn" type="success" :loading="polling" @click="manualCheck">我已完成支付</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { apiStatsClient } from '@/config/apiStats'
import { toDataURL } from 'qrcode'

const props = defineProps({
  show: { type: Boolean, default: false },
  plan: { type: Object, default: null }
})
const emit = defineEmits(['close', 'issued'])

const visible = ref(false)
watch(
  () => props.show,
  (v) => (visible.value = v),
  { immediate: true }
)
watch(
  () => visible.value,
  (v) => {
    if (!v) emit('close')
  }
)

const formRef = ref()
const form = ref({ email: '' })
const rules = {
  email: [
    {
      validator: (_rule, value, callback) => {
        if (!value || typeof value !== 'string') {
          return callback(new Error('请输入邮箱'))
        }
        const v = value.trim()
        if (v.length < 5 || v.length > 128) {
          return callback(new Error('邮箱长度需在 5-128 之间'))
        }
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!re.test(v)) {
          return callback(new Error('请输入有效的邮箱地址'))
        }
        callback()
      },
      trigger: ['blur', 'change']
    }
  ]
}
const submitting = ref(false)
const orderCreated = ref(false)
const orderId = ref('')
const payUrl = ref('')
const qrDataUrl = ref('')
const amount = ref('')
const polling = ref(false)
let timer = null

// 响应式：移动端全屏弹窗
const isMobile = ref(false)
const updateIsMobile = () => {
  try {
    isMobile.value = window.matchMedia('(max-width: 640px)').matches
  } catch (e) {
    isMobile.value = false
  }
}
onMounted(() => {
  updateIsMobile()
  window.addEventListener('resize', updateIsMobile)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateIsMobile)
})

async function createOrder() {
  try {
    const ok = await (formRef.value?.validate?.() || Promise.resolve(false))
    if (!ok) return
    submitting.value = true
    const resp = await apiStatsClient.request('/admin/xunhu/create', {
      method: 'POST',
      body: JSON.stringify({ planId: props.plan?.id || props.plan, email: form.value.email })
    })
    if (resp?.success && resp.data?.payUrl && resp.data?.orderId) {
      orderId.value = resp.data.orderId
      payUrl.value = resp.data.payUrl
      amount.value = String(resp.data.price || '').trim()
      orderCreated.value = true
      try {
        if (resp.data.qrUrl) {
          // 直接使用网关返回的二维码图片地址
          qrDataUrl.value = resp.data.qrUrl
        } else {
          qrDataUrl.value = await toDataURL(resp.data.payUrl)
        }
      } catch (e) {
        qrDataUrl.value = ''
      }
      startPolling()
    }
  } finally {
    submitting.value = false
  }
}

function startPolling() {
  stopPolling()
  polling.value = true
  let cnt = 0
  const run = async () => {
    cnt++
    try {
      // 每3次轮询主动对账一次（防止回调未达）
      if (cnt % 3 === 1 && orderId.value) {
        try {
          await apiStatsClient.queryXunhu({ out_trade_order: orderId.value })
        } catch (e) {
          // ignore
        }
      }
      const orderResp = await apiStatsClient.getOrder(orderId.value)
      const order = orderResp?.data
      if (order && order.status === 'OD') {
        if (order.apiKeyPlain) {
          // 支付成功且已出卡：关闭当前弹窗，通知父组件弹出Key弹窗
          emit('issued', order.apiKeyPlain)
          stopPolling()
          // 关闭自身
          cancel()
          return
        }
      }
    } catch (e) {
      // ignore
    }
    if (cnt < 100) {
      timer = setTimeout(run, 3000)
    } else {
      polling.value = false
    }
  }
  run()
}

function stopPolling() {
  polling.value = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

async function manualCheck() {
  if (!orderId.value) return
  try {
    await apiStatsClient.queryXunhu({ out_trade_order: orderId.value })
  } catch (e) {
    // ignore
  }
}

function cancel() {
  stopPolling()
  visible.value = false
}
</script>

<style scoped>
.purchase-dialog.mobile :deep(.el-dialog__header) {
  padding: 12px;
}
.purchase-dialog.mobile :deep(.el-dialog__body) {
  padding: 12px;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.dialog-actions.mobile {
  flex-direction: column;
}
.dialog-actions .action-btn {
  min-width: 120px;
}
.dialog-actions.mobile .action-btn {
  width: 100%;
}
.qr-img {
  width: 12rem;
  height: 12rem;
}
@media (max-width: 640px) {
  .qr-img {
    width: 15rem;
    height: 15rem;
  }
}
</style>

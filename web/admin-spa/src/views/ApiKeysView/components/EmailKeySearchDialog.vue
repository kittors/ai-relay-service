<template>
  <el-dialog v-model="visible" title="按邮箱查询 API Key" width="700px" append-to-body @closed="$emit('close')">
    <div class="space-y-3">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="请输入订购者邮箱" clearable />
        </el-form-item>
      </el-form>
      <div class="text-right">
        <el-button @click="close">取消</el-button>
        <el-button type="primary" :loading="loading" @click="search">查询</el-button>
      </div>

      <el-empty v-if="!loading && results.length === 0 && searched" description="未找到相关记录" />

      <el-table v-if="results.length" :data="results" border height="400px">
        <el-table-column label="订单" min-width="180">
          <template #default="{ row }">
            <div class="text-xs text-gray-500">{{ row.order.id }}</div>
            <div class="text-xs text-gray-400">{{ formatTime(row.order.updatedAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.order.status === 'OD' ? 'success' : 'info'">
              {{ row.order.status || 'INIT' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="套餐" width="120" prop="order.planId" />
        <el-table-column label="API Key" min-width="260">
          <template #default="{ row }">
            <div v-if="row.order.apiKeyPlain" class="flex items-center gap-2">
              <code class="flex-1 truncate rounded bg-gray-50 p-1.5 text-xs font-mono dark:bg-gray-900">{{ row.order.apiKeyPlain }}</code>
              <el-button size="small" @click="copy(row.order.apiKeyPlain)">复制</el-button>
              <el-tag v-if="row.apiKey && row.apiKey.isDeleted" type="danger" effect="plain">已删除</el-tag>
            </div>
            <div v-else class="flex items-center gap-2 text-xs text-gray-400">
              <span>未出卡或已过期</span>
              <el-tag v-if="row.apiKey && row.apiKey.isDeleted" type="danger" effect="plain">已删除</el-tag>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'

const props = defineProps({ show: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

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
      validator: (_r, v, cb) => {
        const s = String(v || '').trim()
        if (!s) return cb(new Error('请输入邮箱'))
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!re.test(s)) return cb(new Error('请输入有效邮箱'))
        cb()
      },
      trigger: ['blur', 'change']
    }
  ]
}

const results = ref([])
const loading = ref(false)
const searched = ref(false)

function formatTime(t) {
  if (!t) return ''
  try {
    return new Date(t).toLocaleString('zh-CN')
  } catch (e) {
    return t
  }
}

async function search() {
  try {
    const ok = await formRef.value?.validate?.()
    if (!ok) return
    loading.value = true
    results.value = []
    const resp = await apiClient.get('/admin/orders/search', { params: { email: form.value.email.trim() } })
    if (resp?.success) {
      results.value = Array.isArray(resp.data) ? resp.data : []
      searched.value = true
    } else {
      showToast(resp?.message || '查询失败', 'error')
    }
  } catch (e) {
    showToast(e.message || '查询失败', 'error')
  } finally {
    loading.value = false
  }
}

function close() {
  visible.value = false
}

function copy(text) {
  try {
    navigator.clipboard.writeText(text)
    showToast('已复制到剪贴板', 'success')
  } catch (e) {
    showToast('复制失败，请手动复制', 'error')
  }
}
</script>

<style scoped></style>

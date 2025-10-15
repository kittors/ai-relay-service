<template>
  <el-dialog v-model="innerShow" title="创建结果" width="900px" append-to-body @closed="$emit('close')">
    <el-scrollbar class="dialog-scroll" height="60vh">
      <div class="mb-3 text-sm text-gray-600">成功创建 {{ items.length }} 个 API Key</div>
      <el-table :data="items" border style="width: 100%">
        <el-table-column label="API Key名称" min-width="160" prop="name" />
        <el-table-column label="使用的分组" min-width="160">
          <template #default="{ row }">{{ resolveGroupName(row) }}</template>
        </el-table-column>
        <el-table-column label="API KEY" min-width="240" prop="apiKey" />
        <el-table-column label="速率" width="160">
          <template #default="{ row }">{{ formatRate(row) }}</template>
        </el-table-column>
        <el-table-column label="每日请求上限" width="160">
          <template #default="{ row }">{{ Number(row.dailyRequestsLimit || 0) || '不限' }}</template>
        </el-table-column>
        <el-table-column label="过期周期/时间" min-width="200">
          <template #default="{ row }">{{ formatExpiry(row) }}</template>
        </el-table-column>
      </el-table>
    </el-scrollbar>
    <template #footer>
      <el-button @click="innerShow = false">关闭</el-button>
      <el-button type="primary" @click="exportResult">导出表格</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import * as XLSX from 'xlsx-js-style'

const props = defineProps({
  show: { type: Boolean, default: false },
  items: { type: Array, default: () => [] },
  accounts: { type: Object, required: true }
})
const emit = defineEmits(['close'])

const innerShow = ref(false)
watch(
  () => props.show,
  (v) => (innerShow.value = v),
  { immediate: true }
)
watch(
  () => innerShow.value,
  (v) => { if (!v) emit('close') }
)

function resolveGroupName(row) {
  const id = row.openaiAccountId?.startsWith('group:') ? row.openaiAccountId.slice(6) : ''
  if (!id) return '共享池'
  const g = (props.accounts.openaiGroups || []).find((x) => x.id === id)
  return g ? g.name : `分组:${id.slice(0, 8)}`
}
function formatRate(row) {
  const r = Number(row.rateLimitRequests || 0)
  const w = Number(row.rateLimitWindow || 0)
  if (r > 0 && w > 0) return `${r}次/${w}min`
  return '不限'
}
function formatExpiry(row) {
  if (row.expirationMode === 'activation') {
    const n = Number(row.activationDays || 0)
    const unit = row.activationUnit || 'days'
    if (unit === 'months') return `${n}个月（首次使用后）`
    if (unit === 'hours') return `${n}小时（首次使用后）`
    return `${n}天（首次使用后）`
  }
  return row.expiresAt ? new Date(row.expiresAt).toLocaleString('zh-CN') : '未设置'
}

function exportResult() {
  try {
    const rows = (props.items || []).map((k) => ({
      'API Key名称': k.name || '',
      使用的分组: resolveGroupName(k),
      APIKEY: k.apiKey || '',
      速率: formatRate(k),
      每日请求上限: Number(k.dailyRequestsLimit || 0) || '不限',
      过期: formatExpiry(k)
    }))
    const sheet = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, '创建结果')
    XLSX.writeFile(wb, 'api-keys-模板创建结果.xlsx')
  } catch (e) {
    // no-op
  }
}
</script>

<style scoped>
.dialog-scroll { padding-right: 4px; }
</style>


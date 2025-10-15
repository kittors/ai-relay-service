<template>
  <div class="space-y-3">
    <div v-for="row in data" :key="row.id" class="rounded-lg border border-gray-200 p-3 dark:border-gray-600">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-gray-900 dark:text-gray-100">{{ row.name || row.email || row.accountName || row.id }}</span>
            <el-tag v-if="row.accountType === 'dedicated'" size="small" effect="plain">专属</el-tag>
            <el-tag v-else-if="row.accountType === 'group'" size="small" effect="plain" type="primary">分组</el-tag>
          </div>
          <div v-if="row.groupInfos && row.groupInfos.length" class="mt-1 flex flex-wrap gap-2">
            <el-tag v-for="g in row.groupInfos" :key="g.id" size="small" effect="plain">{{ g.name }}</el-tag>
          </div>
          <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ platformLabel(row.platform) }} | {{ authTypeText(row) }}</div>
        </div>
        <div class="flex items-center gap-2">
          <el-tag :type="statusType(row)" effect="light">{{ statusText(row) }}</el-tag>
          <el-checkbox v-if="showCheckboxes" :model-value="selectedSet.has(row.id)" @change="(val) => toggle(row.id, val)" />
        </div>
      </div>

      <div class="mt-2 text-xs text-gray-700 dark:text-gray-200">
        今日：{{ row.usage?.daily?.requests || 0 }} 次 · {{ formatTokens(row.usage?.daily?.allTokens || 0) }}M · ￥{{ formatCost(row.usage?.daily?.cost || 0) }}
      </div>

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <el-button v-if="canViewUsage(row)" size="small" @click="$emit('view-usage', row)">
          <el-icon class="mr-1"><TrendCharts /></el-icon>详情
        </el-button>
        <el-button size="small" @click="$emit('edit', row)">
          <el-icon class="mr-1"><Edit /></el-icon>编辑
        </el-button>
        <el-button size="small" type="danger" plain @click="$emit('delete', row)">
          <el-icon class="mr-1"><Delete /></el-icon>删除
        </el-button>
        <el-button size="small" plain @click="$emit('toggle-schedulable', row)">
          {{ row.schedulable === false ? '启用调度' : '禁用调度' }}
        </el-button>
        <el-button size="small" plain @click="$emit('reset-status', row)">重置状态</el-button>
      </div>
      <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">最后使用：{{ formatLastUsed(row.lastUsedAt) }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Edit, Delete, TrendCharts } from '@element-plus/icons-vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
  showCheckboxes: Boolean,
  selected: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:selected', 'edit', 'delete', 'view-usage', 'toggle-schedulable', 'reset-status'])

const selectedSet = computed(() => new Set(props.selected))
const toggle = (id, checked) => {
  const set = new Set(props.selected)
  if (checked) set.add(id)
  else set.delete(id)
  emit('update:selected', Array.from(set))
}

const platformLabel = (p) => {
  const map = {
    claude: 'Claude',
    'claude-console': 'Console',
    bedrock: 'Bedrock',
    gemini: 'Gemini',
    openai: 'OpenAI',
    'openai-responses': 'OpenAI-Resp',
    azure_openai: 'Azure OpenAI',
    ccr: 'CCR',
    droid: 'Droid'
  }
  return map[p] || p
}

const canViewUsage = (row) =>
  ['claude', 'claude-console', 'openai', 'openai-responses', 'gemini', 'droid'].includes(
    row.platform
  )

const statusText = (acc) => {
  if (acc.status === 'blocked') return '被封'
  if (acc.status === 'unauthorized') return '未授权'
  if (
    acc.isRateLimited ||
    acc.status === 'rate_limited' ||
    (acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited) ||
    acc.rateLimitStatus === 'limited'
  )
    return '限流'
  if (acc.status === 'temp_error') return '异常'
  if (acc.status === 'error' || !acc.isActive) return '错误/停用'
  if (acc.schedulable === false) return '禁用调度'
  return '正常'
}
const statusType = (acc) => {
  if (acc.status === 'blocked' || acc.status === 'unauthorized') return 'danger'
  if (
    acc.isRateLimited ||
    acc.status === 'rate_limited' ||
    (acc.rateLimitStatus && acc.rateLimitStatus.isRateLimited) ||
    acc.rateLimitStatus === 'limited'
  )
    return 'warning'
  if (acc.status === 'temp_error') return 'warning'
  if (acc.status === 'error' || !acc.isActive) return 'danger'
  if (acc.schedulable === false) return 'info'
  return 'success'
}

const formatLastUsed = (dateString) => {
  if (!dateString) return '从未使用'
  const date = new Date(dateString)
  const now = new Date()
  const diff = now - date
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
  return date.toLocaleDateString('zh-CN')
}

const formatTokens = (num) => {
  const n = Number(num || 0)
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2)
  if (n >= 1_000) return (n / 1_000_000).toFixed(4)
  return (n / 1_000_000).toFixed(6)
}
const formatCost = (n) => Number(n || 0).toFixed(4)

const authTypeText = (acc) => {
  if (acc.platform === 'gemini' || acc.platform === 'openai') return 'OAuth'
  if (acc.platform === 'claude') return !acc.lastRefreshAt ? 'Setup' : 'OAuth'
  return acc.type || acc.accountType || '-'
}
</script>


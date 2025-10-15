<template>
  <el-table
    :data="data"
    border
    style="width: 100%"
    :height="tableHeight"
    @selection-change="onSelectionChange"
    :empty-text="loading ? '' : '暂无数据'"
    v-loading="loading"
    element-loading-text="加载中..."
    element-loading-background="transparent"
  >
    <el-table-column v-if="showCheckboxes" type="selection" width="48" />

    <el-table-column label="名称" min-width="160">
      <template #default="{ row }">
        <div class="truncate font-semibold">{{ row.name }}</div>
        <div v-if="isLdapEnabled && row.ownerDisplayName" class="mt-1 text-xs text-red-600">
          <el-icon class="mr-1"><User /></el-icon>{{ row.ownerDisplayName }}
        </div>
      </template>
    </el-table-column>

    <el-table-column label="所属账号" min-width="220">
      <template #default="{ row }">
        <div class="flex flex-wrap gap-4">
          <template v-for="(s, idx) in getBindingStrings(row)" :key="idx">
            <el-tag size="small" type="info">{{ s }}</el-tag>
          </template>
          <span v-if="getBindingStrings(row).length === 0" class="text-xs text-gray-500">共享池</span>
        </div>
      </template>
    </el-table-column>

    <!-- 新列：是否激活 -->
    <el-table-column label="是否激活" min-width="100" align="center">
      <template #default="{ row }">
        <el-tag :type="row.isActivated ? 'success' : 'info'" size="small">{{ row.isActivated ? '是' : '否' }}</el-tag>
      </template>
    </el-table-column>

    <!-- 新列：每日请求上限 (次) -->
    <el-table-column label="每日请求上限 (次)" min-width="160" align="right">
      <template #default="{ row }">
        <span>{{ row.dailyRequestsLimit && row.dailyRequestsLimit > 0 ? row.dailyRequestsLimit : '无限' }}</span>
      </template>
    </el-table-column>

    <!-- 新列：速率限制 -->
    <el-table-column label="速率限制" min-width="140">
      <template #default="{ row }">
        <span v-if="row.rateLimitWindow > 0 && row.rateLimitRequests > 0">
          {{ row.rateLimitRequests }} 次 / {{ row.rateLimitWindow }} 分钟
        </span>
        <span v-else class="text-gray-400">无限</span>
      </template>
    </el-table-column>

    <el-table-column label="Token" min-width="120" align="right">
      <template #default="{ row }">
        {{ formatTokenCount(getUsage(row).tokens || getUsage(row).allTokens || 0) }}
      </template>
    </el-table-column>

    <el-table-column label="请求数" min-width="120" align="right">
      <template #default="{ row }">
        {{ formatNumber(getUsage(row).requests || 0) }}
      </template>
    </el-table-column>

    <el-table-column label="最后使用" min-width="120">
      <template #default="{ row }">
        {{ formatDate(row.lastUsedAt) }}
      </template>
    </el-table-column>

    <el-table-column label="创建时间" min-width="120">
      <template #default="{ row }">
        {{ formatDate(row.createdAt) }}
      </template>
    </el-table-column>

    <el-table-column label="过期时间" min-width="180">
      <template #default="{ row }">
        <!-- 激活模式：未激活时显示 未激活（X天/小时/月） -->
        <template v-if="row.expirationMode === 'activation' && !row.isActivated">
          <span class="text-gray-500 cursor-pointer" @click="$emit('edit-expiry', row)">
            未激活（{{ formatActivationDuration(row.activationDays, row.activationUnit) }}）
          </span>
        </template>
        <template v-else>
          <span v-if="!row.expiresAt" class="text-gray-400 cursor-pointer" @click="$emit('edit-expiry', row)">永不过期</span>
          <template v-else>
            <el-tag v-if="isExpired(row.expiresAt)" type="danger" size="small" @click="$emit('edit-expiry', row)">已过期</el-tag>
            <el-tag v-else-if="isExpiringSoon(row.expiresAt)" type="warning" size="small" @click="$emit('edit-expiry', row)">{{ formatFullDate(row.expiresAt) }}</el-tag>
            <span v-else class="cursor-pointer" @click="$emit('edit-expiry', row)">{{ formatFullDate(row.expiresAt) }}</span>
          </template>
        </template>
      </template>
    </el-table-column>

    <el-table-column fixed="right" label="操作" min-width="240">
      <template #default="{ row }">
        <el-button link type="success" @click="copyAccessToken(row)">复制Token</el-button>
        <el-button link type="primary" @click="$emit('detail', row)">详情</el-button>
        <el-button link type="primary" @click="$emit('edit', row)">编辑</el-button>
        <el-button v-if="row.expiresAt && (isExpired(row.expiresAt) || isExpiringSoon(row.expiresAt))" link type="primary" @click="$emit('renew', row)">续期</el-button>
        <el-popconfirm title="确定删除该 Key？" confirm-button-text="删除" cancel-button-text="取消" @confirm="$emit('delete', row)">
          <template #reference>
            <el-button link type="danger">删除</el-button>
          </template>
        </el-popconfirm>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { computed } from 'vue'
import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'
import LimitProgressBar from '@/components/apikeys/LimitProgressBar.vue'
import { User } from '@element-plus/icons-vue'
import { formatDate as formatDateUtil } from '@/utils/format'

const props = defineProps({
  data: { type: Array, default: () => [] },
  isLdapEnabled: { type: Boolean, default: false },
  showCheckboxes: { type: Boolean, default: false },
  getBindingStrings: { type: Function, required: true },
  selected: { type: Array, default: () => [] },
  dateFilter: { type: Object, required: true },
  loading: { type: Boolean, default: false }
  ,
  tableHeight: { type: [Number, String], default: 560 }
})

const emit = defineEmits(['update:selected', 'sort-change', 'edit', 'renew', 'delete', 'detail', 'edit-expiry'])

const onSelectionChange = (rows) => {
  emit('update:selected', rows.map((r) => r.id))
}

const formatNumber = (num) => {
  if (!num && num !== 0) return '0'
  return num.toLocaleString('zh-CN')
}
const formatTokenCount = (count) => {
  if (!count && count !== 0) return '0'
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M'
  if (count >= 1000) return (count / 1000).toFixed(1) + 'K'
  return String(count)
}
const formatDate = (str) => {
  if (!str) return '-'
  try {
    return formatDateUtil(str, 'YYYY-MM-DD HH:mm:ss')
  } catch {
    return String(str)
  }
}
const getUsage = (row) => {
  const usage = row.usage || {}
  const preset = props.dateFilter?.type === 'custom' ? 'custom' : (props.dateFilter?.preset || 'today')
  switch (preset) {
    case 'today':
      return usage.today || usage.daily || usage.total || {}
    case '7days':
      // 后端未提供 weekly 字段时，回退到 daily 或 total
      return usage.weekly || usage.daily || usage.total || {}
    case '30days':
      return usage.monthly || usage.total || {}
    case 'all':
    case 'custom':
    default:
      return usage.total || {}
  }
}
const formatFullDate = (str) => formatDate(str)
const isExpired = (expiresAt) => {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}
const isExpiringSoon = (expiresAt) => {
  if (!expiresAt || isExpired(expiresAt)) return false
  const days = (new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24)
  return days <= 7
}

const formatActivationDuration = (days, unit) => {
  const u = (unit || 'days').toLowerCase()
  if (!days || days <= 0) return '未设置'
  if (u === 'hours') return `${days}小时`
  if (u === 'months' || u === 'month') return `${days}月`
  return `${days}天`
}

const copyAccessToken = async (row) => {
  try {
    const resp = await apiClient.get(`/admin/api-keys/${row.id}/token`)
    if (!resp.success) {
      showToast(resp.error || '复制失败', 'error')
      return
    }
    const key = resp.data?.key
    if (!key) {
      showToast('该 Key 的明文不可用，无法复制', 'error')
      return
    }
    await navigator.clipboard.writeText(key)
    showToast('访问令牌已复制', 'success')
  } catch (e) {
    showToast('复制失败', 'error')
  }
}
</script>

<style scoped>
</style>

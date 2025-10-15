<template>
  <el-table
    :data="data"
    border
    style="width: 100%"
    :height="tableHeight"
    :default-sort="defaultSort"
    @sort-change="onSortChange"
  >
    <el-table-column
      v-if="showCheckboxes"
      type="selection"
      width="48"
      align="center"
      :reserve-selection="true"
      @select-all="onElSelectAll"
      @select="onElSelect"
      @selection-change="onSelectionChange"
    />

    <el-table-column label="名称" prop="name" sortable="custom" min-width="240">
      <template #default="{ row }">
        <div class="flex items-start gap-2">
          <el-tag
            v-if="row.accountType === 'dedicated'"
            size="small"
            type="info"
            effect="light"
          >专属</el-tag>
          <el-tag
            v-else-if="row.accountType === 'group'"
            size="small"
            type="primary"
            effect="light"
          >分组</el-tag>
          <el-tooltip
            :content="accountDisplayName(row)"
            placement="top"
            :disabled="accountDisplayName(row).length <= 15"
            effect="dark"
          >
            <span class="font-medium text-gray-900 dark:text-gray-100 truncate inline-block">
              {{ truncateText(accountDisplayName(row), 15) }}
            </span>
          </el-tooltip>
        </div>
        <div v-if="row.groupInfos && row.groupInfos.length" class="mt-1 flex flex-wrap gap-2">
          <el-tag v-for="g in row.groupInfos" :key="g.id" size="small" effect="plain">分组-{{ g.name }}</el-tag>
        </div>
      </template>
    </el-table-column>

    <el-table-column label="平台/类型" min-width="160" sortable="custom" prop="platform">
      <template #default="{ row }">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium">{{ platformLabel(row.platform) }}</span>
          <el-divider direction="vertical" />
          <span class="text-xs text-gray-600 dark:text-gray-300">{{ authTypeText(row) }}</span>
        </div>
      </template>
    </el-table-column>

    <el-table-column label="状态" min-width="120" sortable="custom" prop="status">
      <template #default="{ row }">
        <el-tag :type="statusType(row)" effect="light">{{ statusText(row) }}</el-tag>
      </template>
    </el-table-column>

    <el-table-column label="是否启用" min-width="120" align="center">
      <template #default="{ row }">
        <el-switch
          size="small"
          :model-value="row.schedulable !== false"
          :loading="row.isTogglingSchedulable"
          @change="$emit('toggle-schedulable', row)"
        />
      </template>
    </el-table-column>

    <el-table-column label="代理" min-width="160">
      <template #default="{ row }">
        <span class="text-xs text-gray-600 dark:text-gray-300">{{ proxyDisplay(row.proxy) || '-' }}</span>
      </template>
    </el-table-column>

    <el-table-column label="今日使用" min-width="160">
      <template #default="{ row }">
        <div class="text-xs text-gray-700 dark:text-gray-200">
          <span>{{ row.usage?.daily?.requests || 0 }} 次</span>
          <el-divider direction="vertical" />
          <span>{{ formatTokens(row.usage?.daily?.allTokens || 0) }}M</span>
          <el-divider direction="vertical" />
          <span>￥{{ formatCost(row.usage?.daily?.cost || 0) }}</span>
        </div>
      </template>
    </el-table-column>

    <el-table-column label="窗口/限额" min-width="220">
      <template #default="{ row }">
        <div v-if="row.platform === 'claude'">
          <template v-if="isClaudeOAuth(row) && row.claudeUsage">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <el-tag size="small" effect="plain">5h</el-tag>
                <el-progress :percentage="usagePercent(row.claudeUsage?.fiveHour)" :stroke-width="6" style="width: 140px"/>
              </div>
              <div class="flex items-center gap-2">
                <el-tag size="small" effect="plain" type="success">7d</el-tag>
                <el-progress :percentage="usagePercent(row.claudeUsage?.sevenDay)" :stroke-width="6" style="width: 140px"/>
              </div>
              <div class="flex items-center gap-2">
                <el-tag size="small" effect="plain" type="warning">Opus</el-tag>
                <el-progress :percentage="usagePercent(row.claudeUsage?.sevenDayOpus)" :stroke-width="6" style="width: 140px"/>
              </div>
            </div>
          </template>
          <template v-else>
            <div v-if="row.sessionWindow?.hasActiveWindow" class="flex items-center gap-2">
              <el-progress :percentage="row.sessionWindow?.progress || 0" :stroke-width="6" style="width: 180px"/>
            </div>
            <span v-else class="text-xs text-gray-400">-</span>
          </template>
        </div>
        <div v-else-if="row.platform === 'openai' || row.platform === 'openai-responses'">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <el-tag size="small" effect="plain">5h</el-tag>
              <el-progress :percentage="codexPercent(row.codexUsage?.primary)" :stroke-width="6" style="width: 140px"/>
            </div>
            <div class="text-[11px] text-gray-500 dark:text-gray-400">
              重置剩余 {{ formatCodexRemaining(row.codexUsage?.primary) }}
            </div>
            <div class="flex items-center gap-2">
              <el-tag size="small" effect="plain" type="success">周限</el-tag>
              <el-progress :percentage="codexPercent(row.codexUsage?.secondary)" :stroke-width="6" style="width: 140px"/>
            </div>
            <div class="text-[11px] text-gray-500 dark:text-gray-400">
              重置剩余 {{ formatCodexRemaining(row.codexUsage?.secondary) }}
            </div>
          </div>
        </div>
        <span v-else class="text-xs text-gray-400">-</span>
      </template>
    </el-table-column>

    <el-table-column label="最后使用" min-width="140" prop="lastUsedAt" sortable="custom">
      <template #default="{ row }">
        <span class="text-xs text-gray-600 dark:text-gray-300">{{ formatLastUsed(row.lastUsedAt) }}</span>
      </template>
    </el-table-column>

    <el-table-column label="操作" fixed="right" min-width="220" align="center" header-align="center">
      <template #default="{ row }">
        <div>
          <template v-if="canViewUsage(row)">
            <el-tooltip content="详情" placement="top" effect="dark">
              <el-button
                circle
                size="small"
                aria-label="详情"
                @click="$emit('view-usage', row)"
              >
                <el-icon><TrendCharts /></el-icon>
              </el-button>
            </el-tooltip>
          </template>
          <el-tooltip content="编辑" placement="top" effect="dark">
            <el-button circle size="small" aria-label="编辑" @click="$emit('edit', row)">
              <el-icon><Edit /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="删除" placement="top" effect="dark">
            <el-button
              circle
              size="small"
              type="danger"
              plain
              aria-label="删除"
              @click="$emit('delete', row)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="重置状态" placement="top" effect="dark">
            <el-button circle size="small" aria-label="重置状态" @click="$emit('reset-status', row)">
              <el-icon><Refresh /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { computed } from 'vue'
import { Edit, Delete, TrendCharts, Refresh } from '@element-plus/icons-vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
  showCheckboxes: Boolean,
  selected: { type: Array, default: () => [] },
  sortBy: { type: String, default: '' },
  sortOrder: { type: String, default: 'asc' },
  tableHeight: { type: [Number, String], default: 560 }
})

const emit = defineEmits([
  'update:selected',
  'sort-change',
  'edit',
  'delete',
  'view-usage',
  'toggle-schedulable',
  'reset-status'
])

const defaultSort = computed(() => ({ prop: props.sortBy || 'name', order: props.sortOrder === 'asc' ? 'ascending' : 'descending' }))

const onSortChange = ({ prop }) => {
  if (!prop) return
  emit('sort-change', prop)
}

const onSelectionChange = (rows) => {
  emit('update:selected', rows.map((r) => r.id))
}
const onElSelect = () => {}
const onElSelectAll = () => {}

// 计算账号显示名称（完整值）
const accountDisplayName = (row) => {
  const v = row?.name || row?.email || row?.accountName || row?.id
  return v != null ? String(v) : ''
}

// 截断文本到指定字符数，超出加省略号
const truncateText = (str, max = 15) => {
  const s = String(str || '')
  if (s.length <= max) return s
  return s.slice(0, max) + '…'
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

const isClaudeOAuth = (account) => account?.authType === 'oauth'

const usagePercent = (win) => {
  let v = Number(win?.utilization ?? 0)
  if (Number.isNaN(v)) return 0
  // 兼容 0..1 的小数与 0..100 的百分比
  if (v > 0 && v <= 1) v = v * 100
  return Math.max(0, Math.min(100, v))
}

const codexPercent = (u) => {
  if (!u) return 0
  // 如果已过重置时间，直接显示 0
  const resetAtMs = u.resetAt ? Date.parse(u.resetAt) : null
  const remainingSeconds =
    typeof u.remainingSeconds === 'number' ? Number(u.remainingSeconds) : null
  const resetElapsed =
    (remainingSeconds !== null && remainingSeconds <= 0) ||
    (resetAtMs !== null && !Number.isNaN(resetAtMs) && Date.now() >= resetAtMs)
  if (resetElapsed) return 0

  let v = Number(u?.usedPercent ?? u?.utilization ?? 0)
  if (Number.isNaN(v)) return 0
  // 兼容两种返回：0..100 的百分比，或 0..1 的小数
  if (v > 0 && v <= 1) v = v * 100
  return Math.max(0, Math.min(100, v))
}

const formatCodexRemaining = (usageItem) => {
  if (!usageItem) return '--'
  // 优先使用 resetAt 动态计算剩余时间，避免静态 remainingSeconds 逐渐不准
  if (usageItem.resetAt) {
    const ts = Date.parse(usageItem.resetAt)
    if (!Number.isNaN(ts)) {
      const diff = Math.max(0, Math.floor((ts - Date.now()) / 1000))
      return humanizeSeconds(diff)
    }
  }
  let seconds = usageItem.remainingSeconds
  if (seconds === null || seconds === undefined) seconds = usageItem.resetAfterSeconds
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return '--'
  seconds = Math.max(0, Math.floor(Number(seconds)))
  return humanizeSeconds(seconds)
}

const humanizeSeconds = (seconds) => {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (days > 0) return hours > 0 ? `${days}天${hours}小时` : `${days}天`
  if (hours > 0) return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`
  if (minutes > 0) return `${minutes}分钟`
  return `${secs}秒`
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

const proxyDisplay = (proxy) => {
  if (!proxy || !proxy.host || !proxy.port) return ''
  const typeShort = proxy.type === 'socks5' ? 'S5' : String(proxy.type || '').toUpperCase()
  const host = proxy.host?.length > 15 ? `${proxy.host.slice(0, 12)}...` : proxy.host
  return `${typeShort}://${proxy.username ? '***@' : ''}${host}:${proxy.port}`
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

const authTypeText = (acc) => {
  if (acc.platform === 'gemini' || acc.platform === 'openai') return 'OAuth'
  if (acc.platform === 'claude') return !acc.lastRefreshAt ? 'Setup' : 'OAuth'
  return acc.type || acc.accountType || '-'
}
</script>

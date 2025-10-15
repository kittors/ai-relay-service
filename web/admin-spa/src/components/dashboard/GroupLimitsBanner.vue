<template>
  <div class="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-900/20 sm:mb-6 sm:p-4">
    <div class="mb-2 flex items-center justify-between">
      <div class="text-sm font-semibold text-blue-800 dark:text-blue-200">
        账号分组窗口/周限使用概览
      </div>
      <div class="flex items-center gap-2">
        <button
          class="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          :disabled="refreshing"
          @click="$emit('refresh')"
        >
          {{ refreshing ? '刷新中…' : '刷新' }}
        </button>
        <div class="text-[11px] text-blue-700/70 dark:text-blue-200/70">
          仅显示已获取到快照的数据
        </div>
      </div>
    </div>

    <div v-if="hasAnyData" class="flex flex-col gap-3">
      <div v-if="overall" class="text-xs text-gray-800 dark:text-gray-200">
        全部账号平均：
        <span>5h {{ fmt(overall.fiveHourPercent) }}%</span>
        <span class="mx-1 text-gray-400">/</span>
        <span>周 {{ fmt(overall.weekPercent) }}%</span>
      </div>
      <!-- Claude 概览 -->
      <div v-if="claude" class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span class="rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">Claude</span>
          <span v-if="claude.overall && claude.overall.sampleCount > 0" class="text-xs text-gray-700 dark:text-gray-300">
            全部平均：5h {{ fmt(claude.overall.fiveHourPercent) }}% ｜ 周 {{ fmt(claude.overall.weekPercent) }}%
          </span>
        </div>
        <div v-if="claude.groups && claude.groups.length" class="mt-1 flex flex-wrap gap-2">
          <div
            v-for="g in shownClaudeGroups"
            :key="g.id"
            class="rounded-md bg-white px-2 py-1 text-xs shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
          >
            <span class="mr-1 font-medium text-gray-800 dark:text-gray-200">{{ g.name }}</span>
            <span class="text-gray-600 dark:text-gray-300">5h {{ fmt(g.fiveHourPercent) }}%</span>
            <span class="mx-1 text-gray-400">/</span>
            <span class="text-gray-600 dark:text-gray-300">周 {{ fmt(g.weekPercent) }}%</span>
          </div>
        </div>
      </div>

      <!-- OpenAI 概览 -->
      <div v-if="openai" class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span class="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">OpenAI</span>
          <span v-if="openai.overall && openai.overall.sampleCount > 0" class="text-xs text-gray-700 dark:text-gray-300">
            全部平均：5h {{ fmt(openai.overall.fiveHourPercent) }}% ｜ 周 {{ fmt(openai.overall.weekPercent) }}%
          </span>
        </div>
        <div v-if="openai.groups && openai.groups.length" class="mt-1 flex flex-wrap gap-2">
          <div
            v-for="g in shownOpenaiGroups"
            :key="g.id"
            class="rounded-md bg-white px-2 py-1 text-xs shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
          >
            <span class="mr-1 font-medium text-gray-800 dark:text-gray-200">{{ g.name }}</span>
            <span class="text-gray-600 dark:text-gray-300">5h {{ fmt(g.fiveHourPercent) }}%</span>
            <span class="mx-1 text-gray-400">/</span>
            <span class="text-gray-600 dark:text-gray-300">周 {{ fmt(g.weekPercent) }}%</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-xs text-blue-700/80 dark:text-blue-200/80">
      暂无可展示的分组窗口/限额数据。可点击“刷新”尝试获取最新快照。
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  limits: {
    type: Object,
    default: () => ({ platforms: { claude: null, openai: null } })
  },
  refreshing: { type: Boolean, default: false },
  // 显示的每个平台的分组数量上限，避免横向撑太多
  maxGroups: { type: Number, default: 6 }
})

defineEmits(['refresh'])

const claude = computed(() => props.limits?.platforms?.claude || null)
const openai = computed(() => props.limits?.platforms?.openai || null)
const overall = computed(() => props.limits?.overall || null)

const hasAnyData = computed(() => {
  const c = claude.value
  const o = openai.value
  const cOk = !!(c && ((c.overall && c.overall.sampleCount > 0) || (c.groups || []).length))
  const oOk = !!(o && ((o.overall && o.overall.sampleCount > 0) || (o.groups || []).length))
  return cOk || oOk
})

const shownClaudeGroups = computed(() => {
  const list = (claude.value?.groups || []).filter((g) => (g.sampleCount || 0) > 0)
  return list.slice(0, props.maxGroups)
})
const shownOpenaiGroups = computed(() => {
  const list = (openai.value?.groups || []).filter((g) => (g.sampleCount || 0) > 0)
  return list.slice(0, props.maxGroups)
})

function fmt(v) {
  if (!Number.isFinite(Number(v))) return 0
  return Math.round(Number(v))
}
</script>

<style scoped>
</style>

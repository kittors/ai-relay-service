<template>
  <el-dialog v-model="visible" title="开通成功" width="560px" append-to-body @closed="$emit('close')">
    <div class="space-y-3">
      <div class="rounded-lg border border-green-500/40 bg-green-50 p-3 dark:bg-green-900/20">
        <div class="mb-1 text-sm font-semibold text-green-800 dark:text-green-200">您的 API Key</div>
        <div class="flex items-center gap-2">
          <code class="flex-1 truncate rounded bg-white p-2 text-base font-mono font-semibold text-gray-800 dark:bg-gray-900 dark:text-gray-100">{{ apiKey }}</code>
          <el-button size="small" @click="copy(apiKey)">复制</el-button>
        </div>
      </div>

      <div v-if="message" class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">使用说明</div>
        <pre class="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">{{ message }}</pre>
        <div class="mt-2 text-right">
          <el-button size="small" @click="copy(message)">复制说明</el-button>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button type="primary" @click="close">完成</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { showToast } from '@/utils/toast'

const props = defineProps({
  show: { type: Boolean, default: false },
  apiKey: { type: String, required: true },
  oemSettings: { type: Object, default: () => ({}) }
})
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

const siteUrl = window.location.origin

const message = computed(() => {
  const tpl = props.oemSettings?.copyInfoTemplate || ''
  if (!tpl) return `您可以通过访问${siteUrl}查看教程和您的api使用情况；\n您的API KEY是：${props.apiKey}`
  return tpl.replaceAll('{siteUrl}', siteUrl).replaceAll('{apiKey}', props.apiKey)
})

function copy(text) {
  try {
    navigator.clipboard.writeText(text)
    showToast('已复制到剪贴板', 'success')
  } catch (e) {
    showToast('复制失败，请手动复制', 'error')
  }
}

function close() {
  visible.value = false
}
</script>

<style scoped></style>


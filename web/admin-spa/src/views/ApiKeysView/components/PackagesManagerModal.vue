<template>
  <el-dialog v-model="visible" title="API Key 模版" width="860px" append-to-body>
    <template #default>
      <el-scrollbar class="dialog-scroll" height="60vh">
        <TemplateList
          :templates="templates"
          :loading="loading"
          @create="onCreate"
          @edit="onEdit"
          @delete="onDelete"
          @quick-create="onQuickCreate"
        />
      </el-scrollbar>
    </template>

    <template #footer>
      <el-button @click="close">关闭</el-button>
    </template>
  </el-dialog>

  <!-- 编辑弹窗 -->
  <TemplateEditDialog
    :show="editVisible"
    :template="currentTemplate"
    :accounts="accounts"
    :tag-options="tagOptions"
    @close="editVisible = false"
    @saved="onSaved"
  />

  <!-- 快速创建弹窗 -->
  <TemplateQuickCreateDialog
    :show="quickVisible"
    :templates="templates"
    :tag-options="tagOptions"
    :selected-template-id="selectedTemplateId"
    @close="quickVisible = false"
    @created="onCreated"
  />

  <!-- 快速创建结果表格 -->
  <TemplateCreateResultDialog
    :show="quickResultVisible"
    :items="quickResultKeys"
    :accounts="accounts"
    @close="quickResultVisible = false"
  />
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'
import TemplateList from './templates/TemplateList.vue'
import TemplateEditDialog from './templates/TemplateEditDialog.vue'
import TemplateQuickCreateDialog from './templates/TemplateQuickCreateDialog.vue'
import TemplateCreateResultDialog from './templates/TemplateCreateResultDialog.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  accounts: { type: Object, required: true },
  tagOptions: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'created'])

const visible = ref(false)
watch(
  () => props.show,
  (v) => (visible.value = v),
  { immediate: true }
)
// 当内部对话框关闭时，通知父组件同步关闭状态
watch(
  () => visible.value,
  (v) => {
    if (v === false) emit('close')
  }
)
const templates = ref([])
const loading = ref(false)

const editVisible = ref(false)
const currentTemplate = ref(null)

const quickVisible = ref(false)
const quickResultVisible = ref(false)
const quickResultKeys = ref([])
const selectedTemplateId = ref('')

const accounts = props.accounts

async function loadTemplates() {
  loading.value = true
  try {
    const resp = await apiClient.get('/admin/api-key-templates')
    if (resp.success) templates.value = resp.data || []
  } catch (e) {
    showToast('加载模版失败', 'error')
  } finally {
    loading.value = false
  }
}

function onCreate() { currentTemplate.value = null; editVisible.value = true }
function onEdit(row) { currentTemplate.value = row; editVisible.value = true }

function onSaved() { editVisible.value = false; loadTemplates() }

async function onDelete(row) {
  try {
    await apiClient.delete(`/admin/api-key-templates/${row.id}`)
    showToast('已删除模版', 'success')
    await loadTemplates()
  } catch (e) {
    showToast('删除失败', 'error')
  }
}

function onQuickCreate(row) { selectedTemplateId.value = row?.id || ''; quickVisible.value = true }

function onCreated(arr) { quickResultKeys.value = arr || []; quickResultVisible.value = true; loadTemplates(); emit('created') }

function close() {
  emit('close')
}

onMounted(() => {
  if (props.show) visible.value = true
  loadTemplates()
})

function buildTemplatePayload(form) {
  const payload = { ...form }
  // 映射分组到 accountId
  payload.openaiAccountId = form.openaiGroupId ? `group:${form.openaiGroupId}` : ''
  payload.claudeAccountId = form.claudeGroupId ? `group:${form.claudeGroupId}` : ''
  payload.geminiAccountId = form.geminiGroupId ? `group:${form.geminiGroupId}` : ''
  payload.droidAccountId = form.droidGroupId ? `group:${form.droidGroupId}` : ''
  // 清理 UI 字段
  delete payload.openaiGroupId
  delete payload.claudeGroupId
  delete payload.geminiGroupId
  delete payload.droidGroupId
  // 访问权限固定为 OpenAI
  payload.permissions = 'openai'
  // 移除账号直绑字段，确保只能按分组绑定
  delete payload.azureOpenaiAccountId
  delete payload.bedrockAccountId
  delete payload.claudeConsoleAccountId
  return payload
}


</script>

<style scoped>
.dialog-scroll { padding-right: 4px; }
</style>

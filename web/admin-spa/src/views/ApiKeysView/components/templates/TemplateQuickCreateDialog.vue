<template>
  <el-dialog v-model="innerShow" title="通过模版快速创建" width="520px" append-to-body @closed="$emit('close')">
    <el-scrollbar class="dialog-scroll" height="60vh">
      <el-form :model="form" label-width="90px">
        <el-form-item label="模版">
          <el-select v-model="form.templateId" placeholder="选择模版">
            <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称/前缀" required>
          <el-input v-model="form.name" placeholder="例如：我的Key 或 批量前缀" />
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="form.count" :min="1" :max="500" :step="1" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select v-model="form.tags" multiple filterable allow-create default-first-option placeholder="选择或输入标签">
            <el-option v-for="t in tagOptions" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
      </el-form>
    </el-scrollbar>
    <template #footer>
      <el-button @click="innerShow = false">取消</el-button>
      <el-button type="primary" @click="submit">创建</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'

const props = defineProps({
  show: { type: Boolean, default: false },
  templates: { type: Array, default: () => [] },
  tagOptions: { type: Array, default: () => [] },
  selectedTemplateId: { type: String, default: '' }
})
const emit = defineEmits(['close', 'created'])

const innerShow = ref(false)
watch(
  () => props.show,
  (v) => (innerShow.value = v),
  { immediate: true }
)
watch(
  () => innerShow.value,
  (v) => {
    if (!v) emit('close')
  }
)

const form = ref({ templateId: '', name: '', count: 1, tags: [] })

const tagOptions = props.tagOptions

function reset() {
  const initialId = props.selectedTemplateId || props.templates?.[0]?.id || ''
  form.value = { templateId: initialId, name: '', count: 1, tags: [] }
}

watch(
  () => props.show,
  (v) => {
    if (v) reset()
  }
)

// 当外部选中的模版变化时（在弹窗已显示时）同步更新选择
watch(
  () => props.selectedTemplateId,
  (id) => {
    if (innerShow.value && id && id !== form.value.templateId) {
      form.value.templateId = id
    }
  }
)

async function submit() {
  try {
    if (!form.value.templateId) return showToast('请选择模版', 'warning')
    if (!form.value.name) return showToast('请输入名称/前缀', 'warning')
    const resp = await apiClient.post('/admin/api-keys/from-template', form.value)
    if (resp.success) {
      showToast('创建成功', 'success')
      emit('created', Array.isArray(resp.data) ? resp.data : [resp.data])
      innerShow.value = false
    }
  } catch (e) {
    showToast(e.response?.data?.error || '创建失败', 'error')
  }
}
</script>

<style scoped>
.dialog-scroll { padding-right: 4px; }
</style>

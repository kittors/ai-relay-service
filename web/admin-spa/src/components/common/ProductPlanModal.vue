<template>
  <el-dialog
    :model-value="modelValue"
    :title="editing ? '编辑套餐' : '添加套餐'"
    width="560px"
    @close="close"
  >
    <el-form label-width="100px" label-position="left">
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="排序"
            ><el-input v-model.number="form.order" type="number"
          /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="ID"
            ><el-input v-model="form.id" show-word-limit maxlength="64"
          /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="名称"
            ><el-input v-model="form.name" show-word-limit maxlength="64"
          /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="标签"
            ><el-input v-model="form.tag" show-word-limit maxlength="32"
          /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="价格"><el-input v-model="form.price" maxlength="32" /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="价格说明"
            ><el-input v-model="form.priceNote" maxlength="64"
          /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="时长"
            ><el-input v-model="form.durationDesc" maxlength="64"
          /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="日配额"
            ><el-input v-model.number="form.dailyLimit" type="number"
          /></el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="API Key 模版">
            <el-select
              v-model="form.apiKeyTemplateId"
              clearable
              filterable
              placeholder="选择用于开通的模版（可选）"
              :loading="templatesLoading"
              style="width: 100%"
            >
              <el-option
                v-for="t in templates"
                :key="t.id"
                :label="t.name"
                :value="t.id"
              />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="描述"
        ><el-input
          v-model="form.description"
          type="textarea"
          :rows="4"
          maxlength="200"
          show-word-limit
      /></el-form-item>
      <el-form-item label="启用"><el-switch v-model="form.active" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  plan: { type: Object, default: () => ({}) },
  editing: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'save'])

const form = ref({
  id: '',
  name: '',
  description: '',
  price: '',
  priceNote: '',
  durationDesc: '',
  dailyLimit: 0,
  tag: '',
  apiKeyTemplateId: '',
  active: true,
  order: 1
})

const initForm = (src = {}) => {
  form.value = {
    id: src.id || '',
    name: src.name || '',
    description: src.description || '',
    price: src.price || '',
    priceNote: src.priceNote || '',
    durationDesc: src.durationDesc || '',
    dailyLimit: Number.isFinite(src.dailyLimit) ? src.dailyLimit : 0,
    tag: src.tag || '',
    apiKeyTemplateId: src.apiKeyTemplateId || '',
    active: src.active !== false,
    order: Number.isFinite(src.order) ? src.order : 1
  }
}

watch(
  () => props.plan,
  (val) => initForm(val),
  { immediate: true }
)

const close = () => emit('update:modelValue', false)

const save = () => {
  const normalized = {
    id: (form.value.id || '').trim().slice(0, 64),
    name: (form.value.name || '').trim().slice(0, 64),
    description: (form.value.description || '').trim().slice(0, 200),
    price: (form.value.price || '').trim().slice(0, 32),
    priceNote: (form.value.priceNote || '').trim().slice(0, 64),
    durationDesc: (form.value.durationDesc || '').trim().slice(0, 64),
    dailyLimit: Math.max(0, parseInt(form.value.dailyLimit, 10) || 0),
    tag: (form.value.tag || '').trim().slice(0, 32),
    apiKeyTemplateId: (form.value.apiKeyTemplateId || '').trim().slice(0, 64),
    active: form.value.active !== false,
    order: Number.isFinite(form.value.order) ? form.value.order : 1
  }
  emit('save', normalized)
  close()
}

// 加载模版列表（仅在弹窗打开时加载）
const templates = ref([])
const templatesLoading = ref(false)

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return
    try {
      templatesLoading.value = true
      const resp = await apiClient.get('/admin/api-key-templates')
      if (resp?.success) {
        templates.value = Array.isArray(resp.data) ? resp.data : []
      } else {
        templates.value = []
      }
    } catch (e) {
      templates.value = []
      showToast('加载模版失败', 'error')
    } finally {
      templatesLoading.value = false
    }
  },
  { immediate: false }
)
</script>

<style scoped></style>

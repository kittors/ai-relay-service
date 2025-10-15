<template>
  <el-dialog
    v-model="innerShow"
    :title="form.id ? '编辑模版' : '新建模版'"
    width="840px"
    append-to-body
    @closed="$emit('close')"
  >
    <el-scrollbar class="dialog-scroll" height="60vh">
      <el-form :model="form" label-width="140px">
        <div class="section">
          <div class="section-title">基础信息</div>
          <el-form-item label="模版名称" required>
            <el-input v-model="form.name" placeholder="请输入模版名称" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="form.description" placeholder="简要说明（可选）" />
          </el-form-item>
        </div>

        <el-divider />

        <div class="section">
          <div class="section-title">绑定与权限</div>
          <el-form-item label="OpenAI 分组">
            <el-select v-model="form.openaiGroupId" clearable placeholder="选择 OpenAI 分组">
              <el-option
                v-for="g in accounts.openaiGroups || []"
                :key="g.id"
                :label="g.name"
                :value="g.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="访问权限">
            <el-tag type="success">OpenAI</el-tag>
          </el-form-item>
          <el-form-item label="启用状态">
            <el-switch v-model="form.isActive" />
          </el-form-item>
        </div>

        <el-divider />

        <div class="section">
          <div class="section-title">限流与配额</div>
          <el-form-item label="每日请求上限 (次)">
            <el-input-number v-model="form.dailyRequestsLimit" :min="0" :step="1" />
            <div class="help">0 表示不限</div>
          </el-form-item>
          <el-form-item label="窗口费用上限 ($)">
            <el-input-number v-model="form.rateLimitCost" :min="0" :step="0.01" />
            <div class="help">限制时间窗口内的总费用（可选）</div>
          </el-form-item>
        </div>

        <el-divider />

        <div class="section">
          <div class="section-title">速率限制</div>
          <el-card class="rate-card" shadow="never">
            <el-form-item label="时间窗口（分钟）">
              <el-input-number v-model="form.rateLimitWindow" :min="0" :step="1" />
            </el-form-item>
            <el-form-item label="窗口内请求上限 (次)">
              <el-input-number v-model="form.rateLimitRequests" :min="0" :step="1" />
            </el-form-item>
            <div class="preview">预览：{{ ratePreview }}</div>
            <div class="help">设置任一为 0 表示不限制速率</div>
          </el-card>
        </div>

        <el-divider />

        <div class="section">
          <div class="section-title">过期设置</div>
          <el-form-item label="过期模式">
            <el-radio-group v-model="form.expirationMode">
              <el-radio label="activation">首次使用后</el-radio>
              <el-radio label="fixed">固定时间</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="form.expirationMode === 'fixed'" label="固定过期时间">
            <el-date-picker
              v-model="form.expiresAt"
              type="datetime"
              placeholder="选择过期时间"
              value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
            />
          </el-form-item>
          <el-form-item v-else label="有效周期">
            <div class="inline-group">
              <el-select  v-model="form.activationUnit" style="min-width: 120px">
                <el-option label="小时" value="hours" />
                <el-option label="天" value="days" />
                <el-option label="月" value="months" />
              </el-select>
              <el-input-number
              width="140px"
                v-model="form.activationDays"
                :min="1"
                :step="1"
                :placeholder="'周期值'"
              />
            </div>
          </el-form-item>
        </div>

        <el-divider />

        <div class="section">
          <div class="section-title">标签</div>
          <el-form-item label="标签（可选）">
            <el-select
              v-model="form.tags"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="选择或输入标签"
            >
              <el-option v-for="t in tagOptions" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
          </el-form-item>
        </div>
      </el-form>
    </el-scrollbar>
    <template #footer>
      <el-button @click="innerShow = false">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'

const props = defineProps({
  show: { type: Boolean, default: false },
  template: { type: Object, default: null },
  accounts: { type: Object, required: true },
  tagOptions: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'saved'])

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

const form = ref({
  id: '',
  name: '',
  description: '',
  rateLimitWindow: 0,
  rateLimitRequests: 0,
  rateLimitCost: 0,
  dailyRequestsLimit: 0,
  expirationMode: 'activation',
  activationUnit: 'days',
  activationDays: null,
  isActive: true,
  openaiGroupId: '',
  tags: []
})

const accounts = props.accounts
const tagOptions = props.tagOptions

watch(
  () => props.template,
  (tpl) => {
    if (!tpl) {
      form.value = {
        id: '',
        name: '',
        description: '',
        rateLimitWindow: 0,
        rateLimitRequests: 0,
        rateLimitCost: 0,
        dailyRequestsLimit: 0,
        expirationMode: 'activation',
        activationUnit: 'days',
        activationDays: null,
        isActive: true,
        openaiGroupId: '',
        tags: []
      }
    } else {
      const allowedUnits = new Set(['hours', 'days', 'months'])
      form.value = {
        id: tpl.id || '',
        name: tpl.name || '',
        description: tpl.description || '',
        rateLimitWindow: tpl.rateLimitWindow || 0,
        rateLimitRequests: tpl.rateLimitRequests || 0,
        rateLimitCost: tpl.rateLimitCost || 0,
        dailyRequestsLimit: tpl.dailyRequestsLimit || 0,
        expirationMode: tpl.expirationMode || 'activation',
        activationUnit: allowedUnits.has(tpl.activationUnit) ? tpl.activationUnit : 'days',
        activationDays: tpl.activationDays || null,
        isActive: tpl.isActive !== false,
        openaiGroupId:
          tpl.openaiAccountId && tpl.openaiAccountId.startsWith('group:')
            ? tpl.openaiAccountId.slice(6)
            : '',
        tags: Array.isArray(tpl.tags) ? tpl.tags : []
      }
    }
  },
  { immediate: true }
)

// 当过期模式切换时，清理/保留相关字段，避免误清空周期值
watch(
  () => form.value.expirationMode,
  (mode) => {
    if (mode === 'fixed') {
      // 固定过期时间模式下不需要激活周期
      if (form.value.activationDays !== null) form.value.activationDays = null
    } else {
      // 激活后过期模式，确保有单位；周期值由用户输入
      if (!form.value.activationUnit) form.value.activationUnit = 'days'
    }
  }
)

const ratePreview = computed(() => {
  const r = Number(form.value.rateLimitRequests || 0)
  const w = Number(form.value.rateLimitWindow || 0)
  if (r > 0 && w > 0) return `${r} 次 / ${w} 分钟`
  return '不限制'
})

function buildPayload() {
  const payload = { ...form.value }
  payload.openaiAccountId = form.value.openaiGroupId ? `group:${form.value.openaiGroupId}` : ''
  delete payload.openaiGroupId
  payload.permissions = 'openai'
  delete payload.azureOpenaiAccountId
  delete payload.bedrockAccountId
  delete payload.claudeConsoleAccountId
  return payload
}

async function save() {
  try {
    if (!form.value.name) return showToast('请输入模版名称', 'warning')
    // 校验：当选择激活后过期时，周期值必填且需大于0
    if (form.value.expirationMode === 'activation') {
      const n = Number(form.value.activationDays)
      if (!n || n <= 0) {
        return showToast('请输入有效的周期值（> 0）', 'warning')
      }
    }
    const payload = buildPayload()
    if (form.value.id) {
      const resp = await apiClient.put(`/admin/api-key-templates/${form.value.id}`, payload)
      if (resp.success) showToast('已保存模版', 'success')
    } else {
      const resp = await apiClient.post('/admin/api-key-templates', payload)
      if (resp.success) showToast('已创建模版', 'success')
    }
    emit('saved')
    innerShow.value = false
  } catch (e) {
    showToast(e.response?.data?.error || '保存失败', 'error')
  }
}
</script>

<style scoped>
.section {
  margin-bottom: 16px;
}
.section-title {
  margin: 8px 0 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.inline-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.help {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.preview {
  margin-top: 4px;
  color: var(--el-color-info);
  font-size: 12px;
}
.dialog-scroll {
  padding-right: 4px;
}
.rate-card :deep(.el-card__body) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
</style>

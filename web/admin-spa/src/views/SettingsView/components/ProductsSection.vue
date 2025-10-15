<template>
  <div>
    <!-- Top toolbar: last updated and add button -->
    <div class="mb-4 flex items-center justify-between px-6">
      <el-text v-if="productSettings.updatedAt" type="info">
        <i class="fas fa-clock mr-1" /> 最后更新：{{ formatDateTime(productSettings.updatedAt) }}
      </el-text>
      <el-button type="success" @click="openProductModal(-1)">
        <i class="fas fa-plus mr-2" /> 添加套餐
      </el-button>
    </div>

    <el-table :data="productSettings.plans" class="hidden sm:block" stripe>
      <el-table-column label="排序" prop="order" width="80" fixed="left" />
      <el-table-column label="ID" prop="id" width="200">
        <template #default="{ row }">
          <el-text type="info">{{ row.id }}</el-text>
        </template>
      </el-table-column>
      <el-table-column label="名称" prop="name" width="160" />
      <el-table-column label="描述" prop="description" width="160" show-overflow-tooltip>
      </el-table-column>
      <el-table-column label="价格" width="120">
        <template #default="{ row }">¥{{ row.price }}</template>
      </el-table-column>
      <el-table-column label="价格说明" prop="priceNote" width="120" />
      <el-table-column label="时长" prop="durationDesc" width="120" />
      <el-table-column label="日配额" prop="dailyLimit" width="100" />
      <el-table-column label="标签" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.tag" type="primary" effect="light">{{ row.tag }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right" >
        <template #default="{ $index }">
          <el-button size="small" type="primary" @click="openProductModal($index)">详情</el-button>
          <el-button size="small" type="danger" @click="removePlan($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    

    <div class="space-y-4 sm:hidden">
      <div
        v-for="(plan, idx) in productSettings.plans"
        :key="plan.id || idx"
        class="glass-card p-4"
      >
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
            {{ plan.name || '套餐 ' + (idx + 1) }}
          </h3>
          <div class="flex items-center gap-2">
            <button class="btn btn-primary px-3 py-1" @click="openProductModal(idx)">
              <i class="fas fa-edit mr-1" /> 编辑
            </button>
            <button
              class="btn bg-red-50 px-3 py-1 text-red-600 hover:bg-red-100"
              @click="removePlan(idx)"
            >
              <i class="fas fa-trash mr-1" /> 删除
            </button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm text-gray-700 dark:text-gray-300">
          <div>ID：{{ plan.id }}</div>
          <div>
            价格：¥{{ plan.price }}
            <span class="ml-1 text-xs text-gray-500">{{ plan.priceNote }}</span>
          </div>
          <div>时长：{{ plan.durationDesc }}</div>
          <div>日配额：{{ plan.dailyLimit }}</div>
          <div v-if="plan.tag">标签：{{ plan.tag }}</div>
          <div>排序：{{ plan.order }}</div>
        </div>
        <p v-if="plan.description" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {{ plan.description }}
        </p>
      </div>
      
    </div>

    <ProductPlanModal
      v-model="showProductModal"
      :editing="editingProduct"
      :plan="planForm"
      @save="onProductModalSave"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { showToast } from '@/utils/toast'
import ProductPlanModal from '@/components/common/ProductPlanModal.vue'

const settingsStore = useSettingsStore()
const { productSettings } = storeToRefs(settingsStore)
const formatDateTime = settingsStore.formatDateTime

const showProductModal = ref(false)
const editingProduct = ref(false)
const editingProductIndex = ref(-1)
const planForm = ref({})

const openProductModal = (index) => {
  if (typeof index === 'number' && index >= 0) {
    editingProduct.value = true
    editingProductIndex.value = index
    planForm.value = { ...productSettings.value.plans[index] }
  } else {
    editingProduct.value = false
    editingProductIndex.value = -1
    planForm.value = {
      id: `plan_${productSettings.value.plans.length + 1}`,
      name: '新套餐',
      description: '',
      price: '',
      priceNote: '',
      durationDesc: '',
      dailyLimit: 0,
      tag: '',
      apiKeyTemplateId: '',
      active: true,
      order: productSettings.value.plans.length + 1
    }
  }
  showProductModal.value = true
}

const onProductModalSave = async (normalized) => {
  if (editingProduct.value && editingProductIndex.value >= 0) {
    productSettings.value.plans.splice(editingProductIndex.value, 1, normalized)
  } else {
    productSettings.value.plans.push(normalized)
  }
  // 自动保存变更
  await saveProducts()
}

const removePlan = async (idx) => {
  productSettings.value.plans.splice(idx, 1)
  // 自动保存变更
  await saveProducts()
}

const saveProducts = async () => {
  try {
    const result = await settingsStore.saveProductSettings({ plans: productSettings.value.plans })
    if (result && result.success) {
      showToast('产品配置保存成功', 'success')
    } else {
      showToast(result?.message || '保存失败', 'error')
    }
  } catch (error) {
    showToast('保存失败', 'error')
  }
}

onMounted(() => {
  if (!productSettings.value.plans || productSettings.value.plans.length === 0) {
    settingsStore.loadProductSettings().catch(() => {})
  }
})
</script>

<style scoped></style>

<template>
  <div class="settings-container">
    <div class="card p-4 sm:p-6">
      <div class="mb-4 sm:mb-6">
        <h3 class="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100 sm:mb-2 sm:text-xl">
          系统设置
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">网站定制和通知配置</p>
      </div>

      <div class="mb-6">
        <nav class="flex space-x-8">
          <button :class="tabClass('branding')" @click="activeSection = 'branding'">
            <i class="fas fa-palette mr-2"></i>
            品牌设置
          </button>
          <button :class="tabClass('products')" @click="activeSection = 'products'">
            <i class="fas fa-store mr-2"></i>
            产品配置
          </button>
          <button :class="tabClass('webhook')" @click="activeSection = 'webhook'">
            <i class="fas fa-bell mr-2"></i>
            通知设置
          </button>
        </nav>
      </div>

      <div>
        <BrandingSection v-if="activeSection === 'branding'" />
        <ProductsSection v-else-if="activeSection === 'products'" />
        <WebhookSection v-else />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import BrandingSection from './components/BrandingSection.vue'
import ProductsSection from './components/ProductsSection.vue'
import WebhookSection from './components/WebhookSection.vue'

const activeSection = ref('branding')

function tabClass(key) {
  return [
    'border-b-2 pb-2 text-sm font-medium transition-colors',
    activeSection.value === key
      ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
  ]
}
</script>

<style scoped>
.settings-container {
  min-height: calc(100vh - 300px);
}
.card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  border: 1px solid #e5e7eb;
}
:root.dark .card {
  background: #1f2937;
  border: 1px solid #374151;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}
.table-container {
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid #f3f4f6;
}
:root.dark .table-container {
  border: 1px solid #4b5563;
}
.loading-spinner {
  height: 20px;
  width: 20px;
  border-radius: 9999px;
  border: 2px solid #d1d5db;
  border-top-color: #2563eb;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

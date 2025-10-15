<template>
  <div>
    <!-- 主开关 -->
    <div class="mb-6 rounded-lg bg-white/80 p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">启用通知</h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            开启后，系统将按配置发送通知到指定平台
          </p>
        </div>
        <el-switch
          v-model="webhookConfig.enabled"
          active-text="已启用"
          inactive-text="未启用"
          @change="saveWebhookConfig"
        />
      </div>
    </div>

    <!-- 通知类型设置 -->
    <div class="bg白色/80 mb-6 rounded-lg p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80">
      <h2 class="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">通知类型</h2>
      <div class="space-y-3">
        <div
          v-for="(enabled, type) in webhookConfig.notificationTypes"
          :key="type"
          class="flex items-center justify-between"
        >
          <div>
            <span class="font-medium text-gray-700 dark:text-gray-300">{{
              getNotificationTypeName(type)
            }}</span>
            <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">{{
              getNotificationTypeDescription(type)
            }}</span>
          </div>
          <el-switch v-model="webhookConfig.notificationTypes[type]" @change="saveWebhookConfig" />
        </div>
      </div>
    </div>

    <!-- 平台列表 -->
    <div class="bg白色/80 mb-6 rounded-lg p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200">通知平台</h2>
        <el-button type="primary" @click="openAddPlatform"
          ><i class="fas fa-plus mr-2"></i> 添加平台</el-button
        >
      </div>
      <div v-if="webhookConfig.platforms && webhookConfig.platforms.length > 0" class="space-y-4">
        <div
          v-for="platform in webhookConfig.platforms"
          :key="platform.id"
          class="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center">
                <i class="mr-3 text-xl" :class="getPlatformIcon(platform.type)"></i>
                <div>
                  <h3 class="font-semibold text-gray-800 dark:text-gray-200">
                    {{ platform.name || getPlatformName(platform.type) }}
                  </h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ getPlatformName(platform.type) }}
                  </p>
                </div>
              </div>
              <div class="mt-3 space-y-1 text-sm">
                <div
                  v-if="platform.type !== 'smtp' && platform.type !== 'telegram'"
                  class="flex items-center text-gray-600 dark:text-gray-400"
                >
                  <i class="fas fa-link mr-2"></i>
                  <span class="truncate">{{ platform.url }}</span>
                </div>
                <div
                  v-if="platform.type === 'telegram'"
                  class="flex items-center text-gray-600 dark:text-gray-400"
                >
                  <i class="fas fa-robot mr-2"></i>
                  <span class="truncate">{{ platform.botToken }}</span>
                </div>
                <div
                  v-if="platform.type === 'smtp'"
                  class="flex items-center text-gray-600 dark:text-gray-400"
                >
                  <i class="fas fa-server mr-2"></i>
                  <span class="truncate"
                    >{{ platform.host }}:{{ platform.port }}
                    {{ platform.secure ? 'SSL' : '' }}</span
                  >
                </div>
              </div>
            </div>
            <div class="ml-4 flex items-center gap-2">
              <el-switch
                :model-value="platform.enabled !== false"
                @change="() => togglePlatform(platform.id)"
              />
              <el-button circle type="primary" plain @click="testPlatform(platform)"
                ><i class="fas fa-vial"></i
              ></el-button>
              <el-button circle plain @click="editPlatform(platform)"
                ><i class="fas fa-edit"></i
              ></el-button>
              <el-button circle type="danger" plain @click="deletePlatform(platform.id)"
                ><i class="fas fa-trash"></i
              ></el-button>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="py-8 text-center text-gray-500 dark:text-gray-400">
        暂无配置的通知平台，请点击"添加平台"按钮添加
      </div>
    </div>

    <!-- 高级设置 -->
    <div class="bg白色/80 rounded-lg p-6 shadow-lg backdrop-blur-sm dark:bg-gray-800/80">
      <h2 class="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">高级设置</h2>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >最大重试次数</label
          >
          <input
            v-model.number="webhookConfig.retrySettings.maxRetries"
            class="dark:text白色 mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 sm:text-sm"
            max="10"
            min="0"
            type="number"
            @change="saveWebhookConfig"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >重试延迟 (毫秒)</label
          >
          <input
            v-model.number="webhookConfig.retrySettings.retryDelay"
            class="dark:text白色 mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 sm:text-sm"
            max="10000"
            min="100"
            step="100"
            type="number"
            @change="saveWebhookConfig"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >超时时间 (毫秒)</label
          >
          <input
            v-model.number="webhookConfig.retrySettings.timeout"
            class="dark:text白色 mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 sm:text-sm"
            max="30000"
            min="1000"
            step="1000"
            type="number"
            @change="saveWebhookConfig"
          />
        </div>
      </div>
    </div>

    <!-- 测试通知按钮 -->
    <div class="mt-6 text-center">
      <el-button type="success" @click="sendTestNotification"
        ><i class="fas fa-paper-plane mr-2"></i>发送测试通知</el-button
      >
    </div>

    <WebhookPlatformModal
      v-model="showPlatformModal"
      :editing="!!editingPlatform"
      :platform="platformForm"
      :testing="testingConnection"
      @save="savePlatform"
      @test="testPlatformForm"
    />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useWebhookSettings } from '../hooks/useWebhookSettings'
import WebhookPlatformModal from '@/components/common/WebhookPlatformModal.vue'

const {
  // state
  webhookConfig,
  showPlatformModal,
  editingPlatform,
  platformForm,
  testingConnection,
  // actions
  loadWebhookConfig,
  saveWebhookConfig,
  openAddPlatform,
  editPlatform,
  deletePlatform,
  togglePlatform,
  testPlatformForm,
  savePlatform,
  sendTestNotification,
  // helpers
  getNotificationTypeName,
  getNotificationTypeDescription,
  getPlatformIcon,
  getPlatformName
} = useWebhookSettings()

onMounted(() => {
  loadWebhookConfig().catch(() => {})
})
</script>

<style scoped></style>

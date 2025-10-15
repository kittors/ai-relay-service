<template>
  <div
    class="min-h-screen px-4 pb-6 pt-24 md:px-6 md:pt-28"
    :class="isDarkMode ? 'gradient-bg-dark' : 'gradient-bg'"
  >
    <!-- 顶部导航（移动到 layout 组件） -->
    <PublicHeader v-model:current-tab="currentTab" :oem-loading="oemLoading" :oem-settings="oemSettings" />

    <!-- 主布局：单列内容区（菜单已移至 Header） -->
    <div class="mx-auto max-w-7xl">
      <!-- 内容区 -->
      <div>
        <div v-if="currentTab === 'products'" class="tab-content">
          <div class="glass-strong rounded-3xl p-4 shadow-xl md:p-6">
            <div class="mb-6 flex items-center justify-between md:mb-8">
              <div class="flex items-center gap-2 md:gap-3">
                <i class="fas fa-store text-base text-blue-500 md:text-lg" />
                <span class="text-base font-semibold text-gray-800 dark:text-gray-100 md:text-lg"
                  >套餐选择</span
                >
              </div>
            </div>

            <div
              class="mb-5 rounded-xl border border-gray-200/70 bg-white/70 p-4 text-sm text-gray-700 backdrop-blur-sm dark:border-gray-700/60 dark:bg-gray-800/50 dark:text-gray-200"
            >
              <p class="m-0">
                <i class="fas fa-rocket mr-2 text-blue-500" />
                <span>我们是 Codex 的官方中转，采用最优网络线路极速直连，包月无忧，官方授权，</span>
                <span>远超 OpenAI 官方 Plus 会员体验。</span>
              </p>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
              <div
                v-for="plan in plans"
                :key="plan.id"
                class="relative flex flex-col justify-between rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-gray-700/60 dark:bg-gray-800/60"
              >
                <div>
                  <div class="mb-2 flex items-center justify-between">
                    <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                      {{ plan.name }}
                    </h3>
                    <span
                      v-if="plan.tag"
                      class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-200"
                      >{{ plan.tag }}</span
                    >
                  </div>
                  <p class="mb-4 text-sm text-gray-600 dark:text-gray-300">
                    {{ plan.description }}
                  </p>
                  <div class="mb-4 flex items-end gap-2">
                    <span class="text-2xl font-extrabold text-gray-900 dark:text-white"
                      >¥{{ plan.price }}</span
                    >
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      {{ plan.priceNote }}
                    </span>
                  </div>
                  <ul class="mb-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <li class="flex items-center gap-2">
                      <i class="fas fa-clock w-4 text-blue-500" /> {{ plan.durationDesc }}
                    </li>
                    <li class="flex items-center gap-2">
                      <i class="fas fa-bolt w-4 text-yellow-500" />
                      每天 {{ plan.dailyLimit }} 次请求
                    </li>
                  </ul>
                </div>

                <button
                  class="mt-2 w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-blue-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  @click="goPurchase(plan.id)"
                >
                  订购
                </button>
              </div>
            </div>

            <p class="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
              点击订购后填写邮箱并扫码支付，成功后自动发放 API Key。
            </p>
          </div>
        </div>
        <div v-if="currentTab === 'stats'" class="tab-content">
          <!-- API Key 输入区域 -->
          <ApiKeyInput />

          <!-- 错误提示 -->
          <div v-if="error" class="mb-6 md:mb-8">
            <div
              class="rounded-xl border border-red-500/30 bg-red-500/20 p-3 text-sm text-red-800 backdrop-blur-sm dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200 md:p-4 md:text-base"
            >
              <i class="fas fa-exclamation-triangle mr-2" />
              {{ error }}
            </div>
          </div>

          <!-- 统计数据展示区域 -->
          <div v-if="statsData" class="fade-in">
            <div class="glass-strong rounded-3xl p-4 shadow-xl md:p-6">
              <!-- 时间范围选择器 -->
              <div class="mb-4 border-b border-gray-200 pb-4 dark:border-gray-700 md:mb-6 md:pb-6">
                <div
                  class="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center md:gap-4"
                >
                  <div class="flex items-center gap-2 md:gap-3">
                    <i class="fas fa-clock text-base text-blue-500 md:text-lg" />
                    <span class="text-base font-medium text-gray-700 dark:text-gray-200 md:text-lg"
                      >统计时间范围</span
                    >
                  </div>
                  <div class="flex w-full gap-2 md:w-auto">
                    <button
                      class="flex flex-1 items-center justify-center gap-1 px-4 py-2 text-xs font-medium md:flex-none md:gap-2 md:px-6 md:text-sm"
                      :class="['period-btn', { active: statsPeriod === 'daily' }]"
                      :disabled="loading || modelStatsLoading"
                      @click="switchPeriod('daily')"
                    >
                      <i class="fas fa-calendar-day text-xs md:text-sm" />
                      今日
                    </button>
                    <button
                      class="flex flex-1 items-center justify-center gap-1 px-4 py-2 text-xs font-medium md:flex-none md:gap-2 md:px-6 md:text-sm"
                      :class="['period-btn', { active: statsPeriod === 'monthly' }]"
                      :disabled="loading || modelStatsLoading"
                      @click="switchPeriod('monthly')"
                    >
                      <i class="fas fa-calendar-alt text-xs md:text-sm" />
                      本月
                    </button>
                  </div>
                </div>
              </div>

              <!-- 基本信息和统计概览 -->
              <StatsOverview />

              <!-- Token 分布和限制配置 -->
              <div
                class="mb-6 mt-6 grid grid-cols-1 gap-4 md:mb-8 md:mt-8 md:gap-6 xl:grid-cols-2 xl:items-stretch"
              >
                <TokenDistribution class="h-full" />
                <template v-if="multiKeyMode">
                  <AggregatedStatsCard class="h-full" />
                </template>
                <template v-else>
                  <LimitConfig class="h-full" />
                </template>
              </div>

              <!-- 模型使用统计 -->
              <ModelUsageStats />
            </div>
          </div>
        </div>

        <div v-else-if="currentTab === 'tutorial'" class="tab-content">
          <div class="glass-strong rounded-3xl shadow-xl">
            <TutorialView />
          </div>
        </div>
      </div>
    </div>
    <PurchaseDialog
      :show="showPurchase"
      :plan="selectedPlan"
      @close="showPurchase = false"
      @issued="onKeyIssued"
    />
    <KeyIssuedDialog
      :show="showKeyDialog"
      :api-key="issuedApiKey"
      :oem-settings="oemSettings"
      @close="showKeyDialog = false"
    />
  </div>
</template>

<script setup>
import PublicHeader from '@/components/layout/PublicHeader.vue'
import ApiKeyInput from '@/components/apistats/ApiKeyInput.vue'
import StatsOverview from '@/components/apistats/StatsOverview.vue'
import TokenDistribution from '@/components/apistats/TokenDistribution.vue'
import LimitConfig from '@/components/apistats/LimitConfig.vue'
import AggregatedStatsCard from '@/components/apistats/AggregatedStatsCard.vue'
import ModelUsageStats from '@/components/apistats/ModelUsageStats.vue'
import TutorialView from '../TutorialView.vue'
import PurchaseDialog from './components/PurchaseDialog.vue'
import KeyIssuedDialog from './components/KeyIssuedDialog.vue'
import { useApiStatsView } from './hooks/useApiStatsView'

const {
  // tabs
  currentTab,
  // products
  plans,
  showPurchase,
  selectedPlan,
  showKeyDialog,
  issuedApiKey,
  goPurchase,
  onKeyIssued,
  // theme
  isDarkMode,
  // store state
  // expose for template bindings
  loading,
  modelStatsLoading,
  oemLoading,
  error,
  statsPeriod,
  statsData,
  oemSettings,
  multiKeyMode,
  // actions used by template
  switchPeriod
} = useApiStatsView()
</script>

<style scoped>
/* 渐变背景（明亮清新的蓝色主题） */
.gradient-bg {
  /* 由浅到深的清爽蓝色渐变 */
  background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 45%, #93c5fd 100%);
  background-attachment: fixed;
  min-height: 100vh;
  position: relative;
}

/* 暗色模式的渐变背景 */
.gradient-bg-dark {
  /* 深色模式下的蓝灰渐变，偏冷静但不沉闷 */
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
  background-attachment: fixed;
  min-height: 100vh;
  position: relative;
}

.gradient-bg::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  /* 柔和的天蓝/青色光晕，营造清新氛围 */
  background:
    radial-gradient(circle at 20% 80%, rgba(14, 165, 233, 0.18) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.18) 0%, transparent 50%),
    radial-gradient(circle at 40% 40%, rgba(147, 197, 253, 0.12) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

/* 暗色模式的背景覆盖 */
.gradient-bg-dark::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    radial-gradient(circle at 20% 80%, rgba(56, 189, 248, 0.12) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.12) 0%, transparent 50%),
    radial-gradient(circle at 40% 40%, rgba(30, 64, 175, 0.1) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

/* 玻璃态效果 - 使用CSS变量 */
.glass-strong {
  background: var(--glass-strong-color);
  backdrop-filter: blur(25px);
  border: 1px solid var(--border-color);
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  position: relative;
  z-index: 1;
}

/* 暗色模式的玻璃态效果 */
:global(.dark) .glass-strong {
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(55, 65, 81, 0.3),
    inset 0 1px 0 rgba(75, 85, 99, 0.2);
}

/* 标题渐变（蓝色主题） */
.header-title {
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 700;
  letter-spacing: -0.025em;
}



/* 顶部导航样式已移至 PublicHeader 组件 */

/* 时间范围按钮样式 */
.period-btn {
  background: rgba(255, 255, 255, 0.7);
  color: #1f2937;
  border: 1px solid rgba(229, 231, 235, 0.8);
  border-radius: 0.75rem;
  transition: all 0.2s ease;
}

.period-btn.active {
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
  color: white;
  border-color: rgba(59, 130, 246, 0.8);
  box-shadow:
    0 6px 16px rgba(59, 130, 246, 0.2),
    inset 0 1px 1px rgba(255, 255, 255, 0.2);
}

.period-btn:not(.active):hover {
  background: rgba(255, 255, 255, 0.85);
  color: #111827;
  border-color: rgba(209, 213, 219, 0.8);
}

:global(html.dark) .period-btn:not(.active):hover {
  background: rgba(75, 85, 99, 0.6);
  color: #ffffff;
  border-color: rgba(107, 114, 128, 0.8);
}

/* Tab 胶囊按钮样式 */
.tab-pill-button {
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-weight: 500;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  flex: 1;
  justify-content: center;
}

/* 暗夜模式下的Tab按钮基础样式 */
:global(html.dark) .tab-pill-button {
  color: rgba(209, 213, 219, 0.8);
}

@media (min-width: 768px) {
  .tab-pill-button {
    padding: 0.625rem 1.25rem;
    flex: none;
  }
}

.tab-pill-button:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

:global(html.dark) .tab-pill-button:hover {
  color: #f3f4f6;
  background: rgba(100, 116, 139, 0.2);
}

.tab-pill-button.active {
  background: white;
  color: #2563eb; /* blue-600 */
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

:global(html.dark) .tab-pill-button.active {
  background: rgba(71, 85, 105, 0.9);
  color: #f3f4f6;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.3),
    0 2px 4px -1px rgba(0, 0, 0, 0.2);
}

.tab-pill-button i {
  font-size: 0.875rem;
}

/* Tab 内容切换动画 */
.tab-content {
  animation: tabFadeIn 0.4s ease-out;
}

@keyframes tabFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 动画效果 */
.fade-in {
  animation: fadeIn 0.6s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 侧边导航卡片和按钮（全新布局样式） */
.side-nav-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.side-tab {
  display: inline-flex;
  align-items: center;
  width: 100%;
  border-radius: 14px;
  padding: 0.625rem 0.875rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #1f2937; /* gray-800 */
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(229, 231, 235, 0.6);
  transition: all 0.25s ease;
}

.side-tab:hover {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(209, 213, 219, 0.9);
  transform: translateY(-1px);
}
</style>

<template>
  <header class="page-header fixed left-0 right-0 top-0 z-30">
    <div class="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 md:gap-4 md:px-4 md:py-3">
      <div class="min-w-0 flex-1">
        <LogoTitle
          :loading="oemLoading"
          :logo-src="oemSettings.siteIconData || oemSettings.siteIcon"
          :subtitle="subtitle"
          :title="oemSettings.siteName"
          title-class="truncate"
          :hide-subtitle-on-mobile="true"
        />
      </div>

      <div class="flex flex-shrink-0 items-center gap-2 md:gap-4">
        <!-- 桌面：菜单 -->
        <nav class="hidden items-center gap-1 md:flex">
          <button :class="['menu-link', { active: currentTab === 'products' }]" @click="setTab('products')">
            产品
          </button>
          <button :class="['menu-link', { active: currentTab === 'stats' }]" @click="setTab('stats')">
            统计查询
          </button>
          <button :class="['menu-link', { active: currentTab === 'tutorial' }]" @click="setTab('tutorial')">
            使用教程
          </button>
          <router-link
            v-if="!oemLoading && oemSettings.showAdminButton === true"
            class="menu-link"
            to="/dashboard"
            >管理后台</router-link
          >
        </nav>

        <!-- 移动端：菜单按钮 -->
        <button
          class="mobile-menu-btn inline-flex h-9 w-9 items-center justify-center rounded-xl md:hidden"
          aria-label="菜单"
          :aria-expanded="mobileMenuOpen ? 'true' : 'false'"
          @click.stop="toggleMobileMenu"
        >
          <i class="fas fa-ellipsis-v text-[15px]"></i>
        </button>

        <!-- 主题切换按钮 -->
        <div class="flex items-center">
          <ThemeToggle mode="dropdown" />
        </div>

        <!-- 移动端菜单下拉 -->
        <div v-if="mobileMenuOpen" ref="menuRef" class="mobile-menu-dropdown md:hidden" @click.stop>
          <button class="mobile-menu-item" @click="chooseTab('products')">
            <i class="fas fa-store w-4"></i>
            <span>产品</span>
          </button>
          <button class="mobile-menu-item" @click="chooseTab('stats')">
            <i class="fas fa-chart-line w-4"></i>
            <span>统计查询</span>
          </button>
          <button class="mobile-menu-item" @click="chooseTab('tutorial')">
            <i class="fas fa-book w-4"></i>
            <span>使用教程</span>
          </button>
          <router-link
            v-if="!oemLoading && oemSettings.showAdminButton === true"
            class="mobile-menu-item"
            to="/dashboard"
            @click="mobileMenuOpen = false"
          >
            <i class="fas fa-tools w-4"></i>
            <span>管理后台</span>
          </router-link>
          <router-link
            v-if="oemSettings.ldapEnabled"
            class="mobile-menu-item"
            to="/user-login"
            @click="mobileMenuOpen = false"
          >
            <i class="fas fa-user w-4"></i>
            <span>用户登录</span>
          </router-link>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import LogoTitle from '@/components/common/LogoTitle.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'

const props = defineProps({
  currentTab: { type: String, default: 'products' },
  oemLoading: { type: Boolean, default: false },
  oemSettings: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['update:currentTab'])

const subtitle = computed(() => {
  if (props.currentTab === 'products') return '选择合适的套餐，立即使用'
  if (props.currentTab === 'stats') return 'API Key 使用统计'
  return '使用教程'
})

const setTab = (tab) => emit('update:currentTab', tab)

// 移动端菜单交互
const mobileMenuOpen = ref(false)
const menuRef = ref(null)
const toggleMobileMenu = () => {
  mobileMenuOpen.value = !mobileMenuOpen.value
}
const onDocClick = (e) => {
  if (!mobileMenuOpen.value) return
  if (menuRef.value && !menuRef.value.contains(e.target)) {
    mobileMenuOpen.value = false
  }
}
const chooseTab = (tab) => {
  setTab(tab)
  mobileMenuOpen.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<style scoped>
/* 顶部导航样式（使用全局主题变量，暗黑模式更柔和） */
.page-header {
  background: var(--surface-color);
  backdrop-filter: saturate(1.2) blur(8px);
  border-bottom: 1px solid var(--border-color);
}

:global(.dark) .page-header {
  background: rgba(17, 24, 39, 0.75);
}

.menu-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid transparent;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  transition: all 0.2s ease;
}

.menu-link:hover {
  background: rgba(255, 255, 255, 0.55);
  border-color: rgba(209, 213, 219, 0.7);
}

:global(.dark) .menu-link:hover {
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(100, 116, 139, 0.5);
}

.menu-link.active {
  color: #fff;
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow:
    0 6px 16px rgba(59, 130, 246, 0.18),
    inset 0 1px 1px rgba(255, 255, 255, 0.2);
}

:global(.dark) .menu-link.active {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.9) 0%, rgba(99, 102, 241, 0.9) 100%);
  border-color: rgba(59, 130, 246, 0.45);
}

/* 用户登录按钮（保持适度对比） */
.user-login-button {
  background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.28);
  text-decoration: none;
  box-shadow:
    0 4px 12px rgba(56, 189, 248, 0.22),
    inset 0 1px 1px rgba(255, 255, 255, 0.18);
  position: relative;
  overflow: hidden;
  font-weight: 600;
}

:global(.dark) .user-login-button {
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
  border: 1px solid rgba(52, 211, 153, 0.38);
  color: white;
  box-shadow:
    0 4px 12px rgba(52, 211, 153, 0.28),
    inset 0 1px 1px rgba(255, 255, 255, 0.06);
}

.user-login-button:hover {
  transform: translateY(-2px) scale(1.02);
}

/* 移动端按钮与下拉 */
.mobile-menu-btn {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(209, 213, 219, 0.6);
}
:global(.dark) .mobile-menu-btn {
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(100, 116, 139, 0.5);
  color: #e5e7eb;
}

.mobile-menu-dropdown {
  position: absolute;
  top: 48px;
  right: 12px;
  width: 200px;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  padding: 6px;
  z-index: 9999;
}

.mobile-menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  color: var(--text-primary);
}
.mobile-menu-item:hover {
  background: rgba(148, 163, 184, 0.12);
}
</style>

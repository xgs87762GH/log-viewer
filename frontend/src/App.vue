<template>
  <div class="app-shell">
    <!-- 栏1：一级导航（常驻） -->
    <NavPrimary />
    <!-- 栏2：二级导航（仅日志聚合） -->
    <NavSecondary v-if="nav.view === 'viewer'" />
    <!-- 栏3：主内容 -->
    <main class="main">
      <keep-alive>
        <component :is="viewComp" :key="nav.view" />
      </keep-alive>
    </main>
    <SettingsModal />
  </div>
</template>

<script setup>
/**
 * 三栏壳层：| 一级导航 | 二级导航(可选) | 主内容 |
 * 导航状态见 useNavigation；业务数据见 useLogs。
 * 主视图 keep-alive：切仪表盘/统计不拆掉 LogViewer，避免重复下载与丢滚动态。
 */
import { computed, defineAsyncComponent, onMounted } from 'vue'
import { useLogs } from './composables/useLogs'
import { useSettings } from './composables/useSettings'
import { useNavigation } from './composables/useNavigation'
import { setupPresenceLifecycle } from './composables/usePresence'
import NavPrimary from './components/nav/NavPrimary.vue'
import NavSecondary from './components/nav/NavSecondary.vue'

const Dashboard = defineAsyncComponent(() => import('./components/dashboard/Dashboard.vue'))
const AccessStats = defineAsyncComponent(() => import('./components/stats/AccessStats.vue'))
const LogViewer = defineAsyncComponent(() => import('./components/viewer/LogViewer.vue'))
const SettingsModal = defineAsyncComponent(() => import('./components/settings/SettingsModal.vue'))

const logs = useLogs()
const settings = useSettings()
const nav = useNavigation()

const viewComp = computed(() => {
  if (nav.view === 'dashboard') return Dashboard
  if (nav.view === 'stats') return AccessStats
  return LogViewer
})

settings.apply()
const configReady = logs.loadConfig().catch(err => console.error('加载配置失败:', err))

onMounted(async () => {
  setupPresenceLifecycle()
  if (!localStorage.getItem('log_viewer_settings_init')) {
    localStorage.setItem('log_viewer_settings_init', 'true')
  }
  settings.apply()
  await configReady
  nav.initUrlSync()
})
</script>

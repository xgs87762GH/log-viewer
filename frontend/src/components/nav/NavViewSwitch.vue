<template>
  <nav class="l1" :class="{ collapsed }" aria-label="主菜单">
    <button
      type="button"
      class="item"
      :class="{ on: nav.view === 'dashboard' }"
      :title="collapsed ? '仪表盘' : undefined"
      @click="nav.setView('dashboard')"
    >
      <el-icon :size="18"><Grid /></el-icon>
      <span v-show="!collapsed" class="label">仪表盘</span>
    </button>
    <button
      type="button"
      class="item"
      :class="{ on: nav.view === 'viewer' }"
      :title="collapsed ? '日志聚合' : undefined"
      @click="nav.setView('viewer')"
    >
      <el-icon :size="18"><Document /></el-icon>
      <span v-show="!collapsed" class="label">日志聚合</span>
    </button>
    <button
      type="button"
      class="item"
      :class="{ on: nav.view === 'stats' }"
      :title="collapsed ? '统计' : undefined"
      @click="nav.setView('stats')"
    >
      <el-icon :size="18"><DataAnalysis /></el-icon>
      <span v-show="!collapsed" class="label">统计</span>
    </button>
  </nav>
</template>

<script setup>
/**
 * NavViewSwitch —— 轻量 L1（不用 ElMenu collapse，避免额外布局抖动）
 */
import { Grid, Document, DataAnalysis } from '@element-plus/icons-vue'
import { useNavigation } from '../../composables/useNavigation'

defineProps({
  collapsed: { type: Boolean, default: false },
})

const nav = useNavigation()
</script>

<style scoped>
.l1 {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
}
.l1.collapsed { padding: 0 6px; align-items: center }
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  color: var(--t2);
  font-size: 13px;
  font-weight: 600;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  transition: background .12s, color .12s;
}
.l1.collapsed .item {
  width: 40px;
  height: 40px;
  padding: 0;
  justify-content: center;
}
.item:hover { background: var(--s2); color: var(--t1) }
.item.on {
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--el-color-primary) 28%, transparent);
}
.label { white-space: nowrap }
</style>

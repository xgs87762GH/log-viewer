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
  gap: 6px;
  padding: 0 10px;
}
.l1.collapsed { padding: 0 6px; align-items: center }
.item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  color: var(--t2);
  font-size: 13px;
  font-weight: 600;
  padding: 11px 12px;
  border-radius: var(--r);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease),
              transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.item::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 50%;
  width: 3px;
  height: 20px;
  border-radius: 0 3px 3px 0;
  background: var(--grad-accent);
  transform: translateY(-50%) scaleY(0);
  transition: transform var(--dur) var(--ease);
}
.l1.collapsed .item::before { display: none }
.l1.collapsed .item {
  width: 40px;
  height: 40px;
  padding: 0;
  justify-content: center;
}
.item:hover { background: var(--surf-hover); color: var(--t1); transform: translateX(2px) }
.item.on {
  color: var(--ac);
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--ac) 16%, transparent),
    color-mix(in srgb, var(--ac) 4%, transparent));
  border-color: color-mix(in srgb, var(--ac) 26%, transparent);
  box-shadow: var(--sh-1);
}
.item.on::before { transform: translateY(-50%) scaleY(1) }
.label { white-space: nowrap }
</style>

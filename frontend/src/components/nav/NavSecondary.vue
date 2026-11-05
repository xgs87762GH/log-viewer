<template>
  <aside class="nav-secondary" :class="{ collapsed: nav.navL2Collapsed }">
    <header class="hd">
      <template v-if="!nav.navL2Collapsed">
        <span class="ui-eyebrow">环境 / 模块</span>
        <span class="ui-chip ui-chip--accent hd-count">{{ nav.services.length }}</span>
      </template>
      <el-tooltip
        :content="nav.navL2Collapsed ? '展开二级导航' : '缩小二级导航'"
        placement="right"
        :show-after="400"
      >
        <button
          type="button"
          class="ui-icon-btn hd-toggle"
          :aria-label="nav.navL2Collapsed ? '展开二级导航' : '缩小二级导航'"
          @click="nav.toggleNavL2()"
        >
          <el-icon><DArrowRight v-if="nav.navL2Collapsed" /><DArrowLeft v-else /></el-icon>
        </button>
      </el-tooltip>
    </header>

    <!-- v-show：保留模块树，避免展开时整树重建卡顿 -->
    <div v-show="!nav.navL2Collapsed" class="body">
      <NavEnvModuleTree />
    </div>
    <div
      v-show="nav.navL2Collapsed"
      class="rail"
      role="button"
      tabindex="0"
      aria-label="展开二级导航"
      @click="nav.toggleNavL2()"
      @keydown.enter="nav.toggleNavL2()"
    >
      <span class="rail-icon"><el-icon :size="16"><Files /></el-icon></span>
      <span class="rail-label">模块</span>
      <span class="rail-count">{{ nav.services.length }}</span>
    </div>
  </aside>
</template>

<script setup>
/**
 * NavSecondary —— 第二栏
 * 收起瞬时变宽；内容用 v-show 隐藏，不销毁组件树。
 */
import { DArrowLeft, DArrowRight, Files } from '@element-plus/icons-vue'
import { useNavigation } from '../../composables/useNavigation'
import NavEnvModuleTree from './NavEnvModuleTree.vue'

const nav = useNavigation()
</script>

<style scoped>
.nav-secondary {
  width: 264px;
  background: var(--grad-surface), var(--s1);
  border-right: 1px solid var(--bd);
  box-shadow: inset -1px 0 0 var(--hi);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-width: 0;
  contain: layout style;
}
.nav-secondary.collapsed { width: 48px }

.hd {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--bd);
  min-height: 62px;
  position: relative;
}
.hd::after {
  content: '';
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: -1px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--hi), transparent);
}
.hd-count { margin-left: auto }
.hd-toggle { width: 28px; height: 28px; font-size: 12px; flex-shrink: 0 }
.nav-secondary.collapsed .hd { justify-content: center; padding: 12px 4px }

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rail {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
  color: var(--t3);
  cursor: pointer;
  user-select: none;
  transition: color var(--dur) var(--ease);
}
.rail-icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  border: 1px solid var(--bd);
  background: var(--s2);
  color: var(--t2);
  transition: all var(--dur) var(--ease);
}
.rail:hover { color: var(--ac) }
.rail:hover .rail-icon {
  color: var(--ac);
  border-color: color-mix(in srgb, var(--ac) 40%, var(--bd));
  background: var(--surf-hover);
  transform: translateY(-1px);
}
.rail-label {
  writing-mode: vertical-rl;
  letter-spacing: .28em;
  font-size: 11px;
  font-weight: 600;
}
.rail-count {
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 2px 6px;
  border-radius: var(--r-pill);
  background: var(--s2);
  border: 1px solid var(--bd);
}
</style>
